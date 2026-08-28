"""Graph state and extraction schemas for Ayu."""

from typing import Annotated, Literal, Optional, TypedDict

from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field


class ExtractedItem(BaseModel):
    """One thing the patient mentioned.

    Deliberately one shape for every list question rather than a model per
    section: allergies, conditions, medicines, surgeries and family
    history all reduce to "a labelled thing, with optional detail" — and a
    single schema means a single well-tested extraction prompt instead of
    six that drift apart. Which field means what is supplied per question
    via `item_hint`.
    """

    label: str = Field(..., description="The thing itself, ALWAYS IN ENGLISH.")
    detail: Optional[str] = Field(None, description="Any extra detail, in English.")
    severity: Optional[Literal["MILD", "MODERATE", "SEVERE", "ANAPHYLAXIS"]] = Field(
        None, description="Only for allergies, and only if the patient made it clear."
    )
    relationship: Optional[str] = Field(
        None, description="Only for family history: Mother, Father, Sibling, etc."
    )
    year: Optional[int] = Field(None, description="Four-digit year, if one was given.")


class ListAnswer(BaseModel):
    """The result of reading an answer to a list question.

    `knows` and `has_any` are separate on purpose, and both matter:

        knows=False              -> the patient does not know. Record
                                    nothing; the section stays UNKNOWN so
                                    a doctor can see it was never
                                    established, and Ayu can ask again.
        knows=True, has_any=False -> "I don't have any." That is a real
                                    clinical answer and is stored as NONE.
        knows=True, has_any=True  -> items were listed.
    """

    knows: bool = Field(
        ...,
        description="False ONLY if the patient said they don't know / aren't sure / "
        "can't remember. Saying 'no, I don't have any' is knowing.",
    )
    has_any: bool = Field(
        ..., description="True if they listed at least one. False for 'none', 'no', 'nothing'."
    )
    items: list[ExtractedItem] = Field(default_factory=list)


class ScalarAnswer(BaseModel):
    """Named profile values pulled out of one answer. Only fields the
    patient actually gave are set — a missing field is left alone rather
    than guessed at."""

    bloodGroup: Optional[Literal["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]] = None
    heightCm: Optional[float] = None
    weightKg: Optional[float] = None
    smoking: Optional[Literal["NEVER", "FORMER", "CURRENT"]] = None
    alcohol: Optional[Literal["NEVER", "OCCASIONAL", "REGULAR"]] = None
    betel: Optional[Literal["NEVER", "OCCASIONAL", "REGULAR"]] = None
    emergencyContactName: Optional[str] = None
    emergencyContactRelationship: Optional[str] = None
    emergencyContactPhone: Optional[str] = None


class EditInstruction(BaseModel):
    """What the patient wants changed after reading the summary."""

    section: Literal[
        "allergies", "conditions", "medications", "surgeries",
        "family_history", "immunisations", "implants", "body", "lifestyle",
        "emergency_contact", "unclear",
    ] = Field(..., description="Which part of the report they want to change.")
    understood: bool = Field(
        ..., description="False if the request is too vague to act on."
    )


class AyuState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    patient_jwt: str
    patient_id: str

    # "EN" | "SI". Persisted onto PatientProfile.preferred_language so a
    # later session, and the monthly check-in, open in the same language.
    language: Optional[str]
    language_asked: bool
    greeted: bool

    # Interview position. `plan` is the list of question indexes still to
    # ask — a full intake is every question, a monthly gap-check is only
    # the ones still UNKNOWN.
    plan: list[int]
    cursor: int

    # Accumulated answers, in the shape app_save_my_health_profile takes.
    draft_profile: dict
    draft_allergies: list[dict]
    draft_conditions: list[dict]
    draft_medications: list[dict]
    draft_history: list[dict]

    # Set once the summary has been shown, so a resumed thread does not
    # replay the whole interview.
    reported: bool
    saved: bool
    # Which question index a targeted re-ask should jump to, after the
    # patient asks to edit something from the summary.
    edit_index: Optional[int]
    mode: Optional[str]
