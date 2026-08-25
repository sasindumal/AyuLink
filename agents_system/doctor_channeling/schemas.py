"""Pydantic structured-output models used by LLM-driven nodes."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

from config import CONFIDENCE_THRESHOLD, MAX_FOLLOWUP_ROUNDS

CONFIDENCE_TAU = CONFIDENCE_THRESHOLD
MAX_ROUNDS = MAX_FOLLOWUP_ROUNDS


class RouteDecision(BaseModel):
    route: Literal["general", "clinical", "doctor_search", "booking"] = Field(
        ..., description="Which specialist agent should handle this turn."
    )


class SymptomExtraction(BaseModel):
    symptoms: list[str] = Field(
        default_factory=list,
        description="Normalized symptom phrases likely to match a medical catalog (e.g. 'headache' not 'my head hurts').",
    )


class DoctorSearchQuery(BaseModel):
    specialty: Optional[str] = Field(None, description="Medical specialty mentioned or implied, e.g. 'Cardiology'.")
    city: Optional[str] = Field(None, description="City mentioned, if any.")
    doctor_name: Optional[str] = Field(None, description="Specific doctor name mentioned, if any.")


class FollowupQuestion(BaseModel):
    question: str = Field(..., description="One short, targeted follow-up question for the patient.")
