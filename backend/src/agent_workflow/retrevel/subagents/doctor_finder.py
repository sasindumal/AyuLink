"""doctor_finder_agent, ask_location_time, availability_check, present_top5.

doctor_finder_agent is re-entered twice via loop-back edges (after
ask_location_time and after availability_check); route_after_doctor_finder
decides which stage comes next based on the location_asked /
availability_annotated flags.
"""

from typing import Literal

from pydantic import BaseModel, Field, create_model
from langgraph.types import Command, interrupt

from utils.llm import text_llm
from src.agent_workflow.retrevel.schemas import DoctorSearchQuery
from src.agent_workflow.retrevel.state import DoctorCard, GraphState
from src.agent_workflow.retrevel.tools.neo4j_tools import (
    find_diseases_for_symptoms_hybrid,
    list_specialty_names,
)
from src.agent_workflow.retrevel.tools.postgres_tools import get_doctor_availability, search_doctors
from src.agent_workflow.retrevel.streaming import emit_thinking

_NONE_OF_THESE = "None of these"
GENERAL_PRACTITIONER = "General Practitioner"


def _match_specialty_name(query: str) -> str | None:
    """Fetches every real Specialty name from the graph and has the LLM
    decide which one (if any) the patient's free-text mention refers to —
    e.g. "cardiologist" or "heart doctor" -> "Cardiology". A dynamically
    built Literal schema constrains the model to one of the exact graph
    values (or "None of these"), so it can't hallucinate a specialty that
    doesn't actually exist in the graph."""
    if not query:
        return None

    names = list_specialty_names()
    if not names:
        return None

    options = names + [_NONE_OF_THESE]
    SpecialtyChoice: type[BaseModel] = create_model(
        "SpecialtyChoice",
        specialty=(
            Literal[tuple(options)],
            Field(..., description="Which specialty from the list the patient is referring to."),
        ),
    )

    try:
        emit_thinking("Matching that to a specialty...")
        structured = text_llm.with_structured_output(SpecialtyChoice, method="json_schema")
        result = structured.invoke(
            [
                {
                    "role": "system",
                    "content": "The patient mentioned a type of doctor or specialty. Pick which "
                    "ONE of these real specialties they mean (or 'None of these' if none fit):\n"
                    + "\n".join(f"- {n}" for n in names),
                },
                {"role": "user", "content": query},
            ]
        )
        choice = result.specialty
        return choice if choice != _NONE_OF_THESE else None
    except Exception:  # noqa: BLE001 - fall back to a cheap substring/prefix heuristic
        q = query.lower().strip()
        for name in names:
            n = name.lower()
            if q == n or q in n or n in q:
                return name
        prefix_len = min(5, len(q))
        if prefix_len >= 4:
            q_prefix = q[:prefix_len]
            for name in names:
                if name.lower().startswith(q_prefix):
                    return name
        return None


def _specialty_from_graph(symptoms: list[str]) -> str | None:
    """Same lookup disease_agent uses for the clinical path — Symptom ->
    Disease -> Specialty — so a direct doctor_search ("find me a doctor,
    I have chest pain") resolves specialty the same graph-grounded way a
    full diagnosis would, instead of the LLM guessing a specialty name
    from its own general knowledge."""
    if not symptoms:
        return None
    try:
        candidates = find_diseases_for_symptoms_hybrid(symptoms)
    except Exception:  # noqa: BLE001 - Neo4j hiccup shouldn't break doctor search
        return None
    return candidates[0].get("specialty") if candidates else None


def _resolve_query(state: GraphState) -> tuple[str | None, str | None]:
    specialty = state.get("specialty_hint")
    if specialty:
        return specialty, None

    text = " ".join(
        str(getattr(m, "content", "")) for m in state.get("messages", [])[-3:]
    )
    extracted_specialty: str | None = None
    doctor_name: str | None = None
    symptoms: list[str] = []
    is_general_case = False
    try:
        emit_thinking("Looking for a doctor...")
        structured = text_llm.with_structured_output(DoctorSearchQuery, method="json_schema")
        result: DoctorSearchQuery = structured.invoke(
            [
                {
                    "role": "system",
                    "content": "Extract what the patient is searching for: an explicitly named "
                    "specialty/type of doctor, a city, a doctor's name, and/or any symptoms or "
                    "conditions they described (if no specialty was explicitly named). Also flag "
                    "whether this looks like an everyday, non-specific case (common cold, mild "
                    "fever, minor cough, routine checkup) that a General Practitioner handles, "
                    "rather than something pointing to a specific specialist. The patient may "
                    "write in any language, including Sinhala — always output specialty, city, "
                    "doctor_name, and symptoms in English (translate as needed), since these are "
                    "matched against an English-only database and knowledge graph.",
                },
                {"role": "user", "content": text},
            ]
        )
        extracted_specialty = result.specialty
        doctor_name = result.doctor_name
        symptoms = result.symptoms
        is_general_case = result.is_general_case
    except Exception:  # noqa: BLE001 - fall back further down
        pass

    if extracted_specialty:
        # Canonicalize against the graph's real Specialty names — a
        # profession word like "cardiologist" won't ILIKE-match the stored
        # field name "Cardiology" otherwise. Falls back to the raw LLM
        # extraction if nothing in the graph resembles it, rather than
        # dropping the search filter entirely.
        canonical = _match_specialty_name(extracted_specialty)
        return canonical or extracted_specialty, doctor_name

    # A common/everyday complaint goes straight to a General Practitioner —
    # skip the specialist graph lookup entirely rather than routing a mild
    # cold or a routine checkup to e.g. Cardiology off a loosely-matched
    # symptom.
    if is_general_case:
        return GENERAL_PRACTITIONER, doctor_name

    graph_specialty = _specialty_from_graph(symptoms)
    if graph_specialty:
        return graph_specialty, doctor_name

    return None, doctor_name


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

        # The end-of-course follow-up can name one specific doctor — the
        # one who treated them (come back to me) or the one they were
        # referred on to. Narrow to that doctor when they're actually in
        # the results; if they aren't (no upcoming slots, or they've since
        # been deactivated), fall through to the full list rather than
        # showing the patient nothing at all.
        preferred_id = state.get("preferred_doctor_id")
        if preferred_id:
            narrowed = [r for r in results if str(r.get("doctorId")) == str(preferred_id)]
            if narrowed:
                results = narrowed

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
