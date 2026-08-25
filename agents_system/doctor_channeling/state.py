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


class GraphState(TypedDict):
    messages: Annotated[list, add_messages]
    patient_jwt: str
    patient_id: str
    pdf_bytes: Optional[bytes]

    route: Optional[Literal["general", "clinical", "doctor_search", "booking"]]
    # Set by a HITL node (offer_doctor, present_top5) right before handing
    # control back to manager_agent, so it skips re-classifying the resume
    # value (e.g. "yes") and applies the forced route directly.
    forced_route: Optional[Literal["general", "clinical", "doctor_search", "booking"]]

    symptoms: list[str]
    round: int
    confidence: float
    candidate_diseases: list[dict]
    confirmed_disease: Optional[dict]
    condition_explanation: Optional[str]
    specialty_hint: Optional[str]

    location_pref: Optional[str]
    time_pref: Optional[str]
    location_asked: bool
    availability_annotated: bool
    doctor_pool: list[DoctorCard]
    top5: list[DoctorCard]
    selected_slot: Optional[DoctorCard]

    booking_result: Optional[dict]
