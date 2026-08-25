"""StateGraph wiring for the doctor-channeling multi-agent system.

The checkpointer requires an async connection pool opened at FastAPI
startup, so this module exposes an uncompiled builder; app.py compiles
it once the checkpointer is ready (see checkpointer.init_checkpointer).
"""

from langgraph.graph import END, START, StateGraph

from graph.nodes.booking import booking_agent
from graph.nodes.disease import (
    ask_followup,
    disease_agent,
    explain_condition_node,
    offer_doctor,
    should_ask_followup,
)
from graph.nodes.doctor_finder import (
    ask_location_time,
    availability_check,
    doctor_finder_agent,
    present_top5,
    route_after_doctor_finder,
)
from graph.nodes.general import general_answer_agent
from graph.nodes.input_nodes import (
    document_summarizer,
    image_to_summary,
    normalise_input,
    pdf_to_images,
)
from graph.nodes.manager import manager_agent
from graph.nodes.symptom import symptom_agent
from state import GraphState

ROUTE_TARGETS = {
    "general": "general_answer_agent",
    "clinical": "symptom_agent",
    "doctor_search": "doctor_finder_agent",
    "booking": "booking_agent",
}


def _entry_router(state: GraphState) -> str:
    if state.get("pdf_bytes"):
        return "pdf_to_images"
    if state.get("image_bytes"):
        return "image_to_summary"
    return "normalise_input"


def _route_after_manager(state: GraphState) -> str:
    return state["route"]


def build_graph_builder() -> StateGraph:
    builder = StateGraph(GraphState)

    builder.add_node("normalise_input", normalise_input)
    builder.add_node("pdf_to_images", pdf_to_images)
    builder.add_node("image_to_summary", image_to_summary)
    builder.add_node("document_summarizer", document_summarizer)
    builder.add_node("manager_agent", manager_agent)
    builder.add_node("general_answer_agent", general_answer_agent)
    builder.add_node("symptom_agent", symptom_agent)
    builder.add_node("disease_agent", disease_agent)
    builder.add_node("ask_followup", ask_followup)
    builder.add_node("explain_condition_node", explain_condition_node)
    builder.add_node("offer_doctor", offer_doctor)
    builder.add_node("doctor_finder_agent", doctor_finder_agent)
    builder.add_node("ask_location_time", ask_location_time)
    builder.add_node("availability_check", availability_check)
    builder.add_node("present_top5", present_top5)
    builder.add_node("booking_agent", booking_agent)

    builder.add_conditional_edges(
        START,
        _entry_router,
        {
            "pdf_to_images": "pdf_to_images",
            "image_to_summary": "image_to_summary",
            "normalise_input": "normalise_input",
        },
    )
    builder.add_edge("pdf_to_images", "document_summarizer")
    builder.add_edge("image_to_summary", "document_summarizer")
    builder.add_edge("document_summarizer", "normalise_input")
    builder.add_edge("normalise_input", "manager_agent")

    builder.add_conditional_edges("manager_agent", _route_after_manager, ROUTE_TARGETS)

    builder.add_edge("general_answer_agent", END)

    builder.add_edge("symptom_agent", "disease_agent")
    builder.add_conditional_edges(
        "disease_agent",
        should_ask_followup,
        {"ask_followup": "ask_followup", "explain_condition_node": "explain_condition_node"},
    )
    builder.add_edge("ask_followup", "disease_agent")
    builder.add_edge("explain_condition_node", "offer_doctor")
    # offer_doctor returns a Command(goto=...) to either manager_agent or END

    builder.add_conditional_edges(
        "doctor_finder_agent",
        route_after_doctor_finder,
        {
            "ask_location_time": "ask_location_time",
            "availability_check": "availability_check",
            "present_top5": "present_top5",
        },
    )
    builder.add_edge("ask_location_time", "doctor_finder_agent")
    builder.add_edge("availability_check", "doctor_finder_agent")
    # present_top5 returns a Command(goto="manager_agent")

    builder.add_edge("booking_agent", END)

    return builder
