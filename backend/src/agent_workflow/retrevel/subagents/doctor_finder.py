"""doctor_finder_agent, ask_location_time, availability_check, present_top5.

doctor_finder_agent is re-entered twice via loop-back edges (after
ask_location_time and after availability_check); route_after_doctor_finder
decides which stage comes next based on the location_asked /
availability_annotated flags.
"""

import asyncio
from datetime import date, timedelta
from typing import Literal

from langchain_core.messages import AIMessage
from pydantic import BaseModel, Field, create_model
from langgraph.types import Command, interrupt

from utils.llm import text_llm
from src.agent_workflow.retrevel.schemas import DoctorSearchQuery
from src.agent_workflow.retrevel.state import DoctorCard, GraphState
from src.agent_workflow.retrevel.tools.neo4j_tools import (
    find_diseases_for_symptoms_hybrid,
    list_specialty_names,
)
from src.agent_workflow.retrevel.tools.postgres_tools import (
    RpcError,
    get_doctor_availability,
    list_cities,
    search_doctors,
)
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


# ---------------------------------------------------------------------------
# Preference matching
#
# A DoctorSchedule is a *block* (e.g. 17:00-20:00 at one centre on one date),
# not a discrete appointment slot — so "what time?" really means "which
# block?". A time band is matched against the block's START hour.
# ---------------------------------------------------------------------------

LOOKAHEAD_DAYS = 21
# Never show fewer than this while the database still has something to
# offer. A patient who asked for "Kandy, next Tuesday" and gets one card is
# worse off than one who gets that card plus four honest near-misses.
MIN_RESULTS = 5
# Availability is one Supabase round trip PER doctor, and a bare specialty
# with no city ("find me a GP") can pool hundreds. Fetching all of them
# serially is what turned "evening, Tuesday" into a 30-second hang that
# the SSE proxy eventually killed. Only the top slice by rating gets an
# availability lookup, and those run concurrently — the pool is ranked by
# the patient's date/time preference afterwards, on this bounded subset.
AVAIL_FETCH_CAP = 18
AVAIL_CALL_TIMEOUT_S = 8

TIME_BANDS: dict[str, tuple[int, int]] = {
    "morning": (0, 12),
    "afternoon": (12, 17),
    "evening": (17, 24),
}


def _start_hour(slot: dict) -> int:
    raw = str(slot.get("startTime") or "0")
    try:
        return int(raw.split(":")[0])
    except (ValueError, IndexError):
        return 0


def _in_band(slot: dict, band: str | None) -> bool:
    if not band:
        return True
    lo, hi = TIME_BANDS.get(band, (0, 24))
    return lo <= _start_hour(slot) < hi


def _day_gap(slot: dict, date_pref: str | None) -> int:
    """Absolute distance in days between a slot and the requested date.
    0 when no date was requested, so it never perturbs ranking."""
    if not date_pref or not slot.get("date"):
        return 0
    try:
        want = date.fromisoformat(date_pref)
        got = date.fromisoformat(str(slot["date"]))
        return abs((got - want).days)
    except (ValueError, TypeError):
        return 0


def _rank_slot(slot: dict, date_pref: str | None, band: str | None) -> tuple:
    """Sort key for one of a doctor's blocks against the patient's
    preference — exact day first, then the right part of that day, then
    whatever is soonest. Lower sorts better."""
    gap = _day_gap(slot, date_pref)
    return (gap, 0 if _in_band(slot, band) else 1, str(slot.get("date") or ""), _start_hour(slot))


def _describe_relaxation(
    date_pref: str | None, band: str | None, city: str | None, best: dict | None
) -> str | None:
    """One honest sentence about how far the results drifted from what was
    asked for — or None when they didn't. Returned to the client so the
    patient is never quietly handed a different day or city than they
    picked."""
    if not best:
        return None
    if date_pref and str(best.get("date")) != date_pref:
        where = f" in {city}" if city else ""
        return (
            f"Nothing was free{where} on {date_pref}, so these are the closest "
            "available times instead."
        )
    if band and not _in_band(best, band):
        return f"No {band} slots were free on {date_pref or 'that day'} — here's what is."
    return None


async def _search_with_city_fallback(
    jwt: str, specialty: str | None, city: str | None
) -> tuple[list[dict], str | None]:
    """Doctors for a specialty, preferring the requested city but never
    returning nothing just because that one city has none.

    Returns (results, relaxation_note). The note is what the patient is
    told — an empty city is a real answer ("no cardiologist in Mannar"),
    and silently showing Colombo results under a Mannar heading would be
    a lie, so the widening is always surfaced.
    """
    if city:
        results = await search_doctors(jwt, specialty=specialty, city=city, min_rating=None)
        if results:
            return results, None
        # Nothing in that city — widen to everywhere, ranked by distance
        # later in availability_check/present_top5.
        wider = await search_doctors(jwt, specialty=specialty, city=None, min_rating=None)
        if wider:
            what = specialty or "doctor"
            return wider, f"No {what} is available in {city} right now — showing the nearest instead."
        return [], None

    return await search_doctors(jwt, specialty=specialty, city=None, min_rating=None), None


async def doctor_finder_agent(state: GraphState) -> dict:
    jwt = state["patient_jwt"]
    doctor_pool = state.get("doctor_pool", [])

    if not doctor_pool:
        specialty, _doctor_name = _resolve_query(state)
        city = state.get("location_pref")
        city = city if city and city != "nearest" else None
        results, relaxation = await _search_with_city_fallback(jwt, specialty, city)

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
                relaxation = None

        return {
            "doctor_pool": [_to_doctor_card(r) for r in results],
            "search_relaxation": relaxation,
        }

    if state.get("location_asked") and not state.get("availability_annotated"):
        city = state.get("location_pref")
        if city and city != "nearest":
            specialty, _ = _resolve_query(state)
            results, relaxation = await _search_with_city_fallback(jwt, specialty, city)
            if results:
                return {
                    "doctor_pool": [_to_doctor_card(r) for r in results],
                    "search_relaxation": relaxation,
                }

    return {}


def route_after_doctor_finder(state: GraphState) -> str:
    if not state.get("location_asked"):
        return "ask_location_time"
    if not state.get("availability_annotated"):
        return "availability_check"
    return "present_top5"


async def ask_location_time(state: GraphState) -> dict:
    """Ask where and when — as a structured picker, not free text.

    The payload carries everything the client's picker needs to render
    itself offline: the real city list (so it can't offer a city the
    search would find nothing in) and the bookable date window. Every
    field is optional; skipping all of them means "nearest, soonest",
    which is exactly what the old free-text default did.
    """
    try:
        cities = await list_cities(state["patient_jwt"])
    except RpcError:
        # A dropdown with no options is still fine — the client falls back
        # to "nearest" and the search proceeds unfiltered.
        cities = []

    today = date.today()
    resume = interrupt(
        {
            "type": "ask_location_time",
            "default": "nearest",
            "message": "Where and when suits you? Leave anything blank and I'll find the nearest, soonest option.",
            "cities": cities,
            "specialty": state.get("specialty_hint"),
            "min_date": today.isoformat(),
            "max_date": (today + timedelta(days=LOOKAHEAD_DAYS)).isoformat(),
            "time_bands": list(TIME_BANDS),
        }
    )

    location = time_pref = date_pref = band = None
    if isinstance(resume, dict):
        location = (resume.get("location") or "").strip() or None
        time_pref = (resume.get("time") or "").strip() or None
        date_pref = (resume.get("date") or "").strip() or None
        raw_band = (resume.get("time_band") or "").strip().lower() or None
        band = raw_band if raw_band in TIME_BANDS else None

    return {
        "location_pref": location or "nearest",
        "time_pref": time_pref,
        "date_pref": date_pref,
        "time_band": band,
        "location_asked": True,
    }


async def _availability_or_empty(jwt: str, doctor_id: str) -> list[dict]:
    """One doctor's blocks, but never let a single slow RPC stall the batch."""
    try:
        return await asyncio.wait_for(
            get_doctor_availability(jwt, doctor_id, lookahead_days=LOOKAHEAD_DAYS),
            timeout=AVAIL_CALL_TIMEOUT_S,
        )
    except (asyncio.TimeoutError, RpcError):
        return []


async def availability_check(state: GraphState) -> dict:
    """Attach every bookable block each shortlisted doctor holds, and pick
    the one that best matches the patient's date/time preference as the
    card's headline. Doctors with no availability at all are dropped — a
    card the patient can't act on is noise.

    Only the top AVAIL_FETCH_CAP doctors by rating get an availability
    lookup, and the lookups run concurrently: the pool for a common
    specialty is national, and one serial RPC per doctor is what made this
    step hang."""
    jwt = state["patient_jwt"]
    pool = state.get("doctor_pool", [])
    date_pref = state.get("date_pref")
    band = state.get("time_band")

    ranked_pool = sorted(pool, key=lambda c: -(c.get("rating") or 0))
    candidates = [c for c in ranked_pool if c.get("doctor_id")][:AVAIL_FETCH_CAP]

    slot_lists = await asyncio.gather(
        *(_availability_or_empty(jwt, c["doctor_id"]) for c in candidates)
    )

    annotated: list[DoctorCard] = []
    for card, slots in zip(candidates, slot_lists):
        if not slots:
            continue
        # Best match, not merely soonest: with a date/band preference the
        # headline should be the slot the patient actually asked for, so
        # the card they tap is already showing the right day.
        best = min(slots, key=lambda s: _rank_slot(s, date_pref, band))
        annotated.append(
            {
                **card,
                "channeling_center_id": best.get("channelingCenterId"),
                "channeling_center_name": best.get("channelingCenterName"),
                "address": best.get("address"),
                "city": best.get("city"),
                "doctor_schedule_id": best.get("doctorScheduleId"),
                "date": best.get("date"),
                "start_time": best.get("startTime"),
                "end_time": best.get("endTime"),
                "slots": slots,
            }
        )

    return {"doctor_pool": annotated, "availability_annotated": True}


def present_top5(state: GraphState) -> Command:
    """Rank and show the shortlist. Tapping "Book" here does NOT book —
    it hands off to choose_slot so the patient sees that doctor's real
    schedule and confirms a specific time first."""
    pool = state.get("doctor_pool", [])
    date_pref = state.get("date_pref")
    band = state.get("time_band")

    # Preference first (right day, right part of day), rating second. A
    # 4.9-rated doctor free three weeks out is not a better answer to
    # "Tuesday morning" than a 4.2 who is actually free Tuesday morning.
    ranked = sorted(
        pool,
        key=lambda c: (
            _day_gap({"date": c.get("date")}, date_pref),
            0 if _in_band({"startTime": c.get("start_time")}, band) else 1,
            -(c.get("rating") or 0),
            c.get("date") or "9999-99-99",
        ),
    )
    top5 = ranked[:MIN_RESULTS]

    relaxation = state.get("search_relaxation") or _describe_relaxation(
        date_pref,
        band,
        state.get("location_pref") if state.get("location_pref") != "nearest" else None,
        top5[0] if top5 else None,
    )

    resume = interrupt(
        {"type": "present_top5", "doctors": top5, "note": relaxation}
    )

    # The client sends back only which doctor was tapped — the slot itself
    # is chosen in the next step, against that doctor's full schedule.
    doctor_id = resume.get("doctor_id") if isinstance(resume, dict) else None
    if not doctor_id:
        # Older clients (and the "none of these" path) still send a slot
        # directly; honour it rather than dead-ending the turn.
        schedule_id = resume.get("doctor_schedule_id") if isinstance(resume, dict) else None
        selected = next((c for c in top5 if c.get("doctor_schedule_id") == schedule_id), {})
        if isinstance(resume, dict) and resume.get("date"):
            selected = {**selected, "date": resume["date"]}
        return Command(
            goto="manager_agent",
            update={"top5": top5, "selected_slot": selected, "forced_route": "booking"},
        )

    return Command(
        goto="choose_slot",
        update={"top5": top5, "selected_doctor_id": doctor_id},
    )


def choose_slot(state: GraphState) -> Command:
    """Show one doctor's whole schedule and let the patient settle on the
    exact date and time before anything is committed.

    This is the step that makes "Book" safe to tap: whatever slot the card
    was showing arrives here pre-selected, but every other block that
    doctor holds is on the table too, and the booking only happens once
    the patient confirms one.
    """
    doctor_id = state.get("selected_doctor_id")
    top5 = state.get("top5", [])
    card = next((c for c in top5 if str(c.get("doctor_id")) == str(doctor_id)), None)

    if not card:
        return Command(
            goto="manager_agent",
            update={"forced_route": "booking", "selected_slot": {}},
        )

    slots = card.get("slots") or []
    preselected = {
        "doctor_schedule_id": card.get("doctor_schedule_id"),
        "date": card.get("date"),
    }

    # A reschedule arrives here already narrowed to one doctor at one
    # centre (see booking._start_reschedule) — say so, so the patient
    # isn't left wondering why no other doctors are on offer.
    is_reschedule = bool(state.get("rescheduling_appointment_id"))
    doctor_label = f"Dr. {card.get('first_name')} {card.get('last_name')}"
    if is_reschedule:
        where = card.get("channeling_center_name")
        message = (
            f"Pick a new time with {doctor_label}"
            + (f" at {where}" if where else "")
            + "."
        )
    else:
        message = f"Pick a time with {doctor_label}."

    resume = interrupt(
        {
            "type": "choose_slot",
            "doctor": {
                "doctor_id": card.get("doctor_id"),
                "first_name": card.get("first_name"),
                "last_name": card.get("last_name"),
                "specialty": card.get("specialty"),
                "rating": card.get("rating"),
            },
            "slots": slots,
            "preselected": preselected,
            "message": message,
        }
    )

    if isinstance(resume, dict) and resume.get("cancelled"):
        # Backing out of a *reschedule* keeps the appointment that already
        # exists — falling through to a fresh doctor search would be the
        # opposite of what "never mind" means, and would leave
        # rescheduling_appointment_id armed against a later slot pick.
        if is_reschedule:
            return Command(
                goto="__end__",
                update={
                    "rescheduling_appointment_id": None,
                    "selected_doctor_id": None,
                    "top5": [],
                    "messages": [
                        AIMessage(content="No problem — I've left your appointment as it is.")
                    ],
                },
            )
        # "Back" from a search returns to the shortlist rather than booking
        # something nobody confirmed.
        return Command(
            goto="doctor_finder_agent",
            update={"availability_annotated": False, "selected_doctor_id": None},
        )

    schedule_id = resume.get("doctor_schedule_id") if isinstance(resume, dict) else None
    chosen_date = resume.get("date") if isinstance(resume, dict) else None
    chosen = next(
        (s for s in slots if s.get("doctorScheduleId") == schedule_id and s.get("date") == chosen_date),
        None,
    )

    selected: DoctorCard = {
        **{k: v for k, v in card.items() if k != "slots"},
        "doctor_schedule_id": schedule_id or preselected["doctor_schedule_id"],
        "date": chosen_date or preselected["date"],
    }
    if chosen:
        selected.update(
            {
                "channeling_center_id": chosen.get("channelingCenterId"),
                "channeling_center_name": chosen.get("channelingCenterName"),
                "address": chosen.get("address"),
                "city": chosen.get("city"),
                "start_time": chosen.get("startTime"),
                "end_time": chosen.get("endTime"),
            }
        )

    return Command(
        goto="manager_agent",
        update={
            "selected_slot": selected,
            "selected_doctor_id": None,
            "forced_route": "booking",
        },
    )
