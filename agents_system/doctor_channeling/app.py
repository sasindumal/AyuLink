"""FastAPI surface: /chat, /chat/resume, /chat/pdf, /health.

All three chat endpoints stream Server-Sent Events using the vocabulary
defined in sse.py. The compiled graph (with its Postgres checkpointer)
is built once at startup and reused for the process lifetime.
"""

from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.types import Command
from pydantic import BaseModel

from auth import get_patient_auth
from checkpointer import close_checkpointer, init_checkpointer
from graph.build import build_graph_builder
from sse import stream_graph_events

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
    }
    return StreamingResponse(
        stream_graph_events(graph, input_, config), media_type="text/event-stream"
    )


@app.post("/chat/resume")
async def chat_resume(body: ResumeRequest, auth=Depends(get_patient_auth)):
    config = {"configurable": {"thread_id": body.thread_id}}
    return StreamingResponse(
        stream_graph_events(graph, Command(resume=body.value), config),
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
    }
    return StreamingResponse(
        stream_graph_events(graph, input_, config), media_type="text/event-stream"
    )
