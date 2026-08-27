"""Pydantic structured-output models used by LLM-driven nodes."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from utils.config import CONFIDENCE_THRESHOLD, MAX_FOLLOWUP_ROUNDS

CONFIDENCE_TAU = CONFIDENCE_THRESHOLD
MAX_ROUNDS = MAX_FOLLOWUP_ROUNDS


class RouteDecision(BaseModel):
    route: Literal["clinical", "doctor_search", "booking"] = Field(
        ..., description="Which specialist agent should handle this turn."
    )


class BookingIntent(BaseModel):
    action: Literal["cancel", "reschedule", "status", "new_booking"] = Field(
        ...,
        description="What the patient wants to do about their existing booking: cancel it, "
        "reschedule it to a different slot, just check its status/details, or none of these "
        "(treat as wanting a new/different booking).",
    )


class SymptomExtraction(BaseModel):
    symptoms: list[str] = Field(
        default_factory=list,
        description="Normalized symptom phrases likely to match a medical catalog (e.g. 'headache' not 'my head hurts').",
    )


class DoctorSearchQuery(BaseModel):
    specialty: Optional[str] = Field(
        None,
        description="Medical specialty ONLY if the patient explicitly named one or a type of "
        "doctor, e.g. 'find me a cardiologist' -> 'Cardiology'. Leave null if they only "
        "described symptoms/a condition without naming a specialty — that goes in 'symptoms' "
        "instead, so it can be looked up properly.",
    )
    city: Optional[str] = Field(None, description="City mentioned, if any.")
    doctor_name: Optional[str] = Field(None, description="Specific doctor name mentioned, if any.")
    symptoms: list[str] = Field(
        default_factory=list,
        description="Symptom or condition phrases mentioned (e.g. 'chest pain'), normalized "
        "toward likely medical catalog terms, if no explicit specialty was named.",
    )
    is_general_case: bool = Field(
        False,
        description="True if this looks like an everyday, non-specific complaint best seen by "
        "a General Practitioner rather than a specialist — a common cold, mild/short-lived "
        "fever, minor cough or sore throat, routine checkup, or a vague 'not feeling well' with "
        "no specific worrying symptom. False if the patient named a specialty, described a "
        "symptom pointing to a particular body system/specialist (e.g. chest pain, joint "
        "swelling, vision changes), or described something severe/persistent/alarming.",
    )


class FollowupDecision(BaseModel):
    ready_to_conclude: bool = Field(
        ...,
        description="True if the symptoms and conversation gathered so far are enough to "
        "reasonably explain a likely condition to the patient — no further question is "
        "needed. False if there is a genuinely useful follow-up question that would "
        "meaningfully help narrow down which of the candidate conditions is most likely.",
    )
    question: Optional[str] = Field(
        None,
        description="Required if ready_to_conclude is False, otherwise omit/null. The single "
        "best next question to ask the patient — about a specific symptom's presence, its "
        "duration, severity, timing, what triggers or relieves it, or an associated symptom, "
        "whichever would most help a doctor differentiate between the candidate conditions "
        "right now. Naturally phrased, plain everyday language, one short question. Never "
        "repeat something the patient already told you.",
    )


class FollowupOutcome(BaseModel):
    """How the patient answered the end-of-course check-in — did the
    treatment actually fix the problem?"""

    resolved: bool = Field(
        ...,
        description="True only when the patient clearly indicates they feel better and the "
        "problem has cleared up. False when they still have symptoms, feel worse, are "
        "unsure, or the reply is ambiguous or off-topic — it is safer to keep a diagnosis "
        "open than to close one that is still troubling someone.",
    )
