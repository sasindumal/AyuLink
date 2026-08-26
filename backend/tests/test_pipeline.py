"""
End-to-end diagnostic suite for the doctor-channeling agents pipeline.

Hits the LIVE FastAPI server over HTTP/SSE (not the graph in-process) so it
catches the same class of bugs a real client would hit: auth handling, event
framing, routing, the Neo4j-backed clinical loop, and HITL interrupt/resume
mechanics via the Postgres checkpointer.

Requires:
  - The backend running (see mobile/README.md "Assistant backend").
  - LM Studio running with a text model loaded.

Optional:
  - TEST_PATIENT_JWT env var: a real Supabase access token for a signed-in
    PATIENT user. Without it, every scenario that needs app_* Postgres RPCs
    (doctor search, availability, booking) is SKIPPED rather than faked —
    this script never signs in on its own. To get one: log into the patient
    app as the seeded demo patient (NIC 200012345678 / password123) and read
    `(await supabase.auth.getSession()).data.session.access_token`, e.g. by
    temporarily logging it in agentChat.ts's getAccessToken(), then:
        export TEST_PATIENT_JWT="eyJ..."

Run:
    source .venv/bin/activate
    python3 tests/test_pipeline.py
"""

import asyncio
import base64
import json
import os
import sys
import uuid

import httpx

BASE_URL = os.environ.get("AGENT_BASE_URL", "http://localhost:8000")
REAL_JWT = os.environ.get("TEST_PATIENT_JWT")


def _dummy_jwt() -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps({"sub": str(uuid.uuid4())}).encode()
    ).decode().rstrip("=")
    return f"header.{payload}.sig"


DUMMY_JWT = _dummy_jwt()


class SSE:
    def __init__(self, events: list[dict]):
        self.events = events

    def by(self, name: str) -> list[dict]:
        return [e for e in self.events if e["event"] == name]

    def has(self, name: str) -> bool:
        return len(self.by(name)) > 0

    def tokens_text(self) -> str:
        return "".join(e["data"].get("content", "") for e in self.by("token"))

    def interrupt_types(self) -> list[str]:
        return [e["data"].get("type") for e in self.by("interrupt")]

    def error_messages(self) -> list[str]:
        return [e["data"].get("message", "") for e in self.by("error")]


async def stream(client: httpx.AsyncClient, path: str, payload: dict, jwt: str, timeout=60) -> SSE:
    events = []
    headers = {"Authorization": f"Bearer {jwt}"} if jwt is not None else {}
    async with client.stream(
        "POST", f"{BASE_URL}{path}", json=payload, headers=headers, timeout=timeout
    ) as resp:
        if resp.status_code != 200:
            body = await resp.aread()
            events.append({"event": "__http_error__", "data": {"status": resp.status_code, "body": body.decode(errors="replace")}})
            return SSE(events)
        buffer = ""
        async for chunk in resp.aiter_text():
            buffer += chunk
            while "\n\n" in buffer:
                raw, buffer = buffer.split("\n\n", 1)
                event_name = "message"
                data_line = ""
                for line in raw.split("\n"):
                    if line.startswith("event:"):
                        event_name = line[len("event:"):].strip()
                    elif line.startswith("data:"):
                        data_line += line[len("data:"):].strip()
                if data_line:
                    try:
                        events.append({"event": event_name, "data": json.loads(data_line)})
                    except json.JSONDecodeError:
                        events.append({"event": "__parse_error__", "data": {"raw": data_line}})
    return SSE(events)


async def chat(client, thread_id, message, jwt=DUMMY_JWT) -> SSE:
    return await stream(client, "/chat", {"thread_id": thread_id, "message": message}, jwt)


async def resume(client, thread_id, value, jwt=DUMMY_JWT) -> SSE:
    return await stream(client, "/chat/resume", {"thread_id": thread_id, "value": value}, jwt)


def new_thread() -> str:
    return f"test-{uuid.uuid4()}"


results: list[tuple[str, bool, str]] = []


def record(name: str, ok: bool, detail: str = ""):
    results.append((name, ok, detail))
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))


# ---------------------------------------------------------------- scenarios

async def test_health(client):
    r = await client.get(f"{BASE_URL}/health", timeout=10)
    record("health check", r.status_code == 200 and r.json().get("status") == "ok", f"status={r.status_code} body={r.text}")


async def test_missing_auth_header(client):
    async with client.stream("POST", f"{BASE_URL}/chat", json={"thread_id": new_thread(), "message": "hi"}, timeout=10) as resp:
        ok = resp.status_code == 401
        record("missing Authorization header -> 401", ok, f"got {resp.status_code}")


async def test_ambiguous_message_defaults_to_clinical(client):
    """No "general" catch-all anymore — an ambiguous greeting should still
    route through the clinical path (symptom_agent finds nothing, so it
    should land on ask_followup) rather than erroring or hanging."""
    sse = await chat(client, new_thread(), "Hello, what can you help me with?")
    ok = "ask_followup" in sse.interrupt_types() and not sse.has("error")
    record(
        "ambiguous message defaults to clinical path (no general route)",
        ok,
        f"interrupts={sse.interrupt_types()} events={[e['event'] for e in sse.events]}",
    )


async def test_manage_booking_without_existing_booking(client):
    """cancel/reschedule language with no prior booking_result in state
    must degrade gracefully, same as the no-selection booking message."""
    sse = await chat(client, new_thread(), "cancel my appointment")
    ok = sse.has("done") and not sse.has("error")
    text = sse.tokens_text()
    record(
        "cancel intent with no existing booking replies gracefully",
        ok,
        f"reply={text!r} events={[e['event'] for e in sse.events]}",
    )


async def test_single_vague_symptom_asks_before_concluding(client):
    """The reported bug: "I have a fever" alone used to jump straight to a
    named disease (trivial 100% match ratio off exactly one symptom).
    It must now ask at least one clarifying question first, never
    conclude off a single vague symptom."""
    sse = await chat(client, new_thread(), "I have a fever")
    ok = "ask_followup" in sse.interrupt_types() and "offer_doctor" not in sse.interrupt_types()
    record(
        "single vague symptom triggers a follow-up question, not an instant diagnosis",
        ok,
        f"interrupts={sse.interrupt_types()} events={[e['event'] for e in sse.events]}",
    )


async def test_clinical_matched_symptom(client):
    """Multiple real symptoms, walked through follow-up rounds like a real
    triage conversation, should eventually reach offer_doctor without
    erroring or looping past MAX_FOLLOWUP_ROUNDS. Exact round count isn't
    asserted — the local LLM's symptom-normalization wording varies run to
    run (e.g. "fainting spells" vs "fainting"), which affects how many
    rounds the fuzzy Neo4j match needs to become confident."""
    thread = new_thread()
    answers = [
        "I have chest pain, shortness of breath, and fainting spells",
        "yes, also heart palpitations and dizziness",
        "it's been going on for about 3 days and feels worse when I stand up",
    ]
    sse = await chat(client, thread, answers[0])
    interrupts = sse.interrupt_types()
    rounds = 0
    while interrupts and interrupts[0] == "ask_followup" and rounds < 5:
        answer = answers[min(rounds + 1, len(answers) - 1)]
        sse = await resume(client, thread, answer)
        interrupts = sse.interrupt_types()
        rounds += 1

    ok = bool(interrupts) and interrupts[0] == "offer_doctor" and not sse.has("error")
    record(
        "clinical path: matched symptoms eventually reach offer_doctor",
        ok,
        f"rounds={rounds} interrupts={interrupts} events={[e['event'] for e in sse.events]}",
    )
    return thread, ok


async def test_offer_doctor_no(client, thread):
    sse = await resume(client, thread, "no")
    ok = sse.has("done") and not sse.has("interrupt") and not sse.has("error")
    record("offer_doctor 'no' ends the turn cleanly", ok, f"events={[e['event'] for e in sse.events]}")


async def test_clinical_unmatched_loops_then_terminates(client):
    """A partially-matching symptom set (one real catalog term + one
    made-up one, so confidence lands below CONFIDENCE_THRESHOLD) to
    exercise the ask_followup loop, distinct from a fully-matched case
    (test_clinical_matched_symptom) or a non-clinical message (general)."""
    thread = new_thread()
    sse = await chat(client, thread, "I have tingling and also a weird made-up sensation called plorbing in my foot")
    interrupts = sse.interrupt_types()
    if not interrupts:
        record(
            "clinical path: low-confidence symptoms produce an interrupt",
            False,
            f"no interrupt at all; reply={sse.tokens_text()!r} events={[e['event'] for e in sse.events]}",
        )
        return

    rounds = 0
    saw_ask_followup = interrupts[0] == "ask_followup"
    while interrupts and interrupts[0] == "ask_followup" and rounds < 5:
        rounds += 1
        sse = await resume(client, thread, "also a made-up wibbling sensation, and some more zorping")
        interrupts = sse.interrupt_types()

    terminated_correctly = bool(interrupts) and interrupts[0] in ("offer_doctor",) or sse.has("done")
    ok = saw_ask_followup and rounds <= 3 and (terminated_correctly or not sse.has("error"))
    record(
        "clinical path: unmatched symptoms loop via ask_followup then terminate (not infinite)",
        ok,
        f"rounds={rounds} final_interrupts={interrupts} events_tail={[e['event'] for e in sse.events][-4:]}",
    )


async def test_doctor_search_direct_routes_correctly(client):
    """With a dummy (unsigned) JWT, this MUST reach the Postgres RPC call and
    fail there with an auth error — that's the correct behavior and proves
    routing + tool wiring work. A JWT-unrelated error would indicate a bug."""
    sse = await chat(client, new_thread(), "Find me a cardiologist near Colombo")
    errors = sse.error_messages()
    reached_rpc = any(
        ("jwt" in e.lower() or "sign" in e.lower() or "not signed in" in e.lower()) for e in errors
    )
    ok = reached_rpc
    record(
        "direct doctor-search routes to doctor_finder_agent and reaches Postgres RPC",
        ok,
        f"errors={errors} events={[e['event'] for e in sse.events]}",
    )


async def test_booking_route_without_selection(client):
    sse = await chat(client, new_thread(), "book it now please")
    ok = sse.has("done") and not sse.has("error")
    text = sse.tokens_text()
    record(
        "booking route with nothing selected replies gracefully (no crash)",
        ok,
        f"reply={text!r} events={[e['event'] for e in sse.events]}",
    )


async def test_resume_unknown_thread(client):
    sse = await resume(client, new_thread(), "yes")
    http_err = sse.by("__http_error__")
    ok = bool(http_err) or sse.has("error") or sse.has("done")
    record("resume on a thread with no prior state fails gracefully", ok, f"events={[e['event'] for e in sse.events]}")


async def test_pdf_text_only(client):
    try:
        import pymupdf
    except ImportError:
        record("PDF upload (text-only page)", False, "pymupdf not importable")
        return

    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text(
        (72, 72),
        "Patient Report\n\nChief complaint: persistent headache and mild fever for 3 days.\n"
        "No other significant findings.",
    )
    pdf_bytes = doc.tobytes()
    doc.close()

    thread = new_thread()
    files = {"file": ("report.pdf", pdf_bytes, "application/pdf")}
    data = {"thread_id": thread}
    headers = {"Authorization": f"Bearer {DUMMY_JWT}"}

    events = []
    async with client.stream("POST", f"{BASE_URL}/chat/pdf", data=data, files=files, headers=headers, timeout=90) as resp:
        if resp.status_code != 200:
            record("PDF upload (text-only page)", False, f"HTTP {resp.status_code}: {(await resp.aread()).decode(errors='replace')}")
            return
        buffer = ""
        async for chunk in resp.aiter_text():
            buffer += chunk
            while "\n\n" in buffer:
                raw, buffer = buffer.split("\n\n", 1)
                event_name = "message"
                data_line = ""
                for line in raw.split("\n"):
                    if line.startswith("event:"):
                        event_name = line[len("event:"):].strip()
                    elif line.startswith("data:"):
                        data_line += line[len("data:"):].strip()
                if data_line:
                    events.append({"event": event_name, "data": json.loads(data_line)})

    sse = SSE(events)
    ok = (sse.has("done") or sse.has("interrupt")) and not sse.has("error")
    record(
        "PDF upload: text-only page extracts and flows through the graph",
        ok,
        f"events={[e['event'] for e in sse.events]}",
    )


# --------------------------------------------------- real-JWT-only scenarios

async def test_full_doctor_search_flow(client):
    thread = new_thread()
    sse = await chat(client, thread, "Find me a doctor", jwt=REAL_JWT)
    if sse.has("error"):
        record("real: doctor search reaches ask_location_time", False, f"errors={sse.error_messages()}")
        return
    ok = "ask_location_time" in sse.interrupt_types()
    record("real: doctor search reaches ask_location_time", ok, f"interrupts={sse.interrupt_types()}")
    if not ok:
        return

    sse = await resume(client, thread, {}, jwt=REAL_JWT)
    if sse.has("error"):
        record("real: nearest-default resume reaches present_top5", False, f"errors={sse.error_messages()}")
        return
    ok = "present_top5" in sse.interrupt_types()
    doctors = []
    for e in sse.by("interrupt"):
        if e["data"].get("type") == "present_top5":
            doctors = e["data"].get("doctors", [])
    record("real: nearest-default resume reaches present_top5", ok, f"doctor_count={len(doctors)}")
    if not ok or not doctors:
        record("real: booking flow", False, "no doctors returned to book against — check seeded availability")
        return

    chosen = doctors[0]
    sse = await resume(
        client, thread,
        {"doctor_schedule_id": chosen.get("doctor_schedule_id"), "date": chosen.get("date")},
        jwt=REAL_JWT,
    )
    text = sse.tokens_text()
    ok = ("booked" in text.lower() or "order number" in text.lower()) and not sse.has("error")
    record("real: booking a presented slot succeeds", ok, f"reply={text!r} errors={sse.error_messages()}")


async def test_full_clinical_to_booking_flow(client):
    thread = new_thread()
    sse = await chat(client, thread, "I have chest pain and shortness of breath", jwt=REAL_JWT)
    if "offer_doctor" not in sse.interrupt_types():
        record("real: clinical -> offer_doctor -> yes routes to doctor search", False, f"interrupts={sse.interrupt_types()}")
        return
    sse = await resume(client, thread, "yes", jwt=REAL_JWT)
    ok = "ask_location_time" in sse.interrupt_types() and not sse.has("error")
    record("real: clinical -> offer_doctor -> yes routes to doctor search", ok, f"interrupts={sse.interrupt_types()} errors={sse.error_messages()}")


# --------------------------------------------------------------------- main

async def main():
    async with httpx.AsyncClient() as client:
        await test_health(client)
        await test_missing_auth_header(client)
        await test_ambiguous_message_defaults_to_clinical(client)
        await test_manage_booking_without_existing_booking(client)

        await test_single_vague_symptom_asks_before_concluding(client)

        thread, matched_ok = await test_clinical_matched_symptom(client)
        if matched_ok:
            await test_offer_doctor_no(client, thread)

        await test_clinical_unmatched_loops_then_terminates(client)
        await test_doctor_search_direct_routes_correctly(client)
        await test_booking_route_without_selection(client)
        await test_resume_unknown_thread(client)
        await test_pdf_text_only(client)

        if REAL_JWT:
            await test_full_doctor_search_flow(client)
            await test_full_clinical_to_booking_flow(client)
        else:
            print(
                "\n[SKIPPED] Postgres-RPC-dependent scenarios (doctor search / "
                "availability / booking with a real session) — set TEST_PATIENT_JWT "
                "to a real patient access token to run them. See this file's docstring."
            )

    print("\n" + "=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = [n for n, ok, _ in results if not ok]
    print(f"{passed}/{len(results)} passed")
    if failed:
        print("FAILED:")
        for n in failed:
            print(f"  - {n}")
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    asyncio.run(main())
