"""disease_agent, ask_followup, explain_condition_node, offer_doctor.

disease_agent scores candidate diseases against the Neo4j graph using
hybrid symptom matching, then makes one LLM call — informed by that
retrieval, not templated against it — that decides BOTH whether enough
is known to conclude and, if not, the single best next question to ask.
should_ask_followup just routes on that decision; ask_followup just asks
whatever question was already decided. MAX_FOLLOWUP_ROUNDS
(config, env-configurable) is a hard ceiling the LLM's judgment cannot
exceed, not the primary stopping signal — see disease_agent below.
"""

from collections import Counter

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.types import Command, interrupt

from utils.config import CONFIDENCE_THRESHOLD, MAX_FOLLOWUP_ROUNDS, MIN_SYMPTOMS_BEFORE_DIAGNOSIS
from utils.llm import text_llm
from src.agent_workflow.retrevel.schemas import FollowupDecision
from src.agent_workflow.retrevel.state import GraphState
from src.agent_workflow.retrevel.tools.neo4j_tools import (
    find_diseases_for_symptoms_hybrid,
    get_symptoms_for_diseases,
)
from src.agent_workflow.retrevel.tools.postgres_tools import RpcError, create_treatment
from src.agent_workflow.retrevel.streaming import emit_thinking

FOLLOWUP_DECISION_PROMPT = """You are a doctor conducting a triage interview. You're given \
the patient's symptoms so far and the candidate conditions a medical knowledge graph has \
matched against them. Decide whether you now have enough information to explain a likely \
condition to the patient, or whether one more targeted follow-up question would \
meaningfully help narrow things down.

Don't ask out of habit — every extra question costs the patient time. If the graph match \
confidence is already high and the presentation is a classic, mild, non-urgent picture \
(e.g. a common cold, tension headache, mild gastroenteritis), conclude now rather than \
asking more just to be thorough. Save follow-up questions for when they'd actually change \
the answer: the picture is genuinely ambiguous between multiple candidates, confidence is \
low, or something in the symptoms could point to a more serious condition worth ruling out.

If you decide to ask a question, pick whatever would most help a doctor tell apart the \
candidate conditions right now — it can be about a symptom's presence, its duration, \
severity, timing, what triggers or relieves it, or an associated symptom — whatever is \
medically most useful, not necessarily one of the "known differentiating symptoms" \
listed below (that list is reference context from the graph, not a required menu to pick \
from). Phrase it naturally, in plain everyday language, as one short question. Never ask \
about something the patient already told you.

The candidate conditions and known symptoms below are in English regardless of what \
language the patient is using — that's just the knowledge base's own language, not a cue. \
Write the "question" field itself in the SAME language the patient's own messages are in \
(a sample of their most recent message is given below) — if they've been writing in \
Sinhala, ask in Sinhala; if English, ask in English."""


def _last_human_text(messages: list, max_len: int = 300) -> str:
    """Most recent patient message, as a language cue for LLM calls that
    generate patient-facing text — everything else in this module (symptom
    names, disease/specialty names, graph data) stays English regardless
    of what language the patient is using, since that's what the
    knowledge graph and Postgres are seeded in; only the phrasing of
    what's actually shown to the patient should mirror their language."""
    for m in reversed(messages or []):
        if getattr(m, "type", "") == "human":
            return str(getattr(m, "content", ""))[:max_len]
    return ""


def _decide_followup(
    candidates: list[dict],
    known_symptoms: list[str],
    confidence: float,
    round_: int,
    history: list[dict],
    patient_message_sample: str = "",
    force_continue: bool = False,
) -> tuple[bool, str | None]:
    """One LLM call, fully dynamic — informed by the current Neo4j
    retrieval (candidate conditions + their graph-known symptoms) rather
    than mechanically constrained to it. Falls back to the old
    confidence-threshold heuristic (and a graph-symptom question) if the
    call fails, so a provider hiccup degrades gracefully instead of
    stalling the conversation.

    force_continue=True (too few symptoms on record yet — see
    disease_agent's MIN_SYMPTOMS_BEFORE_DIAGNOSIS check) still asks the
    LLM to generate a genuinely dynamic question — it just isn't given
    the option to conclude yet, so this never falls back to a canned
    question just because we're not letting it stop."""
    names_with_desc = "; ".join(
        f"{c.get('disease_name', '')} ({c.get('specialty', '')}): {c.get('disease_description') or 'n/a'}"
        for c in candidates[:3]
    ) or "no strong candidates yet"
    graph_symptoms = _unmentioned_candidate_symptoms(candidates, known_symptoms)[:8]
    prior_qa = "; ".join(f"Q: {h['question']} A: {h['answer']}" for h in history) or "none yet"

    try:
        emit_thinking("Deciding what to ask next...")
        structured = text_llm.with_structured_output(FollowupDecision, method="json_schema")
        system_prompt = FOLLOWUP_DECISION_PROMPT
        if force_continue:
            system_prompt += (
                "\n\nOnly one or two symptoms are on record so far — that's not enough to "
                "conclude yet no matter how it looks. You must ask a follow-up question "
                "this round; set ready_to_conclude to false and always provide a question."
            )
        result: FollowupDecision = structured.invoke(
            [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        f"Candidate conditions from the knowledge graph: {names_with_desc}.\n"
                        f"Symptoms mentioned so far: {', '.join(known_symptoms) or 'none yet'}.\n"
                        "Known differentiating symptoms for these conditions (reference only): "
                        f"{', '.join(graph_symptoms) or 'none on record'}.\n"
                        f"Follow-up questions already asked this conversation, and how the "
                        f"patient answered — do NOT ask about the same thing again: {prior_qa}.\n"
                        f"Graph match confidence so far: {confidence:.2f} (0-1). This would be "
                        f"follow-up question #{round_ + 1}.\n"
                        f"Sample of the patient's own most recent message, for language only "
                        f"(write your question in this same language): "
                        f"{patient_message_sample or 'not available, use English'}"
                    ),
                },
            ]
        )
        if force_continue:
            question = result.question or (
                f"Do you also have {graph_symptoms[0].lower()}?"
                if graph_symptoms
                else "Are you noticing any other symptoms alongside this?"
            )
            return False, question
        if result.ready_to_conclude or not result.question:
            return True, None
        return False, result.question
    except Exception:  # noqa: BLE001 - graceful fallback if structured output fails
        if not force_continue and confidence >= CONFIDENCE_THRESHOLD:
            return True, None
        if graph_symptoms:
            return False, f"Do you also have {graph_symptoms[0].lower()}?"
        return False, "Are you noticing any other symptoms alongside this?"


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

    round_ = state.get("round", 0)
    update = {"candidate_diseases": candidates, "confidence": confidence}

    # Hard ceiling always wins, even over the min-symptoms floor below —
    # the graph must terminate somewhere no matter what the LLM thinks.
    # This is the only case that skips the LLM call — no question is
    # needed when we're concluding regardless of what it would ask.
    if round_ >= MAX_FOLLOWUP_ROUNDS:
        update["llm_ready_to_conclude"] = True
        update["llm_followup_question"] = None
        return update

    # Like a real triage conversation: never let the LLM decide it's done
    # off just one or two mentioned symptoms, no matter how "confident"
    # the raw match looks. Still asks the LLM for a genuinely dynamic
    # question (force_continue=True) — this isn't a fallback-to-canned-text
    # path, only a "you may not conclude yet" constraint on the same call.
    force_continue = len(symptoms) < MIN_SYMPTOMS_BEFORE_DIAGNOSIS
    history = state.get("followup_history", [])
    patient_message_sample = _last_human_text(state.get("messages", []))

    ready, question = _decide_followup(
        candidates, symptoms, confidence, round_, history, patient_message_sample, force_continue
    )
    update["llm_ready_to_conclude"] = ready
    update["llm_followup_question"] = question
    return update


def should_ask_followup(state: GraphState) -> str:
    if state.get("llm_ready_to_conclude", False):
        return "explain_condition_node"
    return "ask_followup"


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
    """The question itself was already decided by disease_agent's LLM call
    (informed by that round's Neo4j retrieval) — this node just asks it."""
    question = state.get("llm_followup_question") or "Are you noticing any other symptoms alongside this?"

    answer = interrupt({"type": "ask_followup", "question": question})
    answer_raw = str(answer).strip()
    answer_text = answer_raw.lower()

    symptoms = state.get("symptoms", []) + [answer_text]
    history = state.get("followup_history", []) + [{"question": question, "answer": answer_text}]
    return {
        "symptoms": symptoms,
        "round": state.get("round", 0) + 1,
        "followup_history": history,
        # Previously only sent as an ephemeral SSE "interrupt" event, never
        # persisted — so it vanished on a history reload, and no downstream
        # node reading state["messages"] (routing, doctor-search extraction,
        # the language sample used for Sinhala replies) ever saw the
        # follow-up Q&A actually happened. Appending here (add_messages
        # reducer, so this appends rather than replacing) fixes both.
        "messages": [AIMessage(content=question), HumanMessage(content=answer_raw)],
    }


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

    specialty = confirmed.get("specialty") or "a doctor"
    patient_message_sample = _last_human_text(state.get("messages", []))
    prompt = (
        f"The patient's symptoms most closely match '{confirmed.get('disease_name')}' "
        f"(description: {confirmed.get('disease_description') or 'n/a'}) in our knowledge "
        "base — but this is a graph match, not a confirmed diagnosis. Write a short, "
        "plain-language, non-alarming message for the patient that:\n"
        "1. Describes what their symptoms seem to point to, using tentative language "
        "throughout — \"it seems like this could be...\", \"this sounds like it may be...\", "
        "\"this looks similar to...\". Never state the condition as settled fact (never "
        "\"you have X\" or \"this is X\").\n"
        f"2. Recommends seeing a {specialty} to get it properly checked out, as the "
        "natural next step — phrase it like \"it would be best to see a "
        f"{specialty}\" or similar, not a bare instruction.\n"
        "3. Ends with a clear disclaimer that this is not a medical diagnosis.\n\n"
        "The disease/specialty names above are in English regardless of what language the "
        "patient is using — that's just the knowledge base's own language, not a cue. Write "
        "the message itself in the SAME language the patient has been writing in. Sample of "
        f"their most recent message, for language only: "
        f"{patient_message_sample or 'not available, use English'}"
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
    specialty = confirmed.get("specialty") if confirmed else None
    # Same "don't state it sharply" rule as explain_condition_node's message
    # above — offer a specialty, not the graph-matched disease name, since
    # that reads like confirming a diagnosis rather than suggesting a
    # next step. `condition_name` stays on the interrupt payload as
    # internal metadata (unused by the client UI) for anything that
    # later wants it.
    #
    # "a specialist in {specialty}" reads correctly for every specialty
    # name in the graph (Cardiology, Infectious Diseases, Obstetrics and
    # Gynaecology, ...) without needing a/an logic — none of them are
    # actually doctor-type nouns like "Cardiologist", so "find a
    # {specialty}" alone doesn't parse. General Practitioner is the one
    # exception — it already reads as a role, not a field.
    if not specialty:
        offer_message = "Would you like me to find a doctor for you?"
    elif specialty == "General Practitioner":
        offer_message = "Would you like me to find a General Practitioner for you?"
    else:
        offer_message = f"Would you like me to find a specialist in {specialty} for you?"

    answer = interrupt(
        {
            "type": "offer_doctor",
            "condition": condition_name,
            "message": offer_message,
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
