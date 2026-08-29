"""Ayu's nodes.

The interview is driven by the patient's own health profile: what is
already on file decides what gets asked, the LLM writes every question,
and a section is not finished until each of its required attributes is
either filled or explicitly declined.

One structural rule runs through all of this: **a node that interrupts
does nothing non-deterministic before the interrupt.** A LangGraph node
re-runs from the top on every resume, so an LLM call sitting above an
`interrupt()` would be re-rolled on the way back — showing the patient one
question and recording another. So questions are composed in `compose`,
put to the patient in `ask` (which only reads state), and read back in
`ingest`. Three small nodes instead of one big one, for that reason alone.
"""

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.types import Command, interrupt

from src.agent_workflow.ayu import guards, llm_io
from src.agent_workflow.ayu.schema import (
    BY_KEY,
    SECTIONS,
    Attr,
    Section,
    applicable,
    is_empty,
    missing_required,
    pending_sections,
    status_payload_key,
)
from src.agent_workflow.ayu.state import AyuState
from src.agent_workflow.retrevel.tools.postgres_tools import RpcError, _call

GREETING = {
    "EN": "Hi! I'm **Ayu**, your personal health assistant.\n\n"
          "I'll ask a few questions about your health so any doctor you see "
          "already knows your background. \"I don't know\" is a perfectly good "
          "answer to any of them.",
    "SI": "ආයුබෝවන්! මම **ආයු**, ඔබේ පෞද්ගලික සෞඛ්‍ය සහායකයා.\n\n"
          "ඔබ හමුවන ඕනෑම වෛද්‍යවරයෙකුට ඔබේ සෞඛ්‍ය පසුබිම කලින්ම දැනගන්න පුළුවන් වෙන්න, "
          "මම ප්‍රශ්න කිහිපයක් අහනවා. \"මම දන්නේ නැහැ\" කියන එකත් හොඳ පිළිතුරක්.",
}

CHECKIN_INTRO = {
    "EN": "Hi again! A few things are still missing from your health profile. "
          "Shall we fill them in?",
    "SI": "ආයුබෝවන්! ඔබේ සෞඛ්‍ය තොරතුරු වලින් කිහිපයක් තවම හිස්ව තියෙනවා. ඒවා පුරවමුද?",
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


async def _save(jwt: str, payload: dict) -> dict:
    return await _call(jwt, "app_save_my_health_profile", {"p_payload": payload})


async def _load(jwt: str) -> dict:
    return await _call(jwt, "app_get_my_health_profile", {})


def _lang(state: AyuState) -> str:
    return state.get("language") or "EN"


def _section(state: AyuState) -> Section | None:
    plan, cursor = state.get("plan") or [], state.get("cursor", 0)
    return BY_KEY[plan[cursor]] if cursor < len(plan) else None


def _summarise(existing: dict) -> str:
    """What is already on file, as a few lines the planner can read."""
    profile = (existing or {}).get("profile") or {}
    lines: list[str] = []
    for s in SECTIONS:
        if s.shape == "LIST":
            status = profile.get(s.status_key) or "UNKNOWN"
            if status == "UNKNOWN":
                continue
            rows = _existing_rows(existing, s)
            lines.append(
                f"{s.title}: none" if status == "NONE" else f"{s.title}: {', '.join(rows) or 'listed'}"
            )
        else:
            from src.agent_workflow.ayu.schema import COLUMN_OF

            vals = {
                f: profile.get(COLUMN_OF.get(f, f))
                for f in s.profile_fields
                if profile.get(COLUMN_OF.get(f, f)) not in (None, "", "UNKNOWN")
            }
            if vals:
                lines.append(f"{s.title}: " + ", ".join(f"{k}={v}" for k, v in vals.items()))
    return "\n".join(lines) or "(nothing recorded yet)"


def _existing_rows(existing: dict, s: Section) -> list[str]:
    if s.target == "allergies":
        return [a.get("allergen", "") for a in existing.get("allergies") or []]
    if s.target == "conditions":
        return [c.get("condition", "") for c in existing.get("conditions") or []]
    if s.target == "medications":
        return [m.get("drug_name") or m.get("drugName") or "" for m in existing.get("medications") or []]
    if s.target == "history":
        return [
            h.get("label", "")
            for h in existing.get("history") or []
            if h.get("kind") == s.history_kind
            or (s.history_kind == "SURGERY" and h.get("kind") == "HOSPITALISATION")
        ]
    return []


# ==================================================================== start


async def start(state: AyuState) -> Command:
    """Load the profile, settle the language, then plan what to ask.

    The plan is the LLM's, but with a deterministic floor under it: any
    section that is genuinely empty and that the planner left out is
    appended anyway. The model chooses the ORDER and can pull in something
    that looks wrong; it cannot silently drop a gap.
    """
    jwt = state["patient_jwt"]
    language = state.get("language")

    try:
        existing = await _load(jwt)
    except RpcError:
        existing = {"profile": {}}
    profile = existing.get("profile") or {}
    gender = (existing.get("gender") or "").upper()

    if not language and not state.get("language_asked"):
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

    try:
        await _save(jwt, {"profile": {"preferredLanguage": language}})
    except RpcError:
        pass

    mode = state.get("mode") or "INTAKE"
    if mode == "CHECKIN":
        candidates = [BY_KEY[k] for k in pending_sections(profile, gender)]
    else:
        candidates = [s for s in SECTIONS if applicable(s, gender)]

    if not candidates:
        return Command(
            goto="__end__",
            update={
                "language": language,
                "language_asked": True,
                "messages": [AIMessage(content=ALL_DONE[language])],
            },
        )

    ordered = llm_io.plan_sections(_summarise(existing), candidates)
    # The floor: nothing empty gets dropped just because the planner
    # forgot it.
    for s in candidates:
        if s.key not in ordered:
            ordered.append(s.key)

    intro = CHECKIN_INTRO[language] if mode == "CHECKIN" else GREETING[language]
    return Command(
        goto="compose",
        update={
            "language": language,
            "language_asked": True,
            "gender": gender,
            "existing": existing,
            "plan": ordered,
            "cursor": 0,
            "phase": "OPEN",
            "current_item": {},
            "item_queue": [],
            "chasing": [],
            "attempted": [],
            "draft_profile": {},
            "draft_allergies": [],
            "draft_conditions": [],
            "draft_medications": [],
            "draft_history": [],
            "messages": [AIMessage(content=intro)],
        },
    )


# ================================================================== compose


def compose(state: AyuState) -> Command:
    """Write the next question and hand it to `ask`."""
    section = _section(state)
    if section is None:
        return Command(goto="show_report")

    phase = state.get("phase") or "OPEN"
    chasing = [a for a in section.attrs if a.name in (state.get("chasing") or [])]
    known = ""
    if phase == "OPEN":
        rows = _existing_rows(state.get("existing") or {}, section)
        known = ", ".join(r for r in rows if r)

    question = llm_io.compose_question(
        section,
        _lang(state),
        phase=phase,
        chasing=chasing,
        collected=state.get("current_item") or {},
        known=known,
    )
    return Command(goto="ask", update={"pending_question": question})


# ====================================================================== ask


def ask(state: AyuState) -> Command:
    """Put the composed question to the patient. Nothing else.

    Deliberately trivial: this is the node that re-runs on every resume, so
    it reads `pending_question` rather than deriving one.
    """
    question = state.get("pending_question") or "..."
    section = _section(state)
    plan = state.get("plan") or []

    answer = interrupt(
        {
            "type": "ayu_question",
            "question": question,
            "step": min(state.get("cursor", 0) + 1, len(plan)),
            "total": len(plan),
            "section": section.key if section else "",
        }
    )
    answer_text = str(answer).strip()
    return Command(
        goto="ingest",
        update={
            "messages": [
                AIMessage(content=question),
                HumanMessage(content=answer_text),
            ]
        },
    )


# =================================================================== ingest


def _last_answer(state: AyuState) -> str:
    for m in reversed(state.get("messages") or []):
        if getattr(m, "type", "") == "human":
            return str(getattr(m, "content", ""))
    return ""


def _clean(attr: Attr, value, answer: str = ""):
    """Normalise one extracted value, or drop it."""
    if value is None or guards.is_placeholder(value):
        return None
    if attr.name == "relationship":
        # Only a relative the patient actually named survives — see
        # guards.relationship_was_said.
        return guards.relationship_was_said(
            guards.clean_relationship(str(value)), answer
        )
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        # Closed vocabularies come back as-is; free text is forced into
        # Latin script and given a consistent first letter.
        return text if attr.choices else guards.label(text)
    return value


def _clean_item(section: Section, raw: dict, answer: str = "") -> dict:
    out = {}
    for attr in section.attrs:
        v = _clean(attr, raw.get(attr.name), answer)
        if v is not None:
            out[attr.name] = v
    return out


def _rows_for(state: AyuState, section: Section, update: dict) -> list:
    key = {
        "allergies": "draft_allergies", "conditions": "draft_conditions",
        "medications": "draft_medications", "history": "draft_history",
    }.get(section.target or "")
    if not key:
        return []
    rows = update.get(key) if key in update else (state.get(key) or [])
    if section.target != "history":
        return list(rows or [])
    kinds = {section.history_kind}
    if section.history_kind == "SURGERY":
        kinds.add("HOSPITALISATION")
    return [h for h in (rows or []) if h.get("kind") in kinds]


def _reconcile_status(state: AyuState, section: Section, update: dict) -> dict:
    """Make the section's status agree with what was actually captured.

    "LISTED" with nothing under it tells a doctor there is something to
    read when there isn't. If the patient said they have some but nothing
    usable survived, that is UNKNOWN — still an open question, not a
    claim that they have none.
    """
    profile = dict(update.get("draft_profile") or state.get("draft_profile") or {})
    key = status_payload_key(section.status_key)
    current = profile.get(key)
    if current == "NONE":
        return update
    profile[key] = "LISTED" if _rows_for(state, section, update) else "UNKNOWN"
    update["draft_profile"] = profile
    return update


def _advance(state: AyuState, update: dict) -> Command:
    """Move to the next section, or to the report if there are none left."""
    section = _section(state)
    if section is not None and section.shape == "LIST":
        update = _reconcile_status(state, section, update)
    update = {
        **update,
        "cursor": state.get("cursor", 0) + 1,
        "phase": "OPEN",
        "current_item": {},
        "item_queue": [],
        "chasing": [],
        "attempted": [],
    }
    return Command(goto="compose", update=update)


def _primary(section: Section) -> str:
    """The attribute an entry is nothing without — its name or label."""
    req = [a.name for a in section.attrs if a.required]
    return req[0] if req else section.attrs[0].name


def _commit(state: AyuState, section: Section, item: dict, update: dict) -> dict:
    """Fold one finished item into the draft payload.

    An item missing its primary attribute is DROPPED, not stored: a
    medication row with no drug name is not a partial record, it is an
    unusable one — and "drug_name" is NOT NULL, so it would be silently
    discarded at save time anyway, after the patient had been told it was
    written down.
    """
    if section.shape == "LIST" and not item.get(_primary(section)):
        return update
    if section.shape == "SCALAR":
        profile = dict(state.get("draft_profile") or {})
        profile.update({k: v for k, v in item.items() if v is not None})
        update["draft_profile"] = {**update.get("draft_profile", {}), **profile}
        return update

    if section.target == "allergies":
        update["draft_allergies"] = (
            update.get("draft_allergies") or list(state.get("draft_allergies") or [])
        ) + [
            {
                "allergen": item.get("allergen"),
                # OTHER, never DRUG, when unclassified: unclassified is a
                # gap, "DRUG" is a claim.
                "kind": item.get("kind") or "OTHER",
                "reaction": item.get("reaction"),
                "severity": item.get("severity") or "UNKNOWN",
            }
        ]
    elif section.target == "conditions":
        update["draft_conditions"] = (
            update.get("draft_conditions") or list(state.get("draft_conditions") or [])
        ) + [{"condition": item.get("condition"), "status": "ACTIVE",
              "notes": item.get("notes")}]
    elif section.target == "medications":
        update["draft_medications"] = (
            update.get("draft_medications") or list(state.get("draft_medications") or [])
        ) + [{"drugName": item.get("drugName"), "dosage": item.get("dosage"),
              "frequency": item.get("frequency"), "notes": item.get("notes"),
              "ongoing": True}]
    elif section.target == "history":
        kind = section.history_kind
        # One section covers operations AND admissions, so the kind is per
        # item, not per section.
        if kind == "SURGERY" and item.get("admitted"):
            kind = "HOSPITALISATION"
        update["draft_history"] = (
            update.get("draft_history") or list(state.get("draft_history") or [])
        ) + [
            {
                "kind": kind,
                "label": item.get("label"),
                # Family history carries no year — nobody reliably knows
                # when a parent's diabetes started, and `since`/year is a
                # date a patient cannot give to that precision.
                "occurredYear": item.get("year") if section.key != "family_history" else None,
                "relationship": item.get("relationship"),
                "notes": item.get("notes"),
            }
        ]
    return update


def _set_status(state: AyuState, section: Section, status: str, update: dict) -> dict:
    if section.shape != "LIST":
        return update
    profile = dict(update.get("draft_profile") or state.get("draft_profile") or {})
    profile[status_payload_key(section.status_key)] = status
    update["draft_profile"] = profile
    return update


def _next_item_or_more(state: AyuState, section: Section, update: dict) -> Command:
    """Take the next item the opening answer named, or ask if there is one more."""
    queue = list(update.get("item_queue", state.get("item_queue") or []))
    if queue:
        nxt = queue.pop(0)
        missing = missing_required(section, nxt)
        update.update({
            "item_queue": queue, "current_item": nxt,
            "attempted": [], "chasing": [a.name for a in missing],
            "phase": "DETAIL" if missing else "MORE",
        })
        if not missing:
            update = _commit(state, section, nxt, update)
            update["current_item"] = nxt
        return Command(goto="compose", update=update)

    update.update({"phase": "MORE", "chasing": [], "item_queue": []})
    return Command(goto="compose", update=update)


def ingest(state: AyuState) -> Command:
    """Read the answer, and decide what still needs asking."""
    section = _section(state)
    if section is None:
        return Command(goto="show_report")

    answer = _last_answer(state)
    phase = state.get("phase") or "OPEN"
    update: dict = {}

    # ---------------------------------------------------------- MORE
    if phase == "MORE":
        if not llm_io.wants_another(answer):
            return _advance(state, update)
        # "Yes, also prawns" answers the question AND names the next item.
        # Read it here rather than asking them to repeat themselves.
        seeded = _clean_item(
            section, llm_io.extract_attrs(section, list(section.attrs), answer, {}), answer
        )
        missing = missing_required(section, seeded)
        if not missing and seeded:
            update = _commit(state, section, seeded, update)
            update.update({"current_item": seeded, "attempted": [], "chasing": [],
                           "phase": "MORE"})
            return Command(goto="compose", update=update)
        update.update({
            "current_item": seeded, "attempted": [],
            "chasing": [a.name for a in (missing or [a for a in section.attrs if a.required])],
            "phase": "DETAIL",
        })
        return Command(goto="compose", update=update)

    # ---------------------------------------------------------- OPEN
    if phase == "OPEN":
        if section.shape == "LIST":
            knows, has_any, items = llm_io.extract_list_opening(section, answer)
            if not knows:
                # UNKNOWN, never NONE: recording "they have none" for a
                # patient who said they don't know puts a clinical claim on
                # file that nobody made.
                return _advance(state, _set_status(state, section, "UNKNOWN", update))
            if not has_any:
                return _advance(state, _set_status(state, section, "NONE", update))
            cleaned = [_clean_item(section, i, answer) for i in items]
            cleaned = [c for c in cleaned if c]
            if not cleaned:
                # They said yes but named nothing — ask what, rather than
                # recording the opposite of what they said.
                update.update({
                    "current_item": {}, "attempted": [],
                    "chasing": [a.name for a in section.attrs if a.required],
                    "phase": "DETAIL",
                })
                return Command(goto="compose", update=update)
            update = _set_status(state, section, "LISTED", update)
            update["item_queue"] = cleaned
            return _next_item_or_more(state, section, update)

        # SCALAR
        got = _clean_item(
            section, llm_io.extract_attrs(section, list(section.attrs), answer, {}), answer
        )
        if guards.said_dont_know(answer) and not got:
            return _advance(state, update)
        missing = missing_required(section, got)
        if missing:
            update.update({
                "current_item": got, "attempted": [],
                "chasing": [a.name for a in missing], "phase": "DETAIL",
            })
            return Command(goto="compose", update=update)
        return _advance(state, _commit(state, section, got, update))

    # -------------------------------------------------------- DETAIL
    chasing = [a for a in section.attrs if a.name in (state.get("chasing") or [])]
    item = dict(state.get("current_item") or {})
    got = _clean_item(
        section,
        llm_io.extract_attrs(section, chasing or list(section.attrs), answer, item),
        answer,
    )
    item.update(got)

    attempted = list(state.get("attempted") or []) + [a.name for a in chasing]
    missing = [a for a in missing_required(section, item) if a.name not in attempted]

    if missing:
        update.update({
            "current_item": item, "attempted": attempted,
            "chasing": [a.name for a in missing], "phase": "DETAIL",
        })
        return Command(goto="compose", update=update)

    # Everything required is either filled or has been asked for once and
    # genuinely isn't known. Take it as it stands.
    if section.shape == "SCALAR":
        return _advance(state, _commit(state, section, item, update))

    update = _commit(state, section, item, update)
    update["current_item"] = item
    update["attempted"] = []
    return _next_item_or_more(state, section, update)


# ================================================================== report


_VALUE_LABELS = {
    "NEVER": ("Never", "කවදාවත් නැහැ"),
    "FORMER": ("Gave up", "නවත්වා ඇත"),
    "CURRENT": ("Yes", "ඔව්"),
    "OCCASIONAL": ("Sometimes", "සමහර වෙලාවට"),
    "REGULAR": ("Regularly", "නිතිපතා"),
    "NOT_PREGNANT": ("Not pregnant", "ගර්භනී නොවේ"),
    "PREGNANT": ("Pregnant", "ගර්භනීයි"),
    "BREASTFEEDING": ("Breastfeeding", "කිරි දෙනවා"),
}

_FIELD_LABELS = {
    "bloodGroup": ("Blood group", "රුධිර වර්ගය"),
    "heightCm": ("Height", "උස"),
    "weightKg": ("Weight", "බර"),
    "smoking": ("Smoking", "දුම්පානය"),
    "alcohol": ("Alcohol", "මත්පැන්"),
    "betel": ("Betel", "බුලත්"),
    "emergencyContactName": ("Name", "නම"),
    "emergencyContactRelationship": ("Relationship", "සම්බන්ධය"),
    "emergencyContactPhone": ("Phone", "දුරකථනය"),
    "pregnancyStatus": ("Status", "තත්ත්වය"),
}

_TITLES_SI = {
    "allergies": "අසාත්මිකතා",
    "conditions": "දිගුකාලීන රෝග",
    "medications": "නිතිපතා ගන්නා ඖෂධ",
    "surgeries": "සැත්කම් සහ රෝහල් ගතවීම්",
    "family_history": "පවුලේ රෝග ඉතිහාසය",
    "immunisations": "එන්නත්",
    "implants": "බද්ධ කළ උපකරණ",
    "body": "ශරීරය සහ රුධිරය",
    "pregnancy": "ගර්භණීභාවය",
    "lifestyle": "ජීවන රටාව",
    "emergency_contact": "හදිසි සම්බන්ධතාවය",
}


def _scalar_line(field: str, value, si: bool) -> str:
    lbl = _FIELD_LABELS.get(field, (field, field))[1 if si else 0]
    if isinstance(value, str) and value in _VALUE_LABELS:
        shown = _VALUE_LABELS[value][1 if si else 0]
    elif isinstance(value, float) and value.is_integer():
        shown = str(int(value))  # 175.0 is a height nobody writes that way
    else:
        shown = str(value)
    unit = {"heightCm": "cm", "weightKg": "kg"}.get(field)
    return f"{lbl}: {shown} {unit}".strip() if unit else f"{lbl}: {shown}"


def _render_report(state: AyuState) -> str:
    si = _lang(state) == "SI"
    profile = state.get("draft_profile") or {}
    lines = ["**ඔබේ සෞඛ්‍ය තොරතුරු**" if si else "**Your health profile**", ""]
    asked = set(state.get("plan") or [])

    def block(section: Section, entries: list[str], status: str | None):
        lines.append(f"**{_TITLES_SI[section.key] if si else section.title}**")
        if entries:
            lines.extend(f"- {e}" for e in entries)
        elif status == "NONE":
            lines.append("- " + ("නැත" if si else "None"))
        else:
            lines.append("- " + ("තවම දන්නේ නැත" if si else "Not answered"))
        lines.append("")

    for section in SECTIONS:
        if section.key not in asked:
            continue
        if section.shape == "LIST":
            status = profile.get(status_payload_key(section.status_key))
            entries: list[str] = []
            if section.target == "allergies":
                entries = [
                    str(a.get("allergen") or "?")
                    + (f" — {a['reaction']}" if a.get("reaction") else "")
                    + (f" ({a['severity']})" if a.get("severity") not in (None, "UNKNOWN") else "")
                    + (f" [{a['kind']}]" if a.get("kind") else "")
                    for a in state.get("draft_allergies") or []
                ]
            elif section.target == "conditions":
                entries = [
                    str(c.get("condition") or "?") for c in state.get("draft_conditions") or []
                ]
            elif section.target == "medications":
                entries = [
                    str(m.get("drugName") or "?")
                    + (f" — {m['dosage']}" if m.get("dosage") else "")
                    + (f", {m['frequency']}" if m.get("frequency") else "")
                    for m in state.get("draft_medications") or []
                ]
            elif section.target == "history":
                kinds = {section.history_kind}
                if section.history_kind == "SURGERY":
                    kinds.add("HOSPITALISATION")
                entries = [
                    str(h.get("label") or "?")
                    + (f" ({h['relationship']})" if h.get("relationship") else "")
                    + (f" — {h['occurredYear']}" if h.get("occurredYear") else "")
                    for h in state.get("draft_history") or []
                    if h["kind"] in kinds
                ]
            block(section, entries, status)
        else:
            vals = [
                _scalar_line(f, profile[f], si)
                for f in section.profile_fields
                if profile.get(f) is not None
            ]
            block(section, vals, "LISTED" if vals else None)

    return "\n".join(lines).strip()


def show_report(state: AyuState) -> Command:
    """Show everything gathered and ask the patient to confirm or change it.

    Nothing has reached the database at this point. A health profile is
    read by clinicians who will act on it, so the patient sees exactly what
    will be stored, in their own language, before it is.
    """
    language = _lang(state)
    answer = interrupt(
        {
            "type": "ayu_report",
            "report": _render_report(state),
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
    return Command(
        goto="apply_edit",
        update={"reported": True, "messages": [HumanMessage(content=instruction)]},
    )


def apply_edit(state: AyuState) -> Command:
    """Work out which section the patient wants changed, and re-open it."""
    language = _lang(state)
    instruction = _last_answer(state)
    asked = [BY_KEY[k] for k in (state.get("plan") or []) if k in BY_KEY]

    key = llm_io.plan_sections(
        f"The patient reviewed their profile and said: {instruction}", asked
    )
    chosen = key[0] if key else None
    if not chosen:
        msg = (
            "කුමන කොටසද වෙනස් කරන්න ඕන කියලා මට තේරුණේ නැහැ. නැවත කියන්න පුළුවන්ද?"
            if language == "SI"
            else "I didn't catch which part you'd like to change — could you say it again?"
        )
        return Command(goto="show_report", update={"messages": [AIMessage(content=msg)]})

    section = BY_KEY[chosen]
    update: dict = {
        "plan": [chosen],
        "cursor": 0,
        "phase": "OPEN",
        "current_item": {},
        "item_queue": [],
        "chasing": [],
        "attempted": [],
    }
    # An edit REPLACES that section rather than appending to it.
    if section.target == "allergies":
        update["draft_allergies"] = []
    elif section.target == "conditions":
        update["draft_conditions"] = []
    elif section.target == "medications":
        update["draft_medications"] = []
    elif section.target == "history":
        kinds = {section.history_kind}
        if section.history_kind == "SURGERY":
            kinds.add("HOSPITALISATION")
        update["draft_history"] = [
            h for h in (state.get("draft_history") or []) if h["kind"] not in kinds
        ]
    return Command(goto="compose", update=update)


async def save_profile(state: AyuState) -> dict:
    language = _lang(state)
    from datetime import datetime, timezone

    payload = {
        "profile": {
            **(state.get("draft_profile") or {}),
            "preferredLanguage": language,
            # Ayu has just been through the profile with them, so the next
            # nudge is a month away. This used to pass null, which was a
            # silent no-op while the RPC coalesced nulls away; now that a
            # null genuinely clears the clock (migration 20260919000000) it
            # has to say what it means, or finishing an interview would make
            # the bubble start prompting again immediately.
            "ayuLastPromptedAt": datetime.now(timezone.utc).isoformat(),
        },
        "allergies": state.get("draft_allergies") or [],
        "conditions": state.get("draft_conditions") or [],
        "medications": state.get("draft_medications") or [],
        "history": state.get("draft_history") or [],
    }
    # Only a full intake completes anything — a gap-check that filled two
    # sections has not.
    if (state.get("mode") or "INTAKE") == "INTAKE":
        payload["profile"]["profileCompletedAt"] = datetime.now(timezone.utc).isoformat()

    try:
        await _save(state["patient_jwt"], payload)
    except RpcError as exc:
        return {
            "messages": [
                AIMessage(
                    content=(f"මට එය සුරැකීමට නොහැකි විය: {exc}" if language == "SI"
                             else f"I couldn't save that: {exc}")
                )
            ]
        }
    return {"saved": True, "messages": [AIMessage(content=SAVED[language])]}
