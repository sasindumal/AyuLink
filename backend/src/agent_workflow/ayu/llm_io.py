"""The three jobs the LLM does in this agent, and nothing else.

  1. PLAN     — read the existing health profile and decide what to ask,
                in what order.
  2. COMPOSE  — write the next question, in the patient's language.
  3. EXTRACT  — read the answer into the attributes of one section.

Extraction models are built PER SECTION from `schema.SECTIONS` rather than
one shared shape for everything. A single shared model let the LLM fill a
field belonging to a different question — an implant came back carrying a
severity, a frequency and a family relationship — and every consumer then
had to remember to ignore what it had not asked for. A model that only has
the fields in scope cannot make that mistake.

Every function here degrades to something usable if the model call fails:
a composed question falls back to a templated one, extraction falls back
to "nothing was understood". Ayu going quiet mid-interview is worse than
Ayu asking a plainer question.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field, create_model

from src.agent_workflow.ayu import guards
from src.agent_workflow.ayu.schema import Attr, Section
from src.agent_workflow.retrevel.streaming import emit_thinking
from utils.llm import text_llm

LANGUAGE_NAME = {"EN": "English", "SI": "Sinhala"}


# ============================================================ dynamic models

_PY = {"str": str, "int": int, "float": float, "bool": bool}


def _annotation(attr: Attr):
    if attr.choices:
        return Optional[Literal[attr.choices]]  # type: ignore[valid-type]
    return Optional[_PY[attr.kind]]


def _fields(attrs: tuple[Attr, ...] | list[Attr]) -> dict:
    return {
        a.name: (
            _annotation(a),
            Field(None, description=a.describe + (" Leave null if not said." )),
        )
        for a in attrs
    }


def item_model(section: Section, attrs=None) -> type[BaseModel]:
    """One item of a section, with only that section's attributes."""
    chosen = attrs if attrs is not None else section.attrs
    return create_model(f"{section.key.title()}Item", **_fields(chosen))  # type: ignore[call-overload]


def list_answer_model(section: Section) -> type[BaseModel]:
    """A section opener: do they have any, and what are they?"""
    return create_model(
        f"{section.key.title()}Answer",
        knows=(
            bool,
            Field(
                ...,
                description="False ONLY if they said they don't know / aren't sure / "
                "can't remember. Saying 'no, I don't have any' IS knowing.",
            ),
        ),
        has_any=(
            bool,
            Field(..., description="True if they have at least one. False for "
                  "'none', 'no', 'nothing'."),
        ),
        items=(list[item_model(section)], Field(default_factory=list)),  # type: ignore[misc]
    )


class PlannedSection(BaseModel):
    section: str = Field(..., description="The section key, exactly as given.")
    reason: str = Field("", description="One short clause: why ask this now.")


class Plan(BaseModel):
    sections: list[PlannedSection] = Field(default_factory=list)


class MoreAnswer(BaseModel):
    more: bool = Field(..., description="True if they want to add another one.")


# =================================================================== prompts

_LATIN_RULE = (
    "The patient may answer in Sinhala or English. Every value you output MUST be "
    "in LATIN SCRIPT — translate conditions, medicines, allergens and relationships "
    "to their standard English terms, and TRANSLITERATE personal and place names "
    "(නිමාල් -> 'Nimal'). A doctor reading this profile may not read Sinhala.\n"
    "Never invent anything. Record only what the patient actually said; leave "
    "anything they did not say as null. In particular NEVER infer WHO has a "
    "condition — if the patient did not name the relative, leave relationship null."
)


def plan_sections(profile_summary: str, candidates: list[Section]) -> list[str]:
    """Decide which sections to ask, and in what order.

    The caller keeps a deterministic floor under this: anything genuinely
    empty that the model leaves out is appended anyway. The model is
    choosing an ORDER and spotting what looks wrong — it is not allowed to
    silently drop a gap.
    """
    if not candidates:
        return []
    catalogue = "\n".join(f"- {s.key}: {s.title} — {s.purpose}" for s in candidates)
    try:
        emit_thinking("Looking at what's already on file...")
        plan: Plan = text_llm.with_structured_output(Plan, method="json_schema").invoke(
            [
                {
                    "role": "system",
                    "content": "You are planning a short health-profile interview for "
                    "one patient. Given what is already on file and the sections that "
                    "are still unanswered, return the sections to ask, ordered.\n\n"
                    "Order by CLINICAL IMPORTANCE first: what a doctor checks before "
                    "prescribing (allergies, conditions, current medicines) comes "
                    "before background, and administrative details come last. Include "
                    "every section you are given — you may reorder, not omit.\n\n"
                    "Use ONLY the section keys given to you.",
                },
                {
                    "role": "user",
                    "content": f"Already on file:\n{profile_summary}\n\n"
                    f"Still unanswered:\n{catalogue}",
                },
            ]
        )
        valid = {s.key for s in candidates}
        return [p.section for p in plan.sections if p.section in valid]
    except Exception:  # noqa: BLE001
        return [s.key for s in candidates]


def compose_question(
    section: Section,
    language: str,
    *,
    phase: str,
    chasing: list[Attr] | None = None,
    collected: dict | None = None,
    known: str = "",
) -> str:
    """Write the next question, in the patient's language.

    `phase` is one of:
      OPEN   — does the patient have any of these at all?
      DETAIL — chase the named attributes for the item being built.
      MORE   — is there another one?
    """
    chasing = chasing or []
    collected = collected or {}
    lang = LANGUAGE_NAME.get(language, "English")

    if phase == "OPEN":
        task = (
            f"Ask whether the patient has anything for this section. Mention a "
            f"couple of everyday examples so they know what counts. Make it easy "
            f"to say no."
            if section.shape == "LIST"
            else f"Ask for: {', '.join(a.ask_hint for a in section.attrs)}."
        )
    elif phase == "MORE":
        have = ", ".join(str(v) for v in collected.values() if v) or "that"
        task = (
            f"They have just given you: {have}. Ask, briefly and warmly, whether "
            f"there is anything else to add to this section. One short sentence."
        )
    else:  # DETAIL
        wanted = "; ".join(a.ask_hint for a in chasing)
        have = ", ".join(f"{k}={v}" for k, v in collected.items() if v) or "nothing yet"
        task = (
            f"You already have: {have}. You still need: {wanted}. Ask ONLY for what "
            f"is still missing — never re-ask what you already have. If more than "
            f"one thing is missing, ask for them together in one natural sentence."
        )

    try:
        emit_thinking("...")
        out = str(
            text_llm.invoke(
                [
                    {
                        "role": "system",
                        "content": (
                            "You are Ayu, a warm, plain-spoken health assistant "
                            "talking to a patient in Sri Lanka. Write ONE question.\n\n"
                            f"Write it in {lang}, and in {lang} only.\n"
                            "Rules: one or two short sentences, no greeting, no "
                            "preamble, no bullet points, no markdown, no emoji. Speak "
                            "to the patient directly as 'you'. Never use clinical "
                            "jargon where an everyday word exists. Output ONLY the "
                            "question itself."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Section: {section.title} — {section.purpose}\n"
                        + (f"On file already: {known}\n" if known else "")
                        + f"\nYour task: {task}",
                    },
                ]
            ).content
        ).strip()
        if out:
            return out.strip('"')
    except Exception:  # noqa: BLE001
        pass
    return _fallback_question(section, language, phase, chasing)


def _fallback_question(section: Section, language: str, phase: str, chasing) -> str:
    """A plain, templated question for when the composer is unavailable.

    Deliberately unglamorous — its whole job is that the interview never
    stalls just because one model call failed.
    """
    si = language == "SI"
    if phase == "MORE":
        return "තව එකක් එකතු කරන්නද?" if si else "Anything else to add?"
    if phase == "DETAIL":
        wants = ", ".join(a.ask_hint for a in (chasing or []))
        return (
            f"කරුණාකර මෙයත් කියන්න: {wants}" if si else f"Could you also tell me {wants}?"
        )
    if si:
        return f"{section.title} ගැන කියන්න පුළුවන්ද?"
    return f"Can you tell me about your {section.title.lower()}?"


def extract_list_opening(section: Section, answer: str):
    """Read a section opener: do they have any, and what did they name?"""
    model = list_answer_model(section)
    try:
        emit_thinking("Noting that down...")
        parsed = text_llm.with_structured_output(model, method="json_schema").invoke(
            [
                {
                    "role": "system",
                    "content": f"{_LATIN_RULE}\n\nSection: {section.title} — "
                    f"{section.purpose}",
                },
                {"role": "user", "content": answer},
            ]
        )
    except Exception:  # noqa: BLE001
        # Never fall back to "they have none" — that is a clinical claim
        # nobody made. Unknown leaves the section visibly unanswered.
        return False, False, []

    knows, has_any = parsed.knows, parsed.has_any
    items = [i.model_dump() for i in parsed.items]

    # Deterministic veto. The same Sinhala sentence was observed parsing as
    # both knows=True and knows=False on consecutive calls, and the
    # difference between "I have none" and "I don't know" is the entire
    # point of this agent.
    if guards.said_dont_know(answer):
        return False, False, []
    if items:
        return True, True, items
    if guards.said_no(answer):
        return True, False, []
    return knows, has_any, items


def extract_attrs(section: Section, attrs: list[Attr], answer: str, collected: dict) -> dict:
    """Read the named attributes out of one reply."""
    model = item_model(section, attrs)
    try:
        emit_thinking("Noting that down...")
        parsed = text_llm.with_structured_output(model, method="json_schema").invoke(
            [
                {
                    "role": "system",
                    "content": f"{_LATIN_RULE}\n\nSection: {section.title} — "
                    f"{section.purpose}\nYou are filling in the missing details of "
                    f"one entry. Already known: "
                    f"{ {k: v for k, v in collected.items() if v} or 'nothing'}.",
                },
                {"role": "user", "content": answer},
            ]
        )
    except Exception:  # noqa: BLE001
        return {}
    return {k: v for k, v in parsed.model_dump().items() if v is not None}


def wants_another(answer: str) -> bool:
    """Did they say there is one more, or that they are done?

    Negation is checked FIRST, and it is the more specific reading: Sinhala
    "නෑ, තව නෑ" means "no, no more" but contains "තව" ("more"), so looking
    for a yes first turns a refusal into another round of questions. Same
    ordering rule as don't-know beating no-I-have-none.
    """
    text = (answer or "").strip().lower()
    if text in guards.STANDALONE_NO:
        return False
    if guards.said_no(answer) or guards.said_dont_know(answer):
        return False
    if guards.said_yes(answer):
        return True
    try:
        parsed: MoreAnswer = text_llm.with_structured_output(
            MoreAnswer, method="json_schema"
        ).invoke(
            [
                {"role": "system", "content": "Did the patient say they have something "
                 "ELSE to add, or that they are finished? They may answer in Sinhala."},
                {"role": "user", "content": answer},
            ]
        )
        return parsed.more
    except Exception:  # noqa: BLE001
        # An unreadable answer ends the loop rather than looping forever.
        return False
