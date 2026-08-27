"""Turns app_treatment_timeline() events into patient-facing chat messages.

These are rendered deterministically rather than through the LLM on
purpose: they carry dosages, frequencies and durations, and an LLM
restating "20 mg twice daily for 7 days" is a medication error waiting
to happen. The LLM's judgement is used where judgement is actually
wanted — deciding follow-up questions, the end-of-course check-in, and
the reminder wording the patient app schedules — not for repeating
clinical values back.

Every event carries a stable `key` from Postgres, so syncing the same
timeline twice never double-posts (see sync_care_events).
"""

from langchain_core.messages import AIMessage

FOLLOWUP_NONE = "NONE"
FOLLOWUP_MEET_SAME = "MEET_SAME_DOCTOR"
FOLLOWUP_REFER = "REFER_DOCTOR"


def _doctor_label(doctor: dict | None) -> str:
    if not doctor:
        return "your doctor"
    name = f"Dr. {doctor.get('firstName', '')} {doctor.get('lastName', '')}".strip()
    return name or "your doctor"


def _format_appointment_started(payload: dict) -> str:
    doctor = payload.get("doctorName") or "Your doctor"
    center = payload.get("centerName")
    where = f" at {center}" if center else ""
    return f"{doctor} has started your appointment{where}. Your consultation is now in progress."


def _format_medication(item: dict, index: int) -> str:
    bits = [
        b
        for b in (
            item.get("dosage"),
            item.get("frequency"),
            f"for {item['duration']}" if item.get("duration") else None,
        )
        if b
    ]
    line = f"{index}. {item.get('drugName', 'Medication')} — {' · '.join(bits)}"
    if item.get("route"):
        line += f" ({item['route']})"
    if item.get("instructions"):
        line += f"\n   Note: {item['instructions']}"
    return line


def _format_prescription_issued(payload: dict) -> str:
    doctor = _doctor_label(payload.get("doctor"))
    lines = [f"{doctor} has issued your prescription."]

    if payload.get("diagnosis"):
        lines.append(f"\nDiagnosis: {payload['diagnosis']}")

    items = payload.get("items") or []
    if items:
        lines.append("\nMedications:")
        lines.extend(_format_medication(item, i) for i, item in enumerate(items, start=1))

    plan = payload.get("followupPlan") or FOLLOWUP_NONE
    if plan == FOLLOWUP_MEET_SAME:
        lines.append(
            f"\nIf the problem is still there after you finish the course, "
            f"{doctor} has asked you to come back and see them again."
        )
    elif plan == FOLLOWUP_REFER:
        ref = payload.get("referredDoctor") or {}
        ref_name = _doctor_label(ref)
        detail = [ref_name]
        if ref.get("specialty"):
            detail.append(ref["specialty"])
        if ref.get("slmcRegNo"):
            reg = str(ref["slmcRegNo"]).strip()
            # Registration numbers are stored inconsistently — some already
            # carry the "SLMC" prefix, some are bare digits.
            detail.append(reg if reg.upper().startswith("SLMC") else f"SLMC {reg}")
        lines.append(
            f"\nIf the problem is still there after you finish the course, "
            f"{doctor} has referred you to {' · '.join(detail)}."
        )

    lines.append("\nYou can collect these at any pharmacy using your Medical ID QR.")
    return "\n".join(lines)


def _format_item_dispensed(payload: dict) -> str:
    pharmacy = payload.get("pharmacyName") or "The pharmacy"
    drug = payload.get("drugName", "your medication")
    bits = [
        b
        for b in (
            payload.get("dosage"),
            payload.get("frequency"),
            f"for {payload['duration']}" if payload.get("duration") else None,
        )
        if b
    ]
    lines = [f"{pharmacy} has dispensed {drug}."]
    if bits:
        lines.append(f"How to take it: {' · '.join(bits)}.")
    if payload.get("route"):
        lines.append(f"Route: {payload['route']}.")
    if payload.get("instructions"):
        lines.append(f"Note: {payload['instructions']}")
    return "\n".join(lines)


_FORMATTERS = {
    "APPOINTMENT_STARTED": _format_appointment_started,
    "PRESCRIPTION_ISSUED": _format_prescription_issued,
    "ITEM_DISPENSED": _format_item_dispensed,
}


def format_event(event: dict) -> str | None:
    """Patient-facing text for one timeline event, or None for an event
    type this build doesn't narrate (forward compatible: a newer database
    can add event types without breaking an older backend)."""
    formatter = _FORMATTERS.get(event.get("type", ""))
    if formatter is None:
        return None
    try:
        return formatter(event.get("payload") or {})
    except Exception:  # noqa: BLE001 - a malformed payload must not break the chat
        return None


def new_events(timeline: dict, already_synced: list[str] | None) -> list[dict]:
    """Timeline events not yet posted into the chat, oldest first."""
    seen = set(already_synced or [])
    return [
        e
        for e in (timeline.get("events") or [])
        if e.get("key") and e["key"] not in seen
    ]


def build_event_messages(events: list[dict]) -> tuple[list[AIMessage], list[str]]:
    """(messages to append, keys they covered). Keys are returned for
    every event we actually posted, so an event type we don't narrate
    isn't marked synced and can be picked up by a later build."""
    messages: list[AIMessage] = []
    keys: list[str] = []
    for event in events:
        text = format_event(event)
        if not text:
            continue
        messages.append(AIMessage(content=text))
        keys.append(event["key"])
    return messages, keys
