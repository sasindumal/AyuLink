"""Per-doctor rating loop, run right before a diagnosis is marked
complete (see followup.py's offer_complete_treatment, which routes
here on "yes" instead of straight to complete_treatment_node).

A diagnosis can involve more than one doctor over its life — the
initial GP visit, then possibly whoever they were referred to.
app_treatment_doctors_to_rate lists everyone the patient was actually
seen by (doctor_started_at set — a booking that never happened doesn't
count) for this diagnosis who they haven't rated yet. rate_doctor_node
asks about one at a time and loops back to itself for the next,
re-querying fresh each round rather than working off a list cached in
graph state — that's what makes the loop safe to resume even after a
crash mid-way through: which doctors are still unrated is always read
from the database, not from state that might be stale.

Rating input is a small structured value the CLIENT sends directly
({"rating": 1-5, "feedback": str | None} or {"skip": true}) rather
than free text an LLM has to parse — the app renders an actual star
picker, so there's no ambiguity to resolve and no reason to spend an
LLM call turning "5 stars" back into the number 5.
"""

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.types import Command, interrupt

from src.agent_workflow.retrevel.state import GraphState
from src.agent_workflow.retrevel.tools.postgres_tools import (
    RpcError,
    rate_doctor,
    treatment_doctors_to_rate,
)


def _doctor_label(doctor: dict) -> str:
    name = f"Dr. {doctor.get('firstName', '')} {doctor.get('lastName', '')}".strip()
    specialty = doctor.get("specialty")
    return f"{name} ({specialty})" if specialty else name


async def _next_unrated(state: GraphState) -> dict | None:
    """The next doctor still owed a rating this pass — from the
    database, minus anyone skipped earlier in this same pass."""
    treatment_id = state.get("treatment_id")
    if not treatment_id:
        return None
    try:
        doctors = await treatment_doctors_to_rate(state["patient_jwt"], treatment_id)
    except RpcError:
        return None

    skipped = set(state.get("rating_skipped") or [])
    for doctor in doctors:
        if doctor.get("doctorId") not in skipped:
            return doctor
    return None


async def start_doctor_ratings(state: GraphState) -> Command:
    """Entry point from offer_complete_treatment's 'yes' branch. Skips
    straight to completing if there's nobody to rate (e.g. the
    diagnosis never actually reached a started visit)."""
    doctor = await _next_unrated(state)
    if not doctor:
        return Command(goto="complete_treatment_node")

    intro = "Before we close this out, I'd like to hear how it went with each doctor you saw."
    return Command(goto="rate_doctor_node", update={"messages": [AIMessage(content=intro)]})


async def rate_doctor_node(state: GraphState) -> Command:
    doctor = await _next_unrated(state)
    if not doctor:
        return Command(goto="complete_treatment_node")

    message = f"How would you rate {_doctor_label(doctor)}? Tap a star rating, and add a comment if you'd like."
    answer = interrupt({"type": "rate_doctor", "doctor": doctor, "message": message})

    # Persisted into messages (so history/context show it, same as
    # ask_followup/course_followup) — sse.py suppresses the "messages"
    # stream echo of this node so the client only renders it once, from
    # the interrupt above.
    update: dict = {"messages": [AIMessage(content=message)]}
    saved = False

    if isinstance(answer, dict) and not answer.get("skip"):
        rating = None
        try:
            rating = int(answer.get("rating"))
        except (TypeError, ValueError):
            rating = None

        if rating is not None and 1 <= rating <= 5:
            raw_feedback = answer.get("feedback")
            feedback = str(raw_feedback).strip() if raw_feedback else None
            feedback = feedback or None
            try:
                await rate_doctor(
                    state["patient_jwt"], state["treatment_id"], doctor["doctorId"], rating, feedback
                )
                saved = True
                summary = f"{'⭐' * rating} ({rating}/5)" + (f" — {feedback}" if feedback else "")
            except RpcError:
                # Best-effort — a save failure must not stall the patient
                # from finishing the flow.
                summary = "(couldn't save this rating)"
        else:
            summary = "(skipped)"
    else:
        summary = "(skipped)"

    update["messages"].append(HumanMessage(content=summary))
    if not saved:
        update["rating_skipped"] = (state.get("rating_skipped") or []) + [doctor["doctorId"]]

    # Loop back to ask about the next doctor — re-querying at the top of
    # this same node naturally excludes the one just rated; the skip
    # list (just updated above) excludes the one just skipped.
    return Command(goto="rate_doctor_node", update=update)
