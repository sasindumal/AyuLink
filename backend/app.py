"""FastAPI surface: /chat, /chat/resume, /chat/pdf, /health.

All three chat endpoints stream Server-Sent Events using the vocabulary
defined in sse.py. The compiled graph (with its Postgres checkpointer)
is built once at startup and reused for the process lifetime.
"""

from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel

from src.api.auth import get_patient_auth
from src.api.checkpointer import close_checkpointer, init_checkpointer
from src.agent_workflow.retrevel.agent import build_graph_builder
from src.agent_workflow.retrevel.care_events import build_event_messages, new_events
from src.agent_workflow.retrevel.tools.postgres_tools import (
    RpcError,
    treatment_by_thread,
    treatment_timeline,
)
from src.api.sse import stream_graph_events

graph = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global graph
    checkpointer = await init_checkpointer()
    graph = build_graph_builder().compile(checkpointer=checkpointer)
    yield
    await close_checkpointer()


app = FastAPI(title="AyuLink Doctor-Channeling Agents", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    thread_id: str
    message: str


class ResumeRequest(BaseModel):
    thread_id: str
    value: Any


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/chat")
async def chat(body: ChatRequest, auth=Depends(get_patient_auth)):
    jwt, patient_id = auth
    config = {"configurable": {"thread_id": body.thread_id}}
    input_ = {
        "messages": [HumanMessage(content=body.message)],
        "patient_jwt": jwt,
        "patient_id": patient_id,
        "pdf_bytes": None,
        "image_bytes": None,
    }
    return StreamingResponse(
        stream_graph_events(graph, input_, config), media_type="text/event-stream"
    )


@app.post("/chat/resume")
async def chat_resume(body: ResumeRequest, auth=Depends(get_patient_auth)):
    config = {"configurable": {"thread_id": body.thread_id}}
    # LangGraph's Command(resume=...) treats an empty dict as "no writes at
    # all" (map_command's per-task-id check is vacuously true over zero
    # keys) and raises EmptyInputError — never forward {} as-is.
    resume_value = body.value
    if isinstance(resume_value, dict) and not resume_value:
        resume_value = {"_default": True}
    return StreamingResponse(
        stream_graph_events(graph, Command(resume=resume_value), config),
        media_type="text/event-stream",
    )


@app.post("/chat/pdf")
async def chat_pdf(
    thread_id: str = Form(...), file: UploadFile = File(...), auth=Depends(get_patient_auth)
):
    jwt, patient_id = auth
    pdf_bytes = await file.read()
    config = {"configurable": {"thread_id": thread_id}}
    input_ = {
        "messages": [],
        "patient_jwt": jwt,
        "patient_id": patient_id,
        "pdf_bytes": pdf_bytes,
        "image_bytes": None,
    }
    return StreamingResponse(
        stream_graph_events(graph, input_, config), media_type="text/event-stream"
    )


@app.post("/chat/image")
async def chat_image(
    thread_id: str = Form(...), file: UploadFile = File(...), auth=Depends(get_patient_auth)
):
    jwt, patient_id = auth
    image_bytes = await file.read()
    config = {"configurable": {"thread_id": thread_id}}
    input_ = {
        "messages": [],
        "patient_jwt": jwt,
        "patient_id": patient_id,
        "pdf_bytes": None,
        "image_bytes": image_bytes,
        "image_mime": file.content_type or "image/jpeg",
    }
    return StreamingResponse(
        stream_graph_events(graph, input_, config), media_type="text/event-stream"
    )


class SyncRequest(BaseModel):
    thread_id: str


@app.post("/chat/followup")
async def chat_followup(body: SyncRequest, auth=Depends(get_patient_auth)):
    """Start the end-of-course check-in on a diagnosis.

    Called by the patient app when the course-end local notification is
    tapped (or when it notices on open that courseEndsAt has passed and
    the check-in hasn't happened). Enters the graph straight at
    course_followup rather than through intent classification, since the
    patient hasn't said anything yet — we're the ones opening the
    conversation.
    """
    jwt, patient_id = auth
    config = {"configurable": {"thread_id": body.thread_id}}
    input_ = {
        "messages": [],
        "patient_jwt": jwt,
        "patient_id": patient_id,
        "pdf_bytes": None,
        "image_bytes": None,
        "forced_route": "course_followup",
    }
    return StreamingResponse(
        stream_graph_events(graph, input_, config), media_type="text/event-stream"
    )


@app.post("/chat/sync")
async def chat_sync(body: SyncRequest, auth=Depends(get_patient_auth)):
    """Fold everything that happened to this patient outside the chat —
    the doctor starting the visit, the prescription they issued, each
    drug a pharmacy dispensed — into the conversation itself.

    The patient app calls this when it opens a diagnosis (and after a
    care push notification lands). Doing it as a pull, rather than the
    doctor/pharmacy apps pushing into someone else's chat thread, keeps
    the whole thing inside the patient's own credentials: every read
    goes through app_treatment_timeline, which is security-definer and
    checks auth.uid() owns the treatment.

    Messages are appended straight onto the thread's state rather than
    by running the graph, so a sync never re-triggers agent routing or
    disturbs a pending interrupt the patient is mid-way through
    answering. Idempotent via the timeline's stable event keys.
    """
    jwt, _ = auth
    config = {"configurable": {"thread_id": body.thread_id}}

    try:
        treatment = await treatment_by_thread(jwt, body.thread_id)
    except RpcError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    if not treatment:
        # A chat that never produced a diagnosis has no care journey.
        return {"synced": 0, "messages": [], "courseEndsAt": None}

    try:
        timeline = await treatment_timeline(jwt, treatment["id"])
    except RpcError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    snapshot = await graph.aget_state(config)
    already = (snapshot.values or {}).get("synced_event_keys") or []

    pending = new_events(timeline, already)
    messages, keys = build_event_messages(pending)

    if messages:
        await graph.aupdate_state(
            config,
            {"messages": messages, "synced_event_keys": already + keys},
        )

    # Every drug actually in the patient's hands, for the app to schedule
    # its dose reminders against. Taken from the full timeline (not just
    # the newly-synced slice) so reminders can still be set up on a later
    # visit to this screen, long after the dispensing event was posted.
    dispensed = [
        event.get("payload") or {}
        for event in (timeline.get("events") or [])
        if event.get("type") == "ITEM_DISPENSED"
    ]

    return {
        "synced": len(messages),
        "messages": [m.content for m in messages],
        "treatmentId": treatment["id"],
        "status": timeline.get("status"),
        "followupPlan": timeline.get("followupPlan"),
        "drugs": dispensed,
        # The patient app schedules its own local notification for this —
        # the OS delivers it even with the app closed, so no server-side
        # scheduler is involved.
        "courseEndsAt": timeline.get("courseEndsAt"),
    }


@app.get("/chat/history")
async def chat_history(thread_id: str, auth=Depends(get_patient_auth)):
    """Returns the current message transcript and any pending interrupt for a
    thread, so the mobile app can hydrate a 'continued' conversation
    (e.g. reopening a Treatment) without replaying the whole graph."""
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = await graph.aget_state(config)

    if not snapshot.values:
        raise HTTPException(status_code=404, detail="No conversation found for this thread")

    messages = []
    for m in snapshot.values.get("messages", []):
        role = "user" if getattr(m, "type", "") == "human" else "assistant"
        messages.append({"role": role, "content": str(getattr(m, "content", ""))})

    pending_interrupt = None
    for task in snapshot.tasks:
        if task.interrupts:
            pending_interrupt = task.interrupts[0].value
            break

    return {"messages": messages, "interrupt": pending_interrupt}
