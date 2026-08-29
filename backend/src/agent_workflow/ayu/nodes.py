"""Ayu's nodes: pick a language, run the interview, show the report, save.

The whole point of this agent is that the *conversation* can happen in
Sinhala while every value that reaches the database is English. Doctors,
the drug catalogue and the Neo4j graph are all English-only; a health
profile half-filled with Sinhala free text would be unreadable to the
clinician it exists for. So every extraction prompt says so explicitly,
and the summary is rendered back in the patient's language from the
English values that were stored.
"""

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.types import Command, interrupt

from src.agent_workflow.ayu.questions import QUESTIONS, pending_indexes, question_text
from src.agent_workflow.ayu.state import (
    AyuState,
    EditInstruction,
    ListAnswer,
    ScalarAnswer,
)
from src.agent_workflow.retrevel.streaming import emit_thinking
from src.agent_workflow.retrevel.tools.postgres_tools import RpcError, _call
from utils.llm import text_llm

GREETING = {
    "EN": "Hi! I'm **Ayu**, your personal health assistant.\n\n"
          "I'll ask a few questions about your health so any doctor you see "
          "already knows your background. It takes a couple of minutes, and "
          "\"I don't know\" is a perfectly good answer to any of them.",
    "SI": "ආයුබෝවන්! මම **ආයු**, ඔබේ පෞද්ගලික සෞඛ්‍ය සහායකයා.\n\n"
          "ඔබ හමුවන ඕනෑම වෛද්‍යවරයෙකුට ඔබේ සෞඛ්‍ය පසුබිම කලින්ම දැනගන්න පුළුවන් වෙන්න, "
          "මම ප්‍රශ්න කිහිපයක් අහනවා. විනාඩි කිහිපයයි යන්නේ. \"මම දන්නේ නැහැ\" කියන එකත් "
          "හොඳ පිළිතුරක්.",
}

CHECKIN_INTRO = {
    "EN": "Hi again! A few things are still missing from your health profile. "
          "Shall we fill them in? It'll only take a minute.",
    "SI": "ආයුබෝවන්! ඔබේ සෞඛ්‍ය තොරතුරු වලින් කිහිපයක් තවම හිස්ව තියෙනවා. "
          "ඒවා පුරවමුද? විනාඩියක් විතරයි යන්නේ.",
}

ALL_DONE = {
    "EN": "Your health profile is already complete — nothing for me to ask. "
          "I'll check again next month.",
    "SI": "ඔබේ සෞඛ්‍ය තොරතුරු දැනටමත් සම්පූර්ණයි — අහන්න දෙයක් නැහැ. "
          "ලබන මාසයේ මම නැවත බලන්නම්.",
}

SAVED = {
    "EN": "Saved. Any doctor who scans your Medical ID will now see this. "
          "You can change it any time from your profile.",
    "SI": "සුරැකුණා. ඔබේ Medical ID එක ස්කෑන් කරන ඕනෑම වෛද්‍යවරයෙකුට දැන් මේවා පෙනේවි. "
          "ඔබේ ප්‍රොෆයිල් එකෙන් ඕනෑම වෙලාවක වෙනස් කරන්න පුළුවන්.",
}

_EXTRACT_SYSTEM = (
    "You are reading a patient's spoken answer to one health question and turning "
    "it into structured data.\n\n"
    "CRITICAL: the patient may answer in Sinhala or English. Every value you output "
    "MUST be in LATIN SCRIPT — translate names of conditions, medicines, allergens "
    "and relationships into their standard English terms, and TRANSLITERATE personal "
    "names and place names rather than translating them (\u0db1\u0dd2\u0db8\u0dcf\u0dbd\u0dca -> 'Nimal'). "
    "A doctor reading this profile may not read Sinhala script, so never leave "
    "Sinhala characters in any field.\n\n"
    "Do not invent anything. Only record what the patient actually said. If they "
    "said they don't know or can't remember, set knows=false and return no items."
)


async def _save_profile(jwt: str, payload: dict) -> dict:
    return await _call(jwt, "app_save_my_health_profile", {"p_payload": payload})


async def _load_profile(jwt: str) -> dict:
    return await _call(jwt, "app_get_my_health_profile", {})


# --------------------------------------------------------------- nodes


async def start(state: AyuState) -> Command:
    """Pick a language on the very first run, then greet.

    Language is asked before anything else and only once: everything after
    it — the questions, the summary, the confirmation — is rendered in
    whichever was chosen, so it has to be settled first.
    """
    jwt = state["patient_jwt"]
    language = state.get("language")

    try:
        existing = await _load_profile(jwt)
    except RpcError:
        existing = {"profile": {}}
    profile = existing.get("profile") or {}
    gender = (existing.get("gender") or "").upper()

    if not language and not state.get("language_asked"):
        # NULL means never asked (see migration 20260917000000) — only a
        # value the patient actually picked skips the question.
        stored = profile.get("preferred_language")
        if stored in ("EN", "SI", "TA"):
            language = stored
        else:
            choice = interrupt(
                {
                    "type": "ayu_language",
                    "message": "Hi! Which language would you like to use?\n"
                               "ආයුබෝවන්! ඔබ කැමති භාෂාව කුමක්ද?",
                    "options": [
                        {"value": "EN", "label": "English"},
                        {"value": "SI", "label": "සිංහල"},
                    ],
                }
            )
            language = choice if choice in ("EN", "SI") else "EN"

    # Remember it, so the next session and the monthly check-in open in
    # the same language without asking again.
    try:
        await _save_profile(jwt, {"profile": {"preferredLanguage": language}})
    except RpcError:
        pass

    mode = state.get("mode") or "INTAKE"
    plan = pending_indexes(profile) if mode == "CHECKIN" else list(range(len(QUESTIONS)))
    # The pregnancy question only applies to female patients; drop it (and
    # any future female_only question) for everyone else. Gender is set at
    # registration — a patient with none recorded is treated as not female,
    # so the question is skipped rather than asked of the wrong person.
    if gender != "FEMALE":
        plan = [i for i in plan if not QUESTIONS[i].get("female_only")]

    if mode == "CHECKIN" and not plan:
        return Command(
            goto="__end__",
            update={
                "language": language,
                "language_asked": True,
                "messages": [AIMessage(content=ALL_DONE[language])],
            },
        )

    intro = CHECKIN_INTRO[language] if mode == "CHECKIN" else GREETING[language]
    return Command(
        goto="ask_question",
        update={
            "language": language,
            "language_asked": True,
            "greeted": True,
            "plan": plan,
            "cursor": 0,
            "draft_profile": {},
            "draft_allergies": [],
            "draft_conditions": [],
            "draft_medications": [],
            "draft_history": [],
            "messages": [AIMessage(content=intro)],
        },
    )


# Phrases that settle the knows/has_any question outright, in both
# languages. Checked before trusting the model because a boolean drawn
# from a negation-heavy sentence is not stable: the same Sinhala answer
# ("no, I have never had surgery") was observed parsing as both
# knows=True and knows=False across consecutive calls. The distinction
# between "I have none" and "I don't know" is the entire point of this
# agent, so it cannot rest on a coin flip.
_DONT_KNOW = (
    "don't know", "dont know", "do not know", "not sure", "no idea",
    "can't remember", "cant remember", "don't remember", "dont remember",
    "not certain", "unsure",
    "දන්නේ නැහැ", "දන්නෙ නෑ", "මතක නෑ", "මතක නැහැ", "විශ්වාස නැහැ", "විශ්වාස නෑ",
    "හරියට දන්නේ නෑ",
)
_NEGATION = (
    "none", "nothing", "never", "no allergies", "no such", "not any",
    "නෑ", "නැහැ", "නැත", "කිසිවක් නෑ", "කිසිම",
)


def _decide(answer: str, parsed: ListAnswer) -> ListAnswer:
    """Overrule the model on the two outcomes it is least reliable at.

    Order matters: "I don't remember" contains a negation too, so the
    don't-know check runs first — it is the more specific statement, and
    mistaking it for "I have none" would put a clinical claim on record
    that the patient never made.
    """
    text = answer.lower()

    if any(k in text for k in _DONT_KNOW):
        return ListAnswer(knows=False, has_any=False, items=[])

    # Items on the page beat any keyword: someone who listed a medicine
    # has plainly answered, whatever else the sentence contains.
    if parsed.items:
        return ListAnswer(knows=True, has_any=True, items=parsed.items)

    if any(n in text for n in _NEGATION):
        return ListAnswer(knows=True, has_any=False, items=[])

    return parsed


def _parse_list_answer(answer: str, hint: str) -> ListAnswer:
    try:
        emit_thinking("Noting that down...")
        parsed = text_llm.with_structured_output(ListAnswer, method="json_schema").invoke(
            [
                {"role": "system", "content": f"{_EXTRACT_SYSTEM}\n\nFor THIS question: {hint}"},
                {"role": "user", "content": answer},
            ]
        )
        return _decide(answer, parsed)
    except Exception:  # noqa: BLE001
        # An extraction failure must never be recorded as "the patient has
        # none" — that is a clinical claim nobody made. Fall back to
        # "unknown", which leaves the section visibly unanswered.
        return ListAnswer(knows=False, has_any=False, items=[])


def _parse_scalar_answer(answer: str, hint: str) -> ScalarAnswer:
    try:
        emit_thinking("Noting that down...")
        return text_llm.with_structured_output(ScalarAnswer, method="json_schema").invoke(
            [
                {"role": "system", "content": f"{_EXTRACT_SYSTEM}\n\nFor THIS question: {hint}"},
                {"role": "user", "content": answer},
            ]
        )
    except Exception:  # noqa: BLE001
        return ScalarAnswer()


async def ask_question(state: AyuState) -> Command:
    """Ask the next planned question, read the answer, store it."""
    plan = state.get("plan") or []
    cursor = state.get("cursor", 0)
    language = state.get("language") or "EN"

    if cursor >= len(plan):
        return Command(goto="show_report")

    qi = plan[cursor]
    q = QUESTIONS[qi]

    answer = interrupt(
        {
            "type": "ayu_question",
            "question": question_text(q, language),
            "step": cursor + 1,
            "total": len(plan),
            "section": q.get("status_key") or q.get("target"),
        }
    )
    answer_text = str(answer).strip()

    update: dict = {
        "cursor": cursor + 1,
        "messages": [
            AIMessage(content=question_text(q, language)),
            HumanMessage(content=answer_text),
        ],
    }
    profile = dict(state.get("draft_profile") or {})

    if q["kind"] == "scalar":
        parsed = _parse_scalar_answer(answer_text, q.get("item_hint", ""))
        for field, value in parsed.model_dump(exclude_none=True).items():
            profile[field] = _to_latin(value, "name") if isinstance(value, str) else value
        update["draft_profile"] = profile
        return Command(goto="ask_question", update=update)

    parsed_list = _parse_list_answer(answer_text, q.get("item_hint", ""))
    status_key = q["status_key"]
    # The three-way outcome that the whole design turns on.
    if not parsed_list.knows:
        status = "UNKNOWN"
    elif not parsed_list.has_any or not parsed_list.items:
        status = "NONE"
    else:
        status = "LISTED"
    profile[_status_field(status_key)] = status
    update["draft_profile"] = profile

    if status == "LISTED":
        target = q["target"]
        if target == "allergies":
            update["draft_allergies"] = (state.get("draft_allergies") or []) + [
                {
                    "allergen": _label(it.label),
                    "kind": "DRUG",
                    "reaction": _to_latin(it.detail or "") or None,
                    "severity": it.severity or "UNKNOWN",
                }
                for it in parsed_list.items
            ]
        elif target == "conditions":
            update["draft_conditions"] = (state.get("draft_conditions") or []) + [
                {"condition": _label(it.label), "status": "ACTIVE", "notes": _to_latin(it.detail or "") or None}
                for it in parsed_list.items
            ]
        elif target == "medications":
            update["draft_medications"] = (state.get("draft_medications") or []) + [
                {"drugName": _label(it.label), "dosage": _to_latin(it.detail or "") or None, "ongoing": True}
                for it in parsed_list.items
            ]
        elif target == "history":
            update["draft_history"] = (state.get("draft_history") or []) + [
                {
                    "kind": q["history_kind"],
                    "label": _label(it.label),
                    "occurredYear": it.year,
                    "relationship": _to_latin(it.relationship or "") or None,
                    "notes": it.detail,
                }
                for it in parsed_list.items
            ]

    return Command(goto="ask_question", update=update)


def _is_latin(text: str) -> bool:
    """Does this contain no Sinhala/Tamil script?

    Checked on the way OUT of extraction rather than trusted from the
    prompt: "always answer in English" holds most of the time and then
    quietly doesn't, and a drug name stored in Sinhala script is
    invisible to the doctor this profile exists for.
    """
    return all(ord(c) < 0x0D00 for c in text or "")


def _to_latin(text: str, kind: str = "medical term") -> str:
    """Force one field into Latin script, translating or transliterating.

    Only called when the check above fails, so the common path costs
    nothing. If the retry also comes back in Sinhala the original is
    kept — a value a Sinhala-reading clinician can still use beats an
    empty field.
    """
    if _is_latin(text):
        return text
    try:
        out = str(
            text_llm.invoke(
                [
                    {
                        "role": "system",
                        "content": f"Convert this {kind} to Latin script. Translate it to its "
                        "standard English name if it is a medical term; transliterate it if it "
                        "is a person's name or a place. Reply with ONLY the converted text, "
                        "nothing else.",
                    },
                    {"role": "user", "content": text},
                ]
            ).content
        ).strip()
        return out if out and _is_latin(out) else text
    except Exception:  # noqa: BLE001
        return text


def _label(text: str) -> str:
    """Capitalise the first letter, leaving the rest alone.

    The model returns "penicillin" or "Penicillin" depending on the run,
    and a doctor scanning an allergy list should not see the same drug
    styled two ways. Only the first character is touched — upper-casing
    the whole word would wreck "pH", "COVID-19" and "Vitamin D3".
    """
    t = _to_latin((text or "").strip())
    return t[:1].upper() + t[1:] if t else t


def _status_field(status_key: str) -> str:
    """DB column -> save-payload key ('allergies_status' -> 'allergiesStatus')."""
    parts = status_key.split("_")
    return parts[0] + "".join(w.capitalize() for w in parts[1:])


def _render_report(state: AyuState) -> str:
    language = state.get("language") or "EN"
    si = language == "SI"
    profile = state.get("draft_profile") or {}
    lines: list[str] = [
        "**ඔබේ සෞඛ්‍ය තොරතුරු**" if si else "**Your health profile**",
        "",
    ]

    def block(title_en: str, title_si: str, entries: list[str], status: str | None):
        lines.append(f"**{title_si if si else title_en}**")
        if entries:
            lines.extend(f"- {e}" for e in entries)
        elif status == "NONE":
            lines.append("- " + ("නැත" if si else "None"))
        else:
            lines.append("- " + ("තවම දන්නේ නැත" if si else "Not answered"))
        lines.append("")

    block("Allergies", "අසාත්මිකතා",
          [f"{a['allergen']}"
           + (f" — {a['reaction']}" if a.get("reaction") else "")
           + (f" ({a['severity']})" if a.get("severity") and a["severity"] != "UNKNOWN" else "")
           for a in state.get("draft_allergies") or []],
          profile.get("allergiesStatus"))
    block("Long-term conditions", "දිගුකාලීන රෝග",
          [c["condition"] for c in state.get("draft_conditions") or []],
          profile.get("conditionsStatus"))
    block("Regular medicines", "නිතිපතා ගන්නා ඖෂධ",
          [m["drugName"] + (f" — {m['dosage']}" if m.get("dosage") else "")
           for m in state.get("draft_medications") or []],
          profile.get("medicationsStatus"))

    history = state.get("draft_history") or []
    for kind, en, si_t, status_key in [
        ("SURGERY", "Surgeries & hospital stays", "සැත්කම් සහ රෝහල් ගතවීම්", "surgeriesStatus"),
        ("FAMILY_HISTORY", "Family history", "පවුලේ රෝග ඉතිහාසය", "familyHistoryStatus"),
        ("IMMUNISATION", "Vaccinations", "එන්නත්", "immunisationsStatus"),
        ("IMPLANT", "Implants & devices", "බද්ධ කළ උපකරණ", "implantsStatus"),
    ]:
        block(en, si_t,
              [h["label"]
               + (f" ({h['relationship']})" if h.get("relationship") else "")
               + (f" — {h['occurredYear']}" if h.get("occurredYear") else "")
               for h in history if h["kind"] == kind],
              profile.get(status_key))

    body = [f"{k}: {profile[k]}" for k in ("bloodGroup", "heightCm", "weightKg") if profile.get(k)]
    if body:
        block("Body & blood", "ශරීරය සහ රුධිරය", body, "LISTED")
    preg = profile.get("pregnancyStatus")
    if preg:
        preg_en = {"NOT_PREGNANT": "Not pregnant", "PREGNANT": "Pregnant",
                   "BREASTFEEDING": "Breastfeeding"}
        preg_si = {"NOT_PREGNANT": "ගර්භනී නොවේ", "PREGNANT": "ගර්භනීයි",
                   "BREASTFEEDING": "කිරි දෙනවා"}
        block("Pregnancy", "ගර්භණීභාවය",
              [(preg_si if si else preg_en).get(preg, preg)], "LISTED")
    life = [f"{k}: {profile[k]}" for k in ("smoking", "alcohol", "betel") if profile.get(k)]
    if life:
        block("Lifestyle", "ජීවන රටාව", life, "LISTED")
    if profile.get("emergencyContactPhone"):
        block("Emergency contact", "හදිසි සම්බන්ධතාවය",
              [f"{profile.get('emergencyContactName', '')} "
               f"({profile.get('emergencyContactRelationship', '')}) "
               f"{profile['emergencyContactPhone']}".strip()],
              "LISTED")
    return "\n".join(lines).strip()


def show_report(state: AyuState) -> Command:
    """Show everything gathered and ask the patient to confirm or change it.

    Nothing has been written to the database at this point. A health
    profile is read by clinicians who will act on it, so the patient sees
    exactly what will be stored, in their own language, before it is.
    """
    language = state.get("language") or "EN"
    report = _render_report(state)

    answer = interrupt(
        {
            "type": "ayu_report",
            "report": report,
            "message": (
                "මේවා නිවැරදිද? නිවැරදි නම් තහවුරු කරන්න, නැත්නම් වෙනස් කරන්න ඕන දේ කියන්න."
                if language == "SI"
                else "Does this look right? Confirm it, or tell me what to change."
            ),
        }
    )

    if isinstance(answer, dict) and answer.get("confirm"):
        return Command(goto="save_profile", update={"reported": True})

    instruction = (answer.get("edit") if isinstance(answer, dict) else str(answer)) or ""
    return Command(goto="apply_edit", update={"reported": True, "messages": [HumanMessage(content=instruction)]})


def apply_edit(state: AyuState) -> Command:
    """Work out which section the patient wants to change, and re-ask it."""
    language = state.get("language") or "EN"
    instruction = ""
    for m in reversed(state.get("messages") or []):
        if getattr(m, "type", "") == "human":
            instruction = str(getattr(m, "content", ""))
            break

    try:
        emit_thinking("Finding that section...")
        parsed: EditInstruction = text_llm.with_structured_output(
            EditInstruction, method="json_schema"
        ).invoke(
            [
                {
                    "role": "system",
                    "content": "The patient just reviewed their health profile and asked to "
                    "change something. Which section do they mean? They may write in Sinhala.",
                },
                {"role": "user", "content": instruction},
            ]
        )
    except Exception:  # noqa: BLE001
        parsed = EditInstruction(section="unclear", understood=False)

    section_to_index = {
        "allergies": 0, "conditions": 1, "medications": 2, "surgeries": 3,
        "family_history": 4, "immunisations": 5, "implants": 6,
        "body": 7, "pregnancy": 8, "lifestyle": 9, "emergency_contact": 10,
    }
    idx = section_to_index.get(parsed.section)

    if not parsed.understood or idx is None:
        msg = (
            "කුමන කොටසද වෙනස් කරන්න ඕන කියලා මට තේරුණේ නැහැ. නැවත කියන්න පුළුවන්ද?"
            if language == "SI"
            else "I didn't catch which part you'd like to change — could you say it again?"
        )
        return Command(goto="show_report", update={"messages": [AIMessage(content=msg)]})

    # Re-ask just that one question, then return to the summary. Anything
    # previously captured for that section is dropped first, so an edit
    # replaces rather than appends.
    return Command(goto="ask_question", update={"plan": [idx], "cursor": 0, **_clear_section(state, idx)})


def _clear_section(state: AyuState, index: int) -> dict:
    q = QUESTIONS[index]
    target = q.get("target")
    if target == "allergies":
        return {"draft_allergies": []}
    if target == "conditions":
        return {"draft_conditions": []}
    if target == "medications":
        return {"draft_medications": []}
    if target == "history":
        kind = q["history_kind"]
        return {"draft_history": [h for h in (state.get("draft_history") or []) if h["kind"] != kind]}
    return {}


async def save_profile(state: AyuState) -> dict:
    language = state.get("language") or "EN"
    payload = {
        "profile": {
            **(state.get("draft_profile") or {}),
            "preferredLanguage": language,
            "ayuLastPromptedAt": None,
        },
        "allergies": state.get("draft_allergies") or [],
        "conditions": state.get("draft_conditions") or [],
        "medications": state.get("draft_medications") or [],
        "history": state.get("draft_history") or [],
    }
    # Only stamp completion on a full intake — a gap-check that filled two
    # sections has not completed anything.
    if (state.get("mode") or "INTAKE") == "INTAKE":
        from datetime import datetime, timezone

        payload["profile"]["profileCompletedAt"] = datetime.now(timezone.utc).isoformat()

    try:
        await _save_profile(state["patient_jwt"], payload)
    except RpcError as exc:
        return {
            "messages": [
                AIMessage(
                    content=(
                        f"මට එය සුරැකීමට නොහැකි විය: {exc}"
                        if language == "SI"
                        else f"I couldn't save that: {exc}"
                    )
                )
            ]
        }

    return {"saved": True, "messages": [AIMessage(content=SAVED[language])]}
