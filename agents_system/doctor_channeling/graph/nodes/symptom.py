"""symptom_agent — extracts/normalizes symptom phrases from the
conversation into state['symptoms'], merging with prior rounds."""

import re

from llm import text_llm
from schemas import SymptomExtraction
from state import GraphState

EXTRACTION_PROMPT = """Extract the patient's symptoms from this conversation as a short \
list of normalized, catalog-style medical terms (e.g. "headache" not "my head hurts", \
"fever" not "feeling hot"). Only include symptoms actually mentioned. If none, return an \
empty list."""

_SPLIT_RE = re.compile(r"[,.;\n]| and ")


def _keyword_fallback(text: str) -> list[str]:
    known = [
        "headache", "fever", "cough", "cold", "sore throat", "nausea", "vomiting",
        "fatigue", "chest pain", "shortness of breath", "dizziness", "rash",
        "abdominal pain", "back pain", "joint pain", "diarrhea",
    ]
    t = text.lower()
    return [k for k in known if k in t]


def symptom_agent(state: GraphState) -> dict:
    recent_text = " ".join(
        str(getattr(m, "content", "")) for m in state.get("messages", [])[-4:]
    )

    extracted: list[str] = []
    try:
        structured = text_llm.with_structured_output(SymptomExtraction, method="json_mode")
        result: SymptomExtraction = structured.invoke(
            [
                {"role": "system", "content": EXTRACTION_PROMPT},
                {"role": "user", "content": recent_text},
            ]
        )
        extracted = [s.strip().lower() for s in result.symptoms if s.strip()]
    except Exception:  # noqa: BLE001 - fall back to keyword matching if structured output fails
        extracted = _keyword_fallback(recent_text)

    if not extracted:
        extracted = _keyword_fallback(recent_text)

    prior = state.get("symptoms", [])
    merged = list(dict.fromkeys(prior + extracted))
    return {"symptoms": merged}
