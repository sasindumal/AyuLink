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
from src.agent_workflow.ayu.graph import build_ayu_builder
from src.agent_workflow.retrevel.care_events import build_event_messages, new_events
from src.agent_workflow.ayu.questions import QUESTIONS, pending_indexes
from src.agent_workflow.retrevel.tools.postgres_tools import (
    _call as _call_rpc,
    RpcError,
    treatment_by_thread,
    treatment_timeline,
)
from src.api.sse import stream_graph_events

graph = None
ayu_graph = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global graph, ayu_graph
    checkpointer = await init_checkpointer()
    graph = build_graph_builder().compile(checkpointer=checkpointer)
    # Ayu is a separate graph but shares the one checkpointer — its
    # threads are namespaced by thread_id ("ayu:<patient>"), so the two
    # agents' conversations never collide.
    ayu_graph = build_ayu_builder().compile(checkpointer=checkpointer)
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


# ==============================================
# Ayu — the health-profile assistant
#
# A second agent with its own graph (src/agent_workflow/ayu). It runs a
# fixed interview to fill the patient's health profile, in English or
# Sinhala, and stores every value in English regardless.
# ==============================================


class AyuRequest(BaseModel):
    thread_id: str
    # "INTAKE"  — the full interview, run after registration.
    # "CHECKIN" — the monthly top-up, asking only what is still missing.
    mode: str = "INTAKE"


@app.post("/ayu/chat")
async def ayu_chat(body: AyuRequest, auth=Depends(get_patient_auth)):
    """Open (or reopen) Ayu. Ayu speaks first, so there is no message."""
    jwt, patient_id = auth
    config = {"configurable": {"thread_id": body.thread_id}}
    input_ = {
        "messages": [],
        "patient_jwt": jwt,
        "patient_id": patient_id,
        "mode": body.mode if body.mode in ("INTAKE", "CHECKIN") else "INTAKE",
    }
    return StreamingResponse(
        stream_graph_events(ayu_graph, input_, config), media_type="text/event-stream"
    )


@app.post("/ayu/resume")
async def ayu_resume(body: ResumeRequest, auth=Depends(get_patient_auth)):
    config = {"configurable": {"thread_id": body.thread_id}}
    resume_value = body.value
    if isinstance(resume_value, dict) and not resume_value:
        resume_value = {"_default": True}
    return StreamingResponse(
        stream_graph_events(ayu_graph, Command(resume=resume_value), config),
        media_type="text/event-stream",
    )


@app.get("/ayu/history")
async def ayu_history(thread_id: str, auth=Depends(get_patient_auth)):
    config = {"configurable": {"thread_id": thread_id}}
    snapshot = await ayu_graph.aget_state(config)
    if not snapshot.values:
        return {"messages": [], "interrupt": None, "started": False}

    messages = [
        {"role": "user" if getattr(m, "type", "") == "human" else "assistant",
         "content": str(getattr(m, "content", ""))}
        for m in snapshot.values.get("messages", [])
    ]
    pending = None
    for task in snapshot.tasks:
        if task.interrupts:
            pending = task.interrupts[0].value
            break
    return {
        "messages": messages,
        "interrupt": pending,
        "started": True,
        "saved": bool(snapshot.values.get("saved")),
    }


@app.get("/ayu/status")
async def ayu_status(auth=Depends(get_patient_auth)):
    """Whether Ayu should show itself, and why.

    The client asks this on launch instead of deciding for itself: which
    sections are still unanswered, and how long since the last nudge, are
    both facts the database owns. `dueForCheckin` is the once-a-month
    prompt — a month since the last one AND something genuinely missing,
    so a complete profile is never nagged.
    """
    jwt, _ = auth
    try:
        data = await _call_rpc(jwt, "app_get_my_health_profile", {})
    except RpcError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    profile = (data or {}).get("profile") or {}
    missing = pending_indexes(profile)
    enabled = profile.get("ayu_enabled")
    last = profile.get("ayu_last_prompted_at")
    completed = profile.get("profile_completed_at")

    due = False
    if enabled is not False and missing:
        if not completed:
            due = True
        elif last is None:
            due = True
        else:
            try:
                from datetime import datetime, timedelta, timezone

                due = datetime.fromisoformat(str(last).replace("Z", "+00:00")) < datetime.now(
                    timezone.utc
                ) - timedelta(days=30)
            except ValueError:
                due = True

    return {
        "enabled": enabled is not False,
        "language": profile.get("preferred_language") or "EN",
        "everCompleted": bool(completed),
        "missingCount": len(missing),
        "totalQuestions": len(QUESTIONS),
        "dueForCheckin": due,
    }


class AyuToggle(BaseModel):
    enabled: bool


@app.post("/ayu/enabled")
async def ayu_set_enabled(body: AyuToggle, auth=Depends(get_patient_auth)):
    """The on/off switch on the home screen."""
    jwt, _ = auth
    try:
        await _call_rpc(jwt, "app_save_my_health_profile",
                        {"p_payload": {"profile": {"ayuEnabled": body.enabled}}})
    except RpcError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"enabled": body.enabled}


@app.post("/ayu/snooze")
async def ayu_snooze(auth=Depends(get_patient_auth)):
    """Records that the patient was nudged, so the next check-in is a
    month away rather than on every app launch."""
    from datetime import datetime, timezone

    jwt, _ = auth
    try:
        await _call_rpc(
            jwt, "app_save_my_health_profile",
            {"p_payload": {"profile": {"ayuLastPromptedAt": datetime.now(timezone.utc).isoformat()}}},
        )
    except RpcError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"ok": True}
