"""Ayu's StateGraph — a second, separate agent alongside the diagnosis one.

Kept apart from `retrevel/agent.py` rather than bolted on as another
branch, because the two have nothing in common but the patient: the
diagnosis agent classifies free-form intent and routes; Ayu works through
a plan of health-profile sections. They share the FastAPI process, the
Postgres checkpointer and the LLM provider layer — just not the graph.

The compose -> ask -> ingest loop is three nodes rather than one for a
structural reason: a node re-runs from the top on every resume, so the
node that calls `interrupt()` must do nothing non-deterministic first.
`ask` therefore only reads the question `compose` already wrote.
"""

from langgraph.graph import END, START, StateGraph

from src.agent_workflow.ayu.nodes import (
    apply_edit,
    ask,
    compose,
    ingest,
    save_profile,
    show_report,
    start,
)
from src.agent_workflow.ayu.state import AyuState


def build_ayu_builder() -> StateGraph:
    builder = StateGraph(AyuState)

    builder.add_node("start", start)
    builder.add_node("compose", compose)
    builder.add_node("ask", ask)
    builder.add_node("ingest", ingest)
    builder.add_node("show_report", show_report)
    builder.add_node("apply_edit", apply_edit)
    builder.add_node("save_profile", save_profile)

    builder.add_edge(START, "start")
    # Everything else routes with Command(goto=...): which section is open,
    # which item is being built and which attributes are still missing are
    # values in state, not shapes in the graph.
    builder.add_edge("save_profile", END)

    return builder
