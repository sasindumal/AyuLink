"""manager_agent — routes every fresh turn to clinical / doctor_search /
booking. Also the re-entry point after a HITL node hands control back
with a forced_route (skips reclassification).

No "general" catch-all route. "booking" is only reachable via an
explicit booking-management keyword OR when the thread already has a
booking_result (so a booked treatment's follow-up chat defaults there
— that's the whole point of tracking booking state in the thread).
Without either signal, the tiny local model tends to guess "booking"
for any vaguely help-seeking message when it's one of only three
options, so an unsignalled "booking" verdict from the LLM is
downgraded rather than trusted outright."""

from llm import text_llm
from schemas import RouteDecision
from state import GraphState

ROUTES = ("clinical", "doctor_search", "booking")

BOOKING_KEYWORDS = (
    "book", "confirm appointment", "select slot", "book now", "cancel",
    "reschedule", "resched", "move my appointment", "change my appointment",
    "status of my", "my booking", "my appointment",
)
DOCTOR_SEARCH_KEYWORDS = (
    "find a doctor", "find doctor", "cardiologist", "specialist near",
    "search doctor", "channeling center",
)

ROUTER_PROMPT = """You are a routing classifier for a medical assistant chatbot. \
Given the conversation so far, decide which path handles the user's latest message:

- "clinical": the user describes ANY physical or mental symptom, sensation, illness, \
or discomfort — even mild, vague, or unusual ones (tingling, numbness, dizziness, \
rash, buzzing in the ear, trouble sleeping, feeling off, etc.) — or wants help \
figuring out what's wrong with them. Also the default when a message doesn't \
clearly fit the other two routes.
- "doctor_search": the user directly asks to find/search a doctor, specialist, or \
clinic (not because of symptom triage) — e.g. "find me a cardiologist near Colombo".
- "booking": the user wants to book, confirm, or select an appointment slot that was \
already presented to them, OR wants to cancel/reschedule/check the status of an \
appointment they already have.

Examples:
"I've had a tingling in my toe for two days" -> clinical
"my ear keeps buzzing" -> clinical
"I feel a bit off today, hard to explain" -> clinical
"Hello, what can you help me with?" -> clinical
"find me a cardiologist near Colombo" -> doctor_search
"book the 10am slot" -> booking
"cancel my appointment" -> booking
"can you move my appointment to a different day" -> booking
"what's the status of my booking" -> booking

Respond with only the route."""


def _keyword_route(text: str) -> str | None:
    t = text.lower()
    if any(w in t for w in BOOKING_KEYWORDS):
        return "booking"
    if any(w in t for w in DOCTOR_SEARCH_KEYWORDS):
        return "doctor_search"
    return None


def manager_agent(state: GraphState) -> dict:
    forced = state.get("forced_route")
    if forced:
        update = {"route": forced, "forced_route": None}
        if forced == "clinical":
            update["round"] = 0
            update["confidence"] = 0.0
        if forced == "doctor_search" and state.get("route") != "doctor_search":
            update.update(_fresh_doctor_search_state())
        return update

    last_message = state["messages"][-1] if state.get("messages") else None
    text = str(getattr(last_message, "content", "")) if last_message else ""
    has_existing_booking = bool(state.get("booking_result"))
    keyword_route = _keyword_route(text)

    route = None
    try:
        structured = text_llm.with_structured_output(RouteDecision, method="json_schema")
        decision: RouteDecision = structured.invoke(
            [
                {"role": "system", "content": ROUTER_PROMPT},
                *[
                    {
                        "role": "user" if m.type == "human" else "assistant",
                        "content": str(m.content),
                    }
                    for m in state.get("messages", [])[-6:]
                ],
            ]
        )
        if decision.route in ROUTES:
            route = decision.route
    except Exception:  # noqa: BLE001 - LM Studio may not support structured output for every model
        route = None

    if route is None:
        route = keyword_route or "clinical"
    elif route == "booking" and not (keyword_route == "booking" or has_existing_booking):
        # No real signal for booking (no keyword, no existing booking in
        # this thread) — the small model over-picks "booking" as the
        # closest-sounding option when unsure. Fall back to whatever the
        # keywords say, or clinical.
        route = keyword_route or "clinical"

    update = {"route": route}
    prior_route = state.get("route")
    if route == "clinical" and prior_route != "clinical":
        update["round"] = 0
        update["confidence"] = 0.0
        update["symptoms"] = []
    if route == "doctor_search" and prior_route != "doctor_search":
        update.update(_fresh_doctor_search_state())
    return update


def _fresh_doctor_search_state() -> dict:
    return {
        "doctor_pool": [],
        "top5": [],
        "selected_slot": None,
        "location_pref": None,
        "time_pref": None,
        "location_asked": False,
        "availability_annotated": False,
    }
