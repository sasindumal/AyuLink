"""SSE event formatting + the astream -> SSE adapter shared by /chat and /chat/resume."""

import json
from typing import Any, AsyncIterator

from langgraph.graph.state import CompiledStateGraph


def sse_event(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_graph_events(
    graph: CompiledStateGraph,
    input_: Any,
    config: dict,
) -> AsyncIterator[str]:
    """Drives graph.astream in ['messages','updates','custom'] mode and yields
    SSE-formatted strings following the vocabulary: token, thinking, node,
    cards, interrupt, done, error.

    "thinking" chunks come from emit_thinking() (see
    src/agent_workflow/retrevel/streaming.py) via LangGraph's custom stream
    writer — a side channel that never touches graph state, so these are
    display-only: never added to `messages`, never persisted by the
    Postgres checkpointer, never replayed back to the LLM as history. They
    exist purely to fill the dead air while a structured-output LLM call
    (which can't stream token-by-token) is in flight."""
    try:
        seen_nodes: set[str] = set()
        # Some backends (e.g. LM Studio for certain models) emit a final
        # aggregate chunk repeating the whole message after real token
        # deltas — track accumulated text per message id and drop exact
        # duplicates of what's already been sent.
        accumulated: dict[str, str] = {}
        async for stream_mode, chunk in graph.astream(
            input_, config=config, stream_mode=["messages", "updates", "custom"]
        ):
            if stream_mode == "custom":
                if isinstance(chunk, dict) and chunk.get("thinking"):
                    yield sse_event("thinking", {"message": chunk["thinking"]})
                continue
            if stream_mode == "messages":
                message_chunk, metadata = chunk
                bucket = (metadata or {}).get("langgraph_node") or "default"
                # ask_followup returns the already-asked question + the
                # patient's own answer into state["messages"] (so they're
                # persisted for history/context — see disease.py) — but
                # "messages" mode streams ANY message a node returns, not
                # just fresh LLM-generated tokens, so without this skip the
                # question would show up a second time (it was already
                # sent via the "interrupt" event on the prior turn) and the
                # patient's own answer would render back as if the
                # assistant had said it.
                if bucket == "ask_followup":
                    continue
                content = getattr(message_chunk, "content", None)
                if content:
                    if isinstance(content, list):
                        text = "".join(
                            part.get("text", "") for part in content if isinstance(part, dict)
                        )
                    else:
                        text = content
                    if text:
                        # Key by source node (not message id) — some backends emit a
                        # final aggregate AIMessage with a fresh id after streaming
                        # real deltas under a different id for the same node.
                        prior = accumulated.get(bucket, "")
                        if text == prior:
                            continue
                        accumulated[bucket] = prior + text
                        yield sse_event("token", {"content": text})

            elif stream_mode == "updates":
                for node_name, node_update in chunk.items():
                    if node_name == "__interrupt__":
                        for interrupt_obj in node_update:
                            yield sse_event("interrupt", interrupt_obj.value)
                        return
                    if node_name not in seen_nodes:
                        seen_nodes.add(node_name)
                        yield sse_event("node", {"node": node_name})
                    if isinstance(node_update, dict) and node_update.get("top5"):
                        yield sse_event("cards", {"doctors": node_update["top5"]})

        yield sse_event("done", {})

    except Exception as exc:  # noqa: BLE001 - surface any failure as a terminal SSE error event
        yield sse_event("error", {"message": str(exc)})
