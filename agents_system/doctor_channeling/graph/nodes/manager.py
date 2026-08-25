"""manager_agent — routes every fresh turn to general / clinical /
doctor_search / booking. Also the re-entry point after a HITL node
hands control back with a forced_route (skips reclassification)."""

from llm import text_llm
from schemas import RouteDecision
from state import GraphState

ROUTES = ("general", "clinical", "doctor_search", "booking")

ROUTER_PROMPT = """You are a routing classifier for a medical assistant chatbot. \
Given the conversation so far, decide which path handles the user's latest message:

- "clinical": the user describes symptoms, an illness, or wants help figuring out \
what's wrong with them.
- "doctor_search": the user directly asks to find/search a doctor, specialist, or \
clinic (not because of symptom triage) — e.g. "find me a cardiologist near Colombo".
- "booking": the user wants to book, confirm, or select an appointment slot that was \
already presented to them.
- "general": anything else — greetings, general health questions, app questions, \
unrelated chat.

Respond with only the route."""


def _keyword_fallback(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ("book", "confirm appointment", "select slot", "book now")):
        return "booking"
    if any(w in t for w in ("find a doctor", "find doctor", "cardiologist", "specialist near", "search doctor", "channeling center")):
        return "doctor_search"
    if any(w in t for w in ("pain", "fever", "hurt", "symptom", "feel", "sick", "ache", "cough", "cold", "vomit")):
        return "clinical"
    return "general"


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

    route = None
    try:
        structured = text_llm.with_structured_output(RouteDecision, method="json_mode")
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
    except Exception:  # noqa: BLE001 - LM Studio may not support strict json_mode for every model
        route = None

    if route is None:
        route = _keyword_fallback(text)

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
