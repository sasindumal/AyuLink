"""disease_agent, ask_followup, explain_condition_node, offer_doctor.

disease_agent scores candidate diseases against the Neo4j graph using
fuzzy symptom matching; if unconfident it loops through ask_followup
(interrupt) up to MAX_ROUNDS times, otherwise explains the top
candidate and offers to find a doctor for it (also an interrupt).
"""

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command, interrupt

from config import CONFIDENCE_THRESHOLD, MAX_FOLLOWUP_ROUNDS, MIN_SYMPTOMS_BEFORE_DIAGNOSIS
from llm import text_llm
from schemas import FollowupQuestion
from state import GraphState
from tools.neo4j_tools import find_diseases_for_symptoms
from tools.postgres_tools import RpcError, create_treatment


def disease_agent(state: GraphState) -> dict:
    symptoms = state.get("symptoms", [])
    candidates = find_diseases_for_symptoms(symptoms)

    confidence = 0.0
    if candidates and symptoms:
        top_matches = candidates[0].get("matches", 0)
        raw_ratio = min(1.0, top_matches / max(1, len(symptoms)))
        # A handful of common symptoms (e.g. "fever") match many diseases
        # equally — that tie is itself a sign of low confidence, even
        # though the raw ratio alone would say 100%. Penalize by how many
        # candidates are tied at the top match count.
        tied_at_top = sum(1 for c in candidates if c.get("matches", 0) == top_matches)
        confidence = raw_ratio / tied_at_top

    return {"candidate_diseases": candidates, "confidence": confidence}


def should_ask_followup(state: GraphState) -> str:
    confidence = state.get("confidence", 0.0)
    round_ = state.get("round", 0)
    symptoms = state.get("symptoms", [])

    if round_ >= MAX_FOLLOWUP_ROUNDS:
        return "explain_condition_node"
    # Like a real triage conversation: never conclude off just one or two
    # mentioned symptoms, no matter how "confident" the raw match looks.
    if len(symptoms) < MIN_SYMPTOMS_BEFORE_DIAGNOSIS:
        return "ask_followup"
    if confidence < CONFIDENCE_THRESHOLD:
        return "ask_followup"
    return "explain_condition_node"


FOLLOWUP_SYSTEM_PROMPT = """You are a doctor doing a triage interview. Never jump to a \
diagnosis from a single vague symptom — ask about OTHER SYMPTOMS the patient may also \
have, one at a time, specifically the kind that would help tell apart the possible \
conditions listed below (e.g. "do you also have X?" or "have you noticed Y?"). Do NOT \
ask about duration, severity, or what makes it better/worse — only ask whether another \
specific symptom is present. Ask ONE question only, in plain everyday language, not \
clinical jargon."""


def ask_followup(state: GraphState) -> dict:
    candidates = state.get("candidate_diseases", [])
    names = ", ".join(c.get("disease_name", "") for c in candidates[:3]) or "your condition"
    round_ = state.get("round", 0)

    try:
        structured = text_llm.with_structured_output(FollowupQuestion, method="json_schema")
        result: FollowupQuestion = structured.invoke(
            [
                {
                    "role": "system",
                    "content": (
                        f"{FOLLOWUP_SYSTEM_PROMPT}\n\nPossible conditions given the symptoms "
                        f"so far: {names}."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Symptoms mentioned so far: {', '.join(state.get('symptoms', []))}. "
                    f"This is follow-up question #{round_ + 1}.",
                },
            ]
        )
        question = result.question
    except Exception:  # noqa: BLE001 - graceful fallback if structured output fails
        question = "Are you noticing any other symptoms alongside this?"

    answer = interrupt({"type": "ask_followup", "question": question})

    symptoms = state.get("symptoms", []) + [str(answer).strip().lower()]
    return {"symptoms": symptoms, "round": state.get("round", 0) + 1}


async def explain_condition_node(state: GraphState, config: RunnableConfig) -> dict:
    candidates = state.get("candidate_diseases", [])
    confirmed = candidates[0] if candidates else None

    if not confirmed:
        explanation = (
            "I wasn't able to match your symptoms to a specific condition in our "
            "knowledge base. This is not a medical diagnosis — please consider "
            "describing your symptoms to a doctor directly."
        )
        return {
            "confirmed_disease": None,
            "condition_explanation": explanation,
            "messages": [AIMessage(content=explanation)],
        }

    prompt = (
        f"Write a short, plain-language, non-alarming explanation of the condition "
        f"'{confirmed.get('disease_name')}' "
        f"(description: {confirmed.get('disease_description') or 'n/a'}) for a patient. "
        "End with a clear disclaimer that this is not a medical diagnosis."
    )
    response = text_llm.invoke([{"role": "user", "content": prompt}])
    explanation = str(response.content)

    update = {
        "confirmed_disease": confirmed,
        "condition_explanation": explanation,
        "messages": [AIMessage(content=explanation)],
    }

    # Best-effort — a Treatment record makes this diagnosis visible/resumable
    # in the app, but a Postgres hiccup here must not break the diagnosis turn.
    try:
        thread_id = config["configurable"]["thread_id"]
        treatment = await create_treatment(
            state["patient_jwt"],
            thread_id,
            confirmed.get("disease_name", "Unknown"),
            specialty=confirmed.get("specialty"),
            description=explanation,
        )
        if treatment and treatment.get("id"):
            update["treatment_id"] = treatment["id"]
    except (RpcError, KeyError):
        pass

    return update


def offer_doctor(state: GraphState) -> Command:
    confirmed = state.get("confirmed_disease")
    condition_name = confirmed.get("disease_name") if confirmed else "this"

    answer = interrupt(
        {
            "type": "offer_doctor",
            "condition": condition_name,
            "message": f"Would you like me to find a doctor for {condition_name}?",
        }
    )

    wants_doctor = str(answer).strip().lower() in ("yes", "y", "true", "1")
    if not wants_doctor:
        return Command(goto="__end__")

    specialty_hint = confirmed.get("specialty") if confirmed else None
    return Command(
        goto="manager_agent",
        update={"forced_route": "doctor_search", "specialty_hint": specialty_hint},
    )
