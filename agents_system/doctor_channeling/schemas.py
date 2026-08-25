"""Pydantic structured-output models used by LLM-driven nodes."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from config import CONFIDENCE_THRESHOLD, MAX_FOLLOWUP_ROUNDS

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


class FollowupQuestion(BaseModel):
    question: str = Field(..., description="One short, targeted follow-up question for the patient.")
