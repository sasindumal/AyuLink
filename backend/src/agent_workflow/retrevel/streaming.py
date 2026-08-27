"""Ephemeral "thinking" status pings for the chat UI while a structured-
output LLM call is in flight. with_structured_output(..., method=
"json_schema") calls don't stream token-by-token (langchain_openai warns
"Streaming with Pydantic response_format not yet supported") — without
this, the client sees dead air for however long that call takes, with no
indication anything is happening.

Uses LangGraph's custom stream writer, NOT graph state. The text passed
to emit_thinking() is never part of a node's return value, so it can
never end up in `messages`, never reaches the LangGraph Postgres
checkpointer, and is never replayed back to the LLM as conversation
history on a later turn — it only exists as a one-shot chunk on the SSE
"thinking" event (see src/api/sse.py) for exactly as long as the client
is connected to that request.
"""

from langgraph.config import get_stream_writer


def emit_thinking(text: str) -> None:
    """Best-effort — safe to call from anywhere, including outside an
    active graph run (e.g. a unit test invoking a node function
    directly, where LangGraph has no writer to hand back)."""
    try:
        get_stream_writer()({"thinking": text})
    except Exception:  # noqa: BLE001 - no active graph run, or writer unavailable
        pass
