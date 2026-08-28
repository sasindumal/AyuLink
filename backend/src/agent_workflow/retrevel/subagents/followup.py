"""End-of-course check-in: how did the treatment actually go?

Entered when the patient's medication course has finished (the patient
app schedules a local notification for that moment from the
`courseEndsAt` the timeline reports, and routes them here when they tap
it — the OS delivers that notification with the app closed, so nothing
server-side needs to stay awake).

The flow:
    course_followup      ask how they're feeling now  (interrupt)
      -> resolved        offer to close the diagnosis (interrupt)
                           -> yes: mark COMPLETED
      -> not resolved    steer to the right next doctor, honouring what
                         the prescribing doctor already decided:
                           MEET_SAME_DOCTOR -> that same doctor
                           REFER_DOCTOR     -> the doctor referred to
                           NONE             -> ask same or someone new
                         then hand off to the normal doctor-search /
                         booking flow, which already handles showing
                         available places and times.

A diagnosis only ever reaches COMPLETED through the patient saying so
here — that is what replaced the old behaviour where a Treatment was
silently marked complete just because the channeling center closed out
the appointment.
"""

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command, interrupt

from src.agent_workflow.retrevel.care_events import (
    FOLLOWUP_MEET_SAME,
    FOLLOWUP_REFER,
)
from src.agent_workflow.retrevel.schemas import FollowupOutcome
from src.agent_workflow.retrevel.state import GraphState
from src.agent_workflow.retrevel.streaming import emit_thinking
from src.agent_workflow.retrevel.tools.postgres_tools import (
    RpcError,
    complete_treatment,
    treatment_by_thread,
    treatment_timeline,
)
from utils.llm import text_llm

CHECKIN_PROMPT = """You are a caring clinician following up with a patient who has just \
finished their course of medication. Write ONE short, warm message asking how they are \
feeling now and whether the problem has cleared up or is still bothering them. Keep it to \
two sentences at most, plain everyday language, no medical jargon, no bullet points.

Do not restate their dosages or re-diagnose anything — just ask how they are.

Write it in the SAME language the patient has been writing in; a sample of their own most \
recent message is given for that purpose only."""

OUTCOME_PROMPT = """Decide, from the patient's reply, whether their problem has resolved.

resolved = true only when they clearly indicate they feel better / the problem is gone.
resolved = false when they say they still have symptoms, feel worse, or are unsure.
If the reply is ambiguous or off-topic, set resolved = false — it is safer to keep a \
diagnosis open than to close one that is still troubling someone."""


def _last_human_text(messages: list, max_len: int = 300) -> str:
    for m in reversed(messages or []):
        if getattr(m, "type", "") == "human":
            return str(getattr(m, "content", ""))[:max_len]
    return ""


def _doctor_name(doctor: dict | None) -> str:
    if not doctor:
        return "your doctor"
    name = f"Dr. {doctor.get('firstName', '')} {doctor.get('lastName', '')}".strip()
    return name or "your doctor"


async def course_followup(state: GraphState, config: RunnableConfig) -> Command:
    """Ask how the patient is doing, then branch on their answer."""
    jwt = state["patient_jwt"]
    thread_id = config["configurable"]["thread_id"]

    # Re-read rather than trusting state: the prescription (and so the
    # doctor's follow-up instruction) is written by the doctor app long
    # after this thread's last turn, so it may not be in state at all.
    plan = state.get("followup_plan") or "NONE"
    referred = state.get("followup_doctor")
    treatment_id = state.get("treatment_id")
    prescriber_id = state.get("last_seen_doctor_id")
    try:
        treatment = await treatment_by_thread(jwt, thread_id)
        if treatment:
            treatment_id = treatment["id"]
            timeline = await treatment_timeline(jwt, treatment_id)
            plan = timeline.get("followupPlan") or "NONE"
            for event in timeline.get("events") or []:
                if event.get("type") == "PRESCRIPTION_ISSUED":
                    payload = event.get("payload") or {}
                    referred = payload.get("referredDoctor") or referred
                    # Who to send them back to for MEET_SAME_DOCTOR.
                    prescriber_id = (payload.get("doctor") or {}).get("id") or prescriber_id
    except RpcError:
        pass

    sample = _last_human_text(state.get("messages", []))
    try:
        emit_thinking("Checking in on how you're doing...")
        question = str(
            text_llm.invoke(
                [
                    {"role": "system", "content": CHECKIN_PROMPT},
                    {
                        "role": "user",
                        "content": (
                            "The patient has just finished their course of medication. "
                            "Sample of their own most recent message, for language only: "
                            f"{sample or 'not available, use English'}"
                        ),
                    },
                ]
            ).content
        )
    except Exception:  # noqa: BLE001 - never strand the patient on an LLM hiccup
        question = (
            "You should have finished your course of medication by now — how are you "
            "feeling? Has the problem cleared up, or is it still bothering you?"
        )

    answer = interrupt({"type": "course_followup", "question": question})
    answer_text = str(answer).strip()

    try:
        emit_thinking("Understanding how you're feeling...")
        outcome: FollowupOutcome = text_llm.with_structured_output(
            FollowupOutcome, method="json_schema"
        ).invoke(
            [
                {"role": "system", "content": OUTCOME_PROMPT},
                {"role": "user", "content": answer_text},
            ]
        )
        resolved = outcome.resolved
    except Exception:  # noqa: BLE001 - keep it open rather than wrongly closing
        resolved = False

    update = {
        "messages": [AIMessage(content=question)],
        "treatment_id": treatment_id,
        "followup_plan": plan,
        "followup_doctor": referred,
        "last_seen_doctor_id": prescriber_id,
    }

    if resolved:
        return Command(goto="offer_complete_treatment", update=update)
    return Command(goto="offer_followup_booking", update=update)


def offer_complete_treatment(state: GraphState) -> Command:
    """They're better — offer to close the diagnosis off."""
    message = (
        "That's good to hear. Shall I mark this diagnosis as completed? "
        "You can always start a new one if anything comes back."
    )
    answer = interrupt({"type": "offer_complete_treatment", "message": message})
    wants = str(answer).strip().lower() in ("yes", "y", "true", "1")

    if not wants:
        closing = "No problem — I'll leave this one open for now."
        return Command(goto="__end__", update={"messages": [AIMessage(content=closing)]})

    # Rate each doctor actually seen for this diagnosis before it
    # actually completes — see rating.py. start_doctor_ratings routes
    # straight to complete_treatment_node itself when there's nobody to
    # rate, so this is safe even for a diagnosis that never had a
    # started visit.
    return Command(goto="start_doctor_ratings", update={})


async def complete_treatment_node(state: GraphState) -> dict:
    treatment_id = state.get("treatment_id")
    if not treatment_id:
        return {"messages": [AIMessage(content="This diagnosis is already closed.")]}

    try:
        await complete_treatment(state["patient_jwt"], treatment_id)
        text = "Done — this diagnosis is now marked as completed. Take care!"
    except RpcError:
        text = (
            "I couldn't update it just now, but you can mark it complete from the "
            "Diagnoses tab. Take care!"
        )
    return {"messages": [AIMessage(content=text)]}


def offer_followup_booking(state: GraphState) -> Command:
    """Still unwell — steer to whoever the prescribing doctor nominated."""
    plan = state.get("followup_plan") or "NONE"
    referred = state.get("followup_doctor")

    if plan == FOLLOWUP_REFER and referred:
        name = _doctor_name(referred)
        specialty = referred.get("specialty")
        detail = f"{name}{f' ({specialty})' if specialty else ''}"
        message = (
            f"I'm sorry it hasn't settled. Your doctor referred you to {detail} "
            "if that happened — shall I find their available times?"
        )
    elif plan == FOLLOWUP_MEET_SAME:
        message = (
            "I'm sorry it hasn't settled. Your doctor asked you to come back and see "
            "them again if that happened — shall I find their available times?"
        )
    else:
        message = (
            "I'm sorry it hasn't settled. Shall I find you a doctor to see about this?"
        )

    answer = interrupt(
        {
            "type": "offer_followup_booking",
            "message": message,
            "plan": plan,
            "doctor": referred,
        }
    )
    wants = str(answer).strip().lower() in ("yes", "y", "true", "1")

    if not wants:
        closing = (
            "Alright. If it gets worse or you change your mind, just tell me and "
            "I'll find you a doctor."
        )
        return Command(goto="__end__", update={"messages": [AIMessage(content=closing)]})

    # Hand back to the normal search/booking flow, which already knows how
    # to show every available place and time and let the patient choose.
    update: dict = {"forced_route": "doctor_search"}
    if plan == FOLLOWUP_REFER and referred:
        update["specialty_hint"] = referred.get("specialty")
        update["preferred_doctor_id"] = referred.get("id")
    elif plan == FOLLOWUP_MEET_SAME:
        update["preferred_doctor_id"] = state.get("last_seen_doctor_id")

    return Command(goto="manager_agent", update=update)
