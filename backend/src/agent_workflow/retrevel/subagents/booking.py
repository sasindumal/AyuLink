"""booking_agent — three jobs depending on state:

1. A fresh slot was just picked (present_top5 resume) -> book it, or
   reschedule it if this turn is a reschedule-in-progress. On a
   "slot just taken" race, refreshes availability and re-presents it
   instead of failing the whole turn.
2. No fresh slot, but the thread already has a booking -> classify
   what the patient wants (cancel / reschedule / just the status) and
   act on it directly from chat.
3. Neither -> nothing to do yet.
"""

from langchain_core.messages import AIMessage
from langgraph.types import Command, interrupt

from src.agent_workflow.retrevel.schemas import BookingIntent
from utils.llm import text_llm
from src.agent_workflow.retrevel.state import GraphState
from src.agent_workflow.retrevel.streaming import emit_thinking
from src.agent_workflow.retrevel.tools.postgres_tools import (
    RpcError,
    book_appointment,
    cancel_appointment,
    get_doctor_availability,
    link_treatment_appointment,
    reschedule_appointment,
    unlink_treatment_appointment,
)

_FRESH_SEARCH_STATE = {
    "doctor_pool": [],
    "top5": [],
    "selected_slot": None,
    "location_pref": None,
    "time_pref": None,
    "location_asked": False,
    "availability_annotated": False,
}


def _generate_booking_reason(symptoms: list[str]) -> str | None:
    """A short, symptom-only reason for the appointment record — never the
    disease name or diagnosis, which the doctor should determine themselves,
    not read off a patient-submitted AI guess."""
    if not symptoms:
        return None
    try:
        prompt = (
            "Write ONE short, plain sentence (under 20 words) for a doctor's-appointment "
            "\"reason for visit\" field, describing only the symptoms below. Do NOT name or "
            "imply any disease, diagnosis, or condition — list symptoms only.\n\n"
            f"Symptoms: {', '.join(symptoms)}"
        )
        response = text_llm.invoke([{"role": "user", "content": prompt}])
        text = str(response.content).strip()
        return text or None
    except Exception:  # noqa: BLE001 - fall back to a plain symptom list
        return f"Reported symptoms: {', '.join(symptoms)}"


def _format_status(booking: dict) -> str:
    doctor = booking.get("doctor") or {}
    center = booking.get("channelingCenter") or {}
    return (
        f"Your appointment {booking.get('order_number', '')} is with "
        f"Dr. {doctor.get('firstName', '')} {doctor.get('lastName', '')} "
        f"at {center.get('name', 'the clinic')} on {booking.get('appointment_date', '')} "
        f"at {str(booking.get('start_time', ''))[:5]}. Status: {booking.get('status', 'BOOKED')}. "
        "Want me to reschedule or cancel it?"
    )


# An explicit instruction to call the appointment off. Deliberately not
# "stop" — "stop by later" and "stop taking the tablets" both contain it.
_CANCEL_WORDS = ("cancel", "don't want", "dont want", "no longer", "remove it", "call it off")
# Signals the patient wants a replacement, not just an end.
_REPLACEMENT_WORDS = (
    "another", "other", "different", "someone else", "instead", "new appointment",
    "today", "tomorrow", "earlier", "sooner", "asap",
)
_RESCHEDULE_WORDS = (
    "resched", "move", "change", "different time", "different date",
    "another time", "another date", "postpone",
)


def _keyword_intent(text: str) -> str | None:
    """A deterministic read of the message, used both as the fallback when
    structured output fails AND as a veto over the LLM's answer.

    Vetoing is justified by the asymmetry of the mistake: "cancel this and
    give me a today appointment" is genuinely ambiguous phrasing, and an
    LLM asked to pick one label lands on 'reschedule' about as often as
    'cancel'. Choosing wrong there silently leaves a real appointment
    standing that the patient believes they cancelled — which is exactly
    the failure this guard exists to stop. Returns None when the message
    carries no explicit signal, leaving the LLM's verdict intact.
    """
    t = text.lower()
    if any(w in t for w in _CANCEL_WORDS):
        # Cancelling AND asking for something else is a rebook, not a
        # bare cancel — the patient still expects to end up with a visit.
        return "rebook" if any(w in t for w in _REPLACEMENT_WORDS) else "cancel"
    return None


def _classify_intent(state: GraphState) -> str:
    text = str(state["messages"][-1].content) if state.get("messages") else ""
    forced = _keyword_intent(text)

    try:
        emit_thinking("Checking your booking...")
        structured = text_llm.with_structured_output(BookingIntent, method="json_schema")
        result: BookingIntent = structured.invoke(
            [
                {
                    "role": "system",
                    "content": "The patient already has a booked appointment. Classify what they "
                    "want to do about it from their latest message.",
                },
                {"role": "user", "content": text},
            ]
        )
        action = result.action
    except Exception:  # noqa: BLE001 - keyword fallback if structured output fails
        t = text.lower()
        if forced:
            return forced
        if any(w in t for w in _RESCHEDULE_WORDS):
            return "reschedule"
        return "status"

    # The veto. An explicit "cancel" may only resolve to cancel or rebook;
    # the LLM still gets to say which of the two, since it reads intent
    # better than a word list does.
    if forced and action not in ("cancel", "rebook"):
        return forced
    return action


async def booking_agent(state: GraphState):
    jwt = state["patient_jwt"]
    slot = state.get("selected_slot") or {}
    doctor_schedule_id = slot.get("doctor_schedule_id")
    date = slot.get("date")
    existing = state.get("booking_result")

    # Self-healing guard for threads whose checkpoint predates the fix that
    # clears selected_slot after a successful booking: if the "fresh" slot
    # is actually the same slot already reflected in booking_result, it's
    # stale leftover, not a new pick — don't try to re-book it.
    is_stale_leftover = bool(
        existing
        and doctor_schedule_id
        and existing.get("doctor_schedule_id") == doctor_schedule_id
        and str(existing.get("appointment_date")) == str(date)
    )

    if doctor_schedule_id and date and not is_stale_leftover:
        return await _commit_booking(state, jwt, doctor_schedule_id, date)

    if not existing:
        return {"messages": [AIMessage(content="I don't have a slot selected to book yet — please pick a doctor first.")]}

    intent = _classify_intent(state)

    if intent == "cancel":
        return await _cancel_booking(state, jwt, existing)

    if intent == "rebook":
        return await _cancel_and_search(state, jwt, existing)

    if intent == "reschedule":
        return await _start_reschedule(state, jwt, existing)

    if intent == "new_booking":
        # An ADDITIONAL appointment, keeping this one. Previously fell
        # through to the status message below, so asking for a second
        # booking just got the first one read back at you.
        update = dict(_FRESH_SEARCH_STATE)
        update["rescheduling_appointment_id"] = None
        return Command(goto="doctor_finder_agent", update=update)

    return {"messages": [AIMessage(content=_format_status(existing))]}


async def _cancel_and_search(state: GraphState, jwt: str, existing: dict):
    """"Cancel this and get me something else." Cancels first, then hands
    off to a fresh doctor search.

    Cancelling before a replacement is secured is the deliberate order:
    the patient gave an explicit instruction to cancel, and leaving a real
    appointment standing because the search might come up short would mean
    quietly not doing the one thing they actually asked for. The
    confirmation message says plainly that it is gone, so the state is
    never a surprise if the search then finds nothing.
    """
    order = existing.get("order_number") or "your appointment"
    try:
        await cancel_appointment(jwt, existing["id"])
    except RpcError as exc:
        return {"messages": [AIMessage(content=f"Couldn't cancel that: {exc}")]}

    treatment_id = state.get("treatment_id")
    if treatment_id:
        try:
            await unlink_treatment_appointment(jwt, treatment_id)
        except RpcError:
            pass

    update = {
        "booking_result": None,
        "rescheduling_appointment_id": None,
        "messages": [
            AIMessage(content=f"{order} is cancelled. Let me find you another option.")
        ],
    }
    update.update(_FRESH_SEARCH_STATE)
    return Command(goto="doctor_finder_agent", update=update)


async def _start_reschedule(state: GraphState, jwt: str, existing: dict):
    """Rescheduling means the same doctor at the same place, at a
    different time — so it goes straight to that doctor's remaining slots
    at that one centre, skipping the specialty-wide search entirely.

    Sending someone re-picking a time back through "which city? which
    doctor?" is not a reschedule, it's a re-booking; and offering the same
    doctor's slots at a clinic on the other side of the island is an
    excellent way to send a patient to the wrong building. Wanting a
    different doctor or centre is a cancel-then-book, which the cancel
    intent already handles.
    """
    doctor = existing.get("doctor") or {}
    center = existing.get("channelingCenter") or {}
    doctor_id = doctor.get("id")
    center_id = center.get("id")

    if not doctor_id:
        # Nothing to narrow to (shouldn't happen for a real booking) —
        # fall back to the old full search rather than dead-ending.
        update = {"rescheduling_appointment_id": existing.get("id")}
        update.update(_FRESH_SEARCH_STATE)
        return Command(goto="doctor_finder_agent", update=update)

    try:
        slots = await get_doctor_availability(jwt, doctor_id, lookahead_days=21)
    except RpcError as exc:
        return {"messages": [AIMessage(content=f"Couldn't load their other times: {exc}")]}

    if center_id:
        slots = [s for s in slots if str(s.get("channelingCenterId")) == str(center_id)]

    if not slots:
        where = f" at {center.get('name')}" if center.get("name") else ""
        return {
            "messages": [
                AIMessage(
                    content=(
                        f"Dr. {doctor.get('firstName', '')} {doctor.get('lastName', '')}".strip()
                        + f" has no other available times{where} in the next 3 weeks. "
                        "I can cancel this appointment and find you a different doctor if you'd like."
                    )
                )
            ]
        }

    # choose_slot reads the doctor's card (with its slots) out of top5, so
    # a one-card shortlist reuses that node exactly as the search path does.
    card = {
        "doctor_id": doctor_id,
        "first_name": doctor.get("firstName"),
        "last_name": doctor.get("lastName"),
        "specialty": doctor.get("specialty"),
        "rating": doctor.get("rating"),
        "channeling_center_id": center_id,
        "channeling_center_name": center.get("name"),
        "address": center.get("address"),
        "city": center.get("city"),
        "doctor_schedule_id": slots[0].get("doctorScheduleId"),
        "date": slots[0].get("date"),
        "start_time": slots[0].get("startTime"),
        "end_time": slots[0].get("endTime"),
        "slots": slots,
    }

    return Command(
        goto="choose_slot",
        update={
            "rescheduling_appointment_id": existing.get("id"),
            "top5": [card],
            "selected_doctor_id": doctor_id,
            "selected_slot": None,
        },
    )


async def _cancel_booking(state: GraphState, jwt: str, existing: dict) -> dict:
    try:
        await cancel_appointment(jwt, existing["id"])
    except RpcError as exc:
        return {"messages": [AIMessage(content=f"Couldn't cancel that: {exc}")]}

    treatment_id = state.get("treatment_id")
    if treatment_id:
        try:
            await unlink_treatment_appointment(jwt, treatment_id)
        except RpcError:
            pass

    return {
        "booking_result": None,
        "rescheduling_appointment_id": None,
        "messages": [AIMessage(content="Done — your appointment has been cancelled. Let me know if you'd like to book a different one.")],
    }


async def _commit_booking(state: GraphState, jwt: str, doctor_schedule_id: str, date: str):
    reschedule_id = state.get("rescheduling_appointment_id")
    reason = _generate_booking_reason(state.get("symptoms", []))

    try:
        if reschedule_id:
            result = await reschedule_appointment(jwt, reschedule_id, doctor_schedule_id, date)
        else:
            result = await book_appointment(jwt, doctor_schedule_id, date, reason=reason)
    except RpcError as exc:
        if "just booked" in str(exc).lower() or "taken" in str(exc).lower():
            return await _retry_after_race(state, jwt, doctor_schedule_id, exc)
        return {"messages": [AIMessage(content=f"Booking failed: {exc}")]}

    order_number = result.get("order_number") if isinstance(result, dict) else None
    verb = "rescheduled" if reschedule_id else "booked"
    confirmation = (
        f"You're {verb}! Your order number is {order_number}."
        if order_number
        else f"Your appointment was {verb} successfully."
    )

    update = {
        "booking_result": result,
        "rescheduling_appointment_id": None,
        # Must clear these — otherwise the next message in this thread (e.g.
        # "cancel my appointment") still finds a "fresh" selected_slot here
        # and tries to re-book the same already-booked slot instead of
        # falling through to the manage-existing-booking branch.
        "selected_slot": None,
        "top5": [],
        "messages": [AIMessage(content=confirmation)],
    }

    if not reschedule_id:
        treatment_id = state.get("treatment_id")
        appointment_id = result.get("id") if isinstance(result, dict) else None
        if treatment_id and appointment_id:
            try:
                await link_treatment_appointment(jwt, treatment_id, appointment_id)
            except RpcError:
                pass

    return update


async def _retry_after_race(state: GraphState, jwt: str, doctor_schedule_id: str, exc: Exception):
    slot = state.get("selected_slot") or {}
    doctor_id = slot.get("doctor_id")
    refreshed = await get_doctor_availability(jwt, doctor_id) if doctor_id else []
    if not refreshed:
        return {
            "messages": [
                AIMessage(content=f"Booking failed: {exc}. No other upcoming slots found for this doctor.")
            ]
        }

    # Re-open the same slot picker the patient just used, now showing what
    # is genuinely still free. Handing back a single "here's the next one"
    # card would force a slot on someone whose original choice was taken
    # out from under them; this lets them choose again properly.
    soonest = refreshed[0]
    new_selection = interrupt(
        {
            "type": "choose_slot",
            "doctor": {
                "doctor_id": doctor_id,
                "first_name": slot.get("first_name"),
                "last_name": slot.get("last_name"),
                "specialty": slot.get("specialty"),
                "rating": slot.get("rating"),
            },
            "slots": refreshed,
            "preselected": {
                "doctor_schedule_id": soonest.get("doctorScheduleId"),
                "date": soonest.get("date"),
            },
            "message": "That time was just taken. Here's what's still free — pick another.",
        }
    )
    if isinstance(new_selection, dict) and new_selection.get("cancelled"):
        return {"messages": [AIMessage(content="Booking cancelled.")]}
    new_id = new_selection.get("doctor_schedule_id") if isinstance(new_selection, dict) else None
    new_date = new_selection.get("date") if isinstance(new_selection, dict) else None
    if new_id and new_date:
        return await _commit_booking(state, jwt, new_id, new_date)
    return {"messages": [AIMessage(content="Booking cancelled.")]}
