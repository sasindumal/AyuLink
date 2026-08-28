from typing import Annotated, Literal, Optional, TypedDict

from langgraph.graph.message import add_messages


class DoctorCard(TypedDict, total=False):
    doctor_id: str
    first_name: str
    last_name: str
    specialty: str
    rating: Optional[float]
    channeling_center_id: str
    channeling_center_name: str
    address: str
    city: Optional[str]
    doctor_schedule_id: str
    date: str
    start_time: str
    end_time: str
    # Every block this doctor holds in the lookahead window, as returned by
    # app_get_doctor_availability. The headline fields above are whichever
    # one best matched the patient's date/time preference; this is the full
    # list the "change the time" picker (choose_slot) is built from, so
    # opening it never needs a second round trip.
    slots: list[dict]


class GraphState(TypedDict):
    messages: Annotated[list, add_messages]
    patient_jwt: str
    patient_id: str
    pdf_bytes: Optional[bytes]
    image_bytes: Optional[bytes]
    image_mime: Optional[str]

    route: Optional[Literal["clinical", "doctor_search", "booking"]]
    # Set by a HITL node (offer_doctor, present_top5) right before handing
    # control back to manager_agent, so it skips re-classifying the resume
    # value (e.g. "yes") and applies the forced route directly.
    forced_route: Optional[Literal["clinical", "doctor_search", "booking"]]

    symptoms: list[str]
    round: int
    confidence: float
    candidate_diseases: list[dict]
    # Set by disease_agent each round — an LLM judgment call (informed by
    # the Neo4j-retrieved candidates/confidence above), not a fixed
    # question count. should_ask_followup just reads this to route.
    llm_ready_to_conclude: bool
    llm_followup_question: Optional[str]
    # {question, answer} pairs, appended by ask_followup each round — lets
    # the next round's LLM call see exactly what it already asked, so it
    # doesn't repeat itself (state["symptoms"] alone is just a flat bag of
    # answer text with no memory of which question produced which answer).
    followup_history: list[dict]
    confirmed_disease: Optional[dict]
    condition_explanation: Optional[str]
    specialty_hint: Optional[str]
    treatment_id: Optional[str]

    location_pref: Optional[str]
    time_pref: Optional[str]
    # An exact date the patient picked in the calendar (YYYY-MM-DD), and a
    # coarse part-of-day ("morning"/"afternoon"/"evening") — kept separate
    # from time_pref (free text) so the search cascade can relax them
    # independently: a date miss widens by days, a time-band miss just
    # drops the band.
    date_pref: Optional[str]
    time_band: Optional[Literal["morning", "afternoon", "evening"]]
    location_asked: bool
    availability_annotated: bool
    doctor_pool: list[DoctorCard]
    top5: list[DoctorCard]
    selected_slot: Optional[DoctorCard]
    # Which fallback rung actually produced `top5` (see doctor_finder's
    # RELAXATION_LADDER). present_top5 turns this into the one honest
    # sentence the patient reads above the cards — "nothing in Kandy on
    # the 3rd, here's the nearest instead" — instead of silently handing
    # back results that don't match what was asked for.
    search_relaxation: Optional[str]
    # The doctor whose "Book" button was tapped in present_top5. choose_slot
    # reads it to load that doctor's full schedule; it is NOT a booking —
    # nothing is committed until the patient confirms a slot.
    selected_doctor_id: Optional[str]

    # Timeline event keys already posted into this chat (see care_events).
    # Plain list, not add_messages — the sync writes the full updated list
    # each time, so a replayed sync can never double-post an event.
    synced_event_keys: list[str]
    # Set by the end-of-course check-in so the follow-up nodes know which
    # doctor the patient was told to go back to, without re-querying.
    followup_plan: Optional[Literal["NONE", "MEET_SAME_DOCTOR", "REFER_DOCTOR"]]
    followup_doctor: Optional[dict]
    # Narrows the doctor search to one specific doctor — set when the
    # patient is going back to whoever treated them, or on to whoever
    # they were referred to, rather than searching a specialty at large.
    preferred_doctor_id: Optional[str]
    last_seen_doctor_id: Optional[str]
    # Doctor ids the patient chose to skip rating, this completion pass
    # only — app_treatment_doctors_to_rate only knows about doctors
    # actually rated (a real DoctorRating row), nothing about a "not
    # now" answer, so without this the rating loop would re-query the
    # same skipped doctor forever instead of moving on.
    rating_skipped: list[str]

    booking_result: Optional[dict]
    # Set when the chat is rescheduling an existing appointment (rather than
    # making a fresh booking) — booking_agent uses this to call
    # app_reschedule_appointment instead of app_book_appointment once a new
    # slot is picked via the normal doctor-search/present_top5 flow.
    rescheduling_appointment_id: Optional[str]
