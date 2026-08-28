"""Ayu's StateGraph — a second, separate agent alongside the diagnosis one.

Kept apart from `retrevel/agent.py` rather than bolted on as another
branch, because the two have nothing in common but the patient: the
diagnosis agent classifies free-form intent and routes; Ayu runs a fixed
script to completion. Merging them would mean manager_agent having to
tell "I have a headache" from an answer to question 4 of an interview,
which is a classification problem neither agent needs to have.

They share the FastAPI process, the Postgres checkpointer and the LLM
provider layer — just not the graph.
"""

from langgraph.graph import END, START, StateGraph

from src.agent_workflow.ayu.nodes import (
    apply_edit,
    ask_question,
    save_profile,
    show_report,
    start,
)
from src.agent_workflow.ayu.state import AyuState


def build_ayu_builder() -> StateGraph:
    builder = StateGraph(AyuState)

    builder.add_node("start", start)
    builder.add_node("ask_question", ask_question)
    builder.add_node("show_report", show_report)
    builder.add_node("apply_edit", apply_edit)
    builder.add_node("save_profile", save_profile)

    builder.add_edge(START, "start")
    # start / ask_question / show_report / apply_edit all route with
    # Command(goto=...): the interview is a cursor walking one list, so
    # "what's next" is a value in state, not a graph shape.
    builder.add_edge("save_profile", END)

    return builder
