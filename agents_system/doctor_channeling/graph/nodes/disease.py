"""disease_agent, ask_followup, explain_condition_node, offer_doctor.

disease_agent scores candidate diseases against the Neo4j graph using
fuzzy symptom matching; if unconfident it loops through ask_followup
(interrupt) up to MAX_ROUNDS times, otherwise explains the top
candidate and offers to find a doctor for it (also an interrupt).
"""

from langchain_core.messages import AIMessage
from langgraph.types import Command, interrupt

from config import CONFIDENCE_THRESHOLD, MAX_FOLLOWUP_ROUNDS
from llm import text_llm
from schemas import FollowupQuestion
from state import GraphState
from tools.neo4j_tools import find_diseases_for_symptoms


def disease_agent(state: GraphState) -> dict:
    symptoms = state.get("symptoms", [])
    candidates = find_diseases_for_symptoms(symptoms)

    confidence = 0.0
    if candidates and symptoms:
        top = candidates[0]
        confidence = min(1.0, top.get("matches", 0) / max(1, len(symptoms)))

    return {"candidate_diseases": candidates, "confidence": confidence}


def should_ask_followup(state: GraphState) -> str:
    confidence = state.get("confidence", 0.0)
    round_ = state.get("round", 0)
    if confidence < CONFIDENCE_THRESHOLD and round_ < MAX_FOLLOWUP_ROUNDS:
        return "ask_followup"
    return "explain_condition_node"


def ask_followup(state: GraphState) -> dict:
    candidates = state.get("candidate_diseases", [])
    names = ", ".join(c.get("disease_name", "") for c in candidates[:3]) or "your condition"

    try:
        structured = text_llm.with_structured_output(FollowupQuestion, method="json_schema")
        result: FollowupQuestion = structured.invoke(
            [
                {
                    "role": "system",
                    "content": (
                        "You are a medical triage assistant. The patient's symptoms so far "
                        f"suggest possible conditions: {names}. Ask ONE short, specific "
                        "follow-up question to help narrow this down (e.g. about another "
                        "symptom, duration, or severity)."
                    ),
                },
                {"role": "user", "content": f"Symptoms so far: {', '.join(state.get('symptoms', []))}"},
            ]
        )
        question = result.question
    except Exception:  # noqa: BLE001 - graceful fallback if structured output fails
        question = "Can you tell me more about your symptoms — any other discomfort, or how long you've had them?"

    answer = interrupt({"type": "ask_followup", "question": question})

    symptoms = state.get("symptoms", []) + [str(answer).strip().lower()]
    return {"symptoms": symptoms, "round": state.get("round", 0) + 1}


def explain_condition_node(state: GraphState) -> dict:
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

    return {
        "confirmed_disease": confirmed,
        "condition_explanation": explanation,
        "messages": [AIMessage(content=explanation)],
    }


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
