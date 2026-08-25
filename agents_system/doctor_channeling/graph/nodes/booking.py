"""booking_agent — books the selected slot. On a "slot just taken" race,
refreshes that doctor's availability and re-presents it instead of
failing the whole turn."""

from langchain_core.messages import AIMessage
from langgraph.types import interrupt

from state import GraphState
from tools.postgres_tools import RpcError, book_appointment, get_doctor_availability


async def booking_agent(state: GraphState) -> dict:
    jwt = state["patient_jwt"]
    slot = state.get("selected_slot") or {}
    doctor_schedule_id = slot.get("doctor_schedule_id")
    date = slot.get("date")

    if not doctor_schedule_id or not date:
        message = "I don't have a slot selected to book yet — please pick a doctor first."
        return {"messages": [AIMessage(content=message)]}

    reason = state.get("condition_explanation")

    try:
        result = await book_appointment(jwt, doctor_schedule_id, date, reason=reason)
    except RpcError as exc:
        if "just booked" in str(exc).lower() or "taken" in str(exc).lower():
            doctor_id = slot.get("doctor_id")
            refreshed = await get_doctor_availability(jwt, doctor_id) if doctor_id else []
            if refreshed:
                soonest = refreshed[0]
                updated_card = {
                    **slot,
                    "doctor_schedule_id": soonest.get("doctorScheduleId"),
                    "date": soonest.get("date"),
                    "start_time": soonest.get("startTime"),
                    "end_time": soonest.get("endTime"),
                }
                new_selection = interrupt({"type": "present_top5", "doctors": [updated_card]})
                new_id = (
                    new_selection.get("doctor_schedule_id")
                    if isinstance(new_selection, dict)
                    else None
                )
                new_date = new_selection.get("date") if isinstance(new_selection, dict) else None
                if new_id and new_date:
                    try:
                        result = await book_appointment(jwt, new_id, new_date, reason=reason)
                    except RpcError as exc2:
                        return {"messages": [AIMessage(content=f"Booking failed: {exc2}")]}
                else:
                    return {"messages": [AIMessage(content="Booking cancelled.")]}
            else:
                return {
                    "messages": [
                        AIMessage(content=f"Booking failed: {exc}. No other upcoming slots found for this doctor.")
                    ]
                }
        else:
            return {"messages": [AIMessage(content=f"Booking failed: {exc}")]}

    order_number = result.get("order_number") if isinstance(result, dict) else None
    confirmation = (
        f"You're booked! Your order number is {order_number}."
        if order_number
        else "Your appointment was booked successfully."
    )
    return {"booking_result": result, "messages": [AIMessage(content=confirmation)]}
