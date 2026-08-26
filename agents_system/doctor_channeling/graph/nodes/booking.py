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

from schemas import BookingIntent
from llm import text_llm
from state import GraphState
from tools.postgres_tools import (
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


def _classify_intent(state: GraphState) -> str:
    text = str(state["messages"][-1].content) if state.get("messages") else ""
    try:
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
        return result.action
    except Exception:  # noqa: BLE001 - keyword fallback if structured output fails
        t = text.lower()
        if any(w in t for w in ("cancel", "don't want", "stop", "no longer", "remove")):
            return "cancel"
        if any(w in t for w in ("resched", "move", "change", "different time", "different date", "another time", "another date")):
            return "reschedule"
        return "status"


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

    if intent == "reschedule":
        update = {"rescheduling_appointment_id": existing.get("id")}
        update.update(_FRESH_SEARCH_STATE)
        return Command(goto="doctor_finder_agent", update=update)

    return {"messages": [AIMessage(content=_format_status(existing))]}


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

    soonest = refreshed[0]
    updated_card = {
        **slot,
        "doctor_schedule_id": soonest.get("doctorScheduleId"),
        "date": soonest.get("date"),
        "start_time": soonest.get("startTime"),
        "end_time": soonest.get("endTime"),
    }
    new_selection = interrupt({"type": "present_top5", "doctors": [updated_card]})
    new_id = new_selection.get("doctor_schedule_id") if isinstance(new_selection, dict) else None
    new_date = new_selection.get("date") if isinstance(new_selection, dict) else None
    if new_id and new_date:
        return await _commit_booking(state, jwt, new_id, new_date)
    return {"messages": [AIMessage(content="Booking cancelled.")]}
