"""doctor_finder_agent, ask_location_time, availability_check, present_top5.

doctor_finder_agent is re-entered twice via loop-back edges (after
ask_location_time and after availability_check); route_after_doctor_finder
decides which stage comes next based on the location_asked /
availability_annotated flags.
"""

from langgraph.types import Command, interrupt

from llm import text_llm
from schemas import DoctorSearchQuery
from state import DoctorCard, GraphState
from tools.postgres_tools import get_doctor_availability, search_doctors


def _resolve_query(state: GraphState) -> tuple[str | None, str | None]:
    specialty = state.get("specialty_hint")
    if specialty:
        return specialty, None

    text = " ".join(
        str(getattr(m, "content", "")) for m in state.get("messages", [])[-3:]
    )
    try:
        structured = text_llm.with_structured_output(DoctorSearchQuery, method="json_mode")
        result: DoctorSearchQuery = structured.invoke(
            [
                {
                    "role": "system",
                    "content": "Extract the medical specialty, city, and/or doctor name the "
                    "patient is searching for from this message.",
                },
                {"role": "user", "content": text},
            ]
        )
        return result.specialty, result.doctor_name
    except Exception:  # noqa: BLE001 - fall back to an unfiltered search
        return None, None


def _to_doctor_card(record: dict) -> DoctorCard:
    return {
        "doctor_id": record.get("doctorId"),
        "first_name": record.get("doctorFirstName"),
        "last_name": record.get("doctorLastName"),
        "specialty": record.get("specialty"),
        "rating": record.get("rating"),
    }


async def doctor_finder_agent(state: GraphState) -> dict:
    jwt = state["patient_jwt"]
    doctor_pool = state.get("doctor_pool", [])

    if not doctor_pool:
        specialty, _doctor_name = _resolve_query(state)
        city = state.get("location_pref")
        city = city if city and city != "nearest" else None
        results = await search_doctors(jwt, specialty=specialty, city=city, min_rating=None)
        return {"doctor_pool": [_to_doctor_card(r) for r in results]}

    if state.get("location_asked") and not state.get("availability_annotated"):
        city = state.get("location_pref")
        if city and city != "nearest":
            specialty, _ = _resolve_query(state)
            results = await search_doctors(jwt, specialty=specialty, city=city, min_rating=None)
            if results:
                return {"doctor_pool": [_to_doctor_card(r) for r in results]}

    return {}


def route_after_doctor_finder(state: GraphState) -> str:
    if not state.get("location_asked"):
        return "ask_location_time"
    if not state.get("availability_annotated"):
        return "availability_check"
    return "present_top5"


def ask_location_time(state: GraphState) -> dict:
    resume = interrupt(
        {
            "type": "ask_location_time",
            "default": "nearest",
            "message": "Any preferred city or time? (default: nearest available)",
        }
    )
    location = None
    time_pref = None
    if isinstance(resume, dict):
        location = (resume.get("location") or "").strip() or None
        time_pref = (resume.get("time") or "").strip() or None
    return {"location_pref": location or "nearest", "time_pref": time_pref, "location_asked": True}


async def availability_check(state: GraphState) -> dict:
    jwt = state["patient_jwt"]
    pool = state.get("doctor_pool", [])
    annotated: list[DoctorCard] = []

    for card in pool:
        doctor_id = card.get("doctor_id")
        if not doctor_id:
            continue
        slots = await get_doctor_availability(jwt, doctor_id)
        if not slots:
            continue
        soonest = slots[0]
        annotated.append(
            {
                **card,
                "channeling_center_id": soonest.get("channelingCenterId"),
                "channeling_center_name": soonest.get("channelingCenterName"),
                "address": soonest.get("address"),
                "city": soonest.get("city"),
                "doctor_schedule_id": soonest.get("doctorScheduleId"),
                "date": soonest.get("date"),
                "start_time": soonest.get("startTime"),
                "end_time": soonest.get("endTime"),
            }
        )

    return {"doctor_pool": annotated, "availability_annotated": True}


def present_top5(state: GraphState) -> Command:
    pool = state.get("doctor_pool", [])
    ranked = sorted(
        pool,
        key=lambda c: (-(c.get("rating") or 0), c.get("date") or "9999-99-99"),
    )
    top5 = ranked[:5]

    resume = interrupt({"type": "present_top5", "doctors": top5})

    doctor_schedule_id = resume.get("doctor_schedule_id") if isinstance(resume, dict) else None
    date = resume.get("date") if isinstance(resume, dict) else None
    selected = next((c for c in top5 if c.get("doctor_schedule_id") == doctor_schedule_id), {})
    if date:
        selected = {**selected, "date": date}

    return Command(
        goto="manager_agent",
        update={"top5": top5, "selected_slot": selected, "forced_route": "booking"},
    )
