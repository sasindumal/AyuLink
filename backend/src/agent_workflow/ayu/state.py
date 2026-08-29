"""Graph state for Ayu.

The interview is not a fixed script any more, so almost everything about
"what happens next" lives here rather than in the graph's shape: which
sections the planner chose, which one is open, which item inside it is
being built, and which attributes are still missing from that item.
"""

from typing import Annotated, Literal, Optional, TypedDict

from langgraph.graph.message import add_messages

# OPEN   — does the patient have anything in this section at all?
# DETAIL — chase the missing attributes of the item being built.
# MORE   — is there another one?
Phase = Literal["OPEN", "DETAIL", "MORE"]


class AyuState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    patient_jwt: str
    patient_id: str

    # "EN" | "SI". Settled before anything else, because every question
    # after it is composed in that language. Persisted to
    # PatientProfile.preferred_language, which is nullable: NULL means
    # never asked, so "chose English" stays distinguishable from "was
    # never offered the choice".
    language: Optional[str]
    language_asked: bool
    # From "User" — gates the female-only sections.
    gender: Optional[str]

    # The profile as it stood when this run began. The planner reads it to
    # decide what is missing or looks wrong; the composer reads it so a
    # revisited section can say what is already on file.
    existing: dict

    # Section keys to work through, chosen and ordered by the planner, and
    # how far along we are.
    plan: list[str]
    cursor: int

    phase: Optional[str]
    # The question actually put to the patient. Composed in the previous
    # node and only READ by the asking node — that node re-runs from the
    # top on every resume, so anything non-deterministic in it would show
    # the patient one question and record another.
    pending_question: Optional[str]
    # Attribute names the current follow-up is chasing.
    chasing: list[str]
    # Attributes already chased for the current item. One follow-up per
    # attribute: enough to catch "I forgot to say", bounded enough that a
    # patient who genuinely doesn't know is not asked forever.
    attempted: list[str]

    # The item being built, and any further items the opening answer named
    # that have not been dealt with yet ("penicillin and prawns" is two).
    current_item: dict
    item_queue: list[dict]

    # Accumulated answers, in the shape app_save_my_health_profile takes.
    draft_profile: dict
    draft_allergies: list[dict]
    draft_conditions: list[dict]
    draft_medications: list[dict]
    draft_history: list[dict]

    reported: bool
    saved: bool
    mode: Optional[str]
