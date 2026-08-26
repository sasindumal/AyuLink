"""disease_agent, ask_followup, explain_condition_node, offer_doctor.

disease_agent scores candidate diseases against the Neo4j graph using
fuzzy symptom matching; if unconfident it loops through ask_followup
(interrupt) up to MAX_ROUNDS times, otherwise explains the top
candidate and offers to find a doctor for it (also an interrupt).
"""

from collections import Counter

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command, interrupt

from utils.config import CONFIDENCE_THRESHOLD, MAX_FOLLOWUP_ROUNDS, MIN_SYMPTOMS_BEFORE_DIAGNOSIS
from utils.llm import text_llm
from src.agent_workflow.retrevel.schemas import FollowupQuestion
from src.agent_workflow.retrevel.state import GraphState
from src.agent_workflow.retrevel.tools.neo4j_tools import (
    find_diseases_for_symptoms_hybrid,
    get_symptoms_for_diseases,
)
from src.agent_workflow.retrevel.tools.postgres_tools import RpcError, create_treatment


def disease_agent(state: GraphState) -> dict:
    symptoms = state.get("symptoms", [])
    candidates = find_diseases_for_symptoms_hybrid(symptoms)

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


FOLLOWUP_SYSTEM_PROMPT = """You are a doctor doing a triage interview. Ask the patient \
whether they also have ONE specific symptom from the "candidate symptoms" list below — \
pick whichever one would best help tell apart the possible conditions listed. Phrase it \
naturally in plain everyday language (e.g. "do you also have X?" or "have you noticed \
Y?"). Do NOT ask about duration, severity, or what makes it better/worse, and do NOT \
mention a symptom that isn't in the candidate list — only ask about symptoms from that \
list."""


def _unmentioned_candidate_symptoms(candidates: list[dict], known_symptoms: list[str]) -> list[str]:
    """Queries Neo4j for the real symptom lists of the current top candidate
    diseases, drops any the patient has already mentioned, and ranks the
    rest by how differentiating they are — a symptom shared by every tied
    top candidate narrows nothing, one that appears in only some of them
    does. Grounds the follow-up question in actual graph data instead of
    the LLM's own guesses about the disease."""
    top_ids = [c["disease_id"] for c in candidates[:3] if c.get("disease_id")]
    if not top_ids:
        return []

    symptom_map = get_symptoms_for_diseases(top_ids)
    known_lower = [s.lower() for s in known_symptoms]

    counts = Counter()
    for symptom_names in symptom_map.values():
        seen_this_disease = set()
        for name in symptom_names:
            if name in seen_this_disease:
                continue
            seen_this_disease.add(name)
            already_known = any(name.lower() in k or k in name.lower() for k in known_lower)
            if not already_known:
                counts[name] += 1

    num_candidates = len(symptom_map) or 1
    # Symptoms common to every candidate (count == num_candidates) sort last —
    # they don't help distinguish between the tied options.
    ranked = sorted(counts.items(), key=lambda kv: (kv[1] == num_candidates, -kv[1]))
    return [name for name, _ in ranked]


def ask_followup(state: GraphState) -> dict:
    candidates = state.get("candidate_diseases", [])
    names = ", ".join(c.get("disease_name", "") for c in candidates[:3]) or "your condition"
    known_symptoms = state.get("symptoms", [])
    round_ = state.get("round", 0)

    graph_symptoms = _unmentioned_candidate_symptoms(candidates, known_symptoms)[:6]

    if graph_symptoms:
        try:
            structured = text_llm.with_structured_output(FollowupQuestion, method="json_schema")
            result: FollowupQuestion = structured.invoke(
                [
                    {
                        "role": "system",
                        "content": (
                            f"{FOLLOWUP_SYSTEM_PROMPT}\n\nPossible conditions given the symptoms "
                            f"so far: {names}.\nCandidate symptoms to ask about: "
                            f"{', '.join(graph_symptoms)}."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Symptoms mentioned so far: {', '.join(known_symptoms)}. "
                        f"This is follow-up question #{round_ + 1}.",
                    },
                ]
            )
            question = result.question
        except Exception:  # noqa: BLE001 - graceful fallback if structured output fails
            question = f"Do you also have {graph_symptoms[0].lower()}?"
    else:
        # No more graph-known symptoms left to ask about for these
        # candidates — fall back to a generic open question.
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
