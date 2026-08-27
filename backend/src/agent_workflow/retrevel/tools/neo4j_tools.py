"""Read-only Cypher queries against the seeded knowledge graph.

find_diseases_for_symptoms_hybrid() is the primary disease-lookup entry
point: for each patient symptom phrase it combines a fuzzy substring
CONTAINS match against Symptom.name (weight 1.0 — an exact catalog term
should always outrank a merely-similar one) with a cosine-similarity
search over the symptom_embedding_idx vector index (weight = similarity
score, floored at config.SYMPTOM_VECTOR_SIMILARITY_FLOOR), so phrasing
that doesn't literally contain a catalog term (e.g. "tummy ache" vs.
"abdominal pain") can still surface the right Symptom node. It falls
back to find_diseases_for_symptoms() (CONTAINS-only, no embedding call)
if embedding generation fails for any reason.

Queries run via session.execute_read (a managed transaction), not a
bare session.run — Aura's connections routinely go idle-stale between
requests in a long-running server process, and only managed
transactions get the driver's automatic retry on that class of
transient connection error.
"""

from neo4j import GraphDatabase

from utils import config
from utils.llm import embed_texts

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(
            config.NEO4J_URI, auth=(config.NEO4J_USERNAME, config.NEO4J_PASSWORD)
        )
    return _driver


_FIND_DISEASES_QUERY = """
UNWIND $symptoms AS symptom
MATCH (s:Symptom)
WHERE toLower(s.name) CONTAINS toLower(symptom) OR toLower(symptom) CONTAINS toLower(s.name)
MATCH (s)<-[:HAS_SYMPTOM]-(d:Disease)<-[:MANAGES]-(sp:Specialty)
RETURN d.id AS disease_id, d.name AS disease_name, d.description AS disease_description,
       sp.name AS specialty, count(DISTINCT symptom) AS matches,
       collect(DISTINCT s.name) AS matched_symptoms
ORDER BY matches DESC
LIMIT 5
"""

_SPECIALTY_FOR_DISEASE_QUERY = """
MATCH (sp:Specialty)-[:MANAGES]->(d:Disease)
WHERE toLower(d.name) = toLower($disease_name)
RETURN sp.name AS specialty
LIMIT 1
"""

_SYMPTOMS_FOR_DISEASES_QUERY = """
MATCH (d:Disease)-[:HAS_SYMPTOM]->(s:Symptom)
WHERE d.id IN $disease_ids
RETURN d.id AS disease_id, collect(DISTINCT s.name) AS symptoms
"""

_ALL_SPECIALTIES_QUERY = "MATCH (sp:Specialty) RETURN sp.name AS specialty"


def find_diseases_for_symptoms(symptoms: list[str]) -> list[dict]:
    """For each symptom phrase, fuzzy-match against Symptom.name and
    walk Symptom<-HAS_SYMPTOM-Disease<-MANAGES-Specialty, aggregating
    match counts per disease. Returns candidates sorted by match count desc."""
    if not symptoms:
        return []

    def _run(tx):
        return [dict(record) for record in tx.run(_FIND_DISEASES_QUERY, symptoms=symptoms)]

    with get_driver().session(database=config.NEO4J_DATABASE) as session:
        return session.execute_read(_run)


_EXACT_SYMPTOM_MATCH_QUERY = """
MATCH (s:Symptom)
WHERE toLower(s.name) CONTAINS toLower($symptom) OR toLower($symptom) CONTAINS toLower(s.name)
RETURN s.id AS symptom_id, s.name AS symptom_name
"""

_VECTOR_SYMPTOM_MATCH_QUERY = """
CYPHER 25
MATCH (s:Symptom)
  SEARCH s IN (
    VECTOR INDEX symptom_embedding_idx
    FOR $embedding
    LIMIT $k
  ) SCORE AS score
RETURN s.id AS symptom_id, s.name AS symptom_name, score
"""

_DISEASES_FOR_WEIGHTED_SYMPTOMS_QUERY = """
UNWIND $weighted_symptoms AS ws
MATCH (s:Symptom {id: ws.symptom_id})<-[:HAS_SYMPTOM]-(d:Disease)<-[:MANAGES]-(sp:Specialty)
RETURN d.id AS disease_id, d.name AS disease_name, d.description AS disease_description,
       sp.name AS specialty, s.name AS symptom_name, ws.weight AS weight, ws.phrase AS phrase
"""


def find_diseases_for_symptoms_hybrid(
    symptoms: list[str],
    vector_k: int = config.SYMPTOM_VECTOR_TOP_K,
    similarity_floor: float = config.SYMPTOM_VECTOR_SIMILARITY_FLOOR,
) -> list[dict]:
    """Hybrid symptom->disease retrieval: exact CONTAINS match (weight 1.0)
    unioned with a symptom_embedding_idx vector search (weight = cosine
    score, dropped below similarity_floor), then the same
    Symptom<-HAS_SYMPTOM-Disease<-MANAGES-Specialty traversal and
    aggregation find_diseases_for_symptoms() does — same output shape
    (disease_id, disease_name, disease_description, specialty, matches,
    matched_symptoms), so it's a drop-in replacement at call sites.

    Falls back to find_diseases_for_symptoms() if embedding the patient's
    symptom phrases fails (e.g. the configured provider/embedding model is unavailable) —
    the vector index requires it to have been created by seed_neo4j.py's
    embedding pass, so a fresh/unembedded graph degrades the same way."""
    if not symptoms:
        return []

    try:
        embeddings = embed_texts(symptoms)
    except Exception:  # noqa: BLE001 - embedding provider down/model not loaded
        return find_diseases_for_symptoms(symptoms)

    def _run(tx):
        best_weight_by_symptom_id: dict[str, float] = {}
        weighted_symptoms = []
        for phrase, embedding in zip(symptoms, embeddings):
            for record in tx.run(_EXACT_SYMPTOM_MATCH_QUERY, symptom=phrase):
                weighted_symptoms.append(
                    {"symptom_id": record["symptom_id"], "weight": 1.0, "phrase": phrase}
                )
            try:
                vector_hits = list(
                    tx.run(_VECTOR_SYMPTOM_MATCH_QUERY, k=vector_k, embedding=embedding)
                )
            except Exception:  # noqa: BLE001 - vector index not created yet
                vector_hits = []
            for record in vector_hits:
                if record["score"] < similarity_floor:
                    continue
                weighted_symptoms.append(
                    {"symptom_id": record["symptom_id"], "weight": record["score"], "phrase": phrase}
                )

        if not weighted_symptoms:
            return []

        rows = list(
            tx.run(_DISEASES_FOR_WEIGHTED_SYMPTOMS_QUERY, weighted_symptoms=weighted_symptoms)
        )

        # Aggregate per disease: for each original patient phrase, take the
        # best weight across any Symptom node that matched it (a phrase
        # shouldn't count twice just because two synonymous Symptom nodes
        # both matched it), then sum those per-phrase weights into "matches".
        per_disease: dict[str, dict] = {}
        for row in rows:
            entry = per_disease.setdefault(
                row["disease_id"],
                {
                    "disease_id": row["disease_id"],
                    "disease_name": row["disease_name"],
                    "disease_description": row["disease_description"],
                    "specialty": row["specialty"],
                    "phrase_weights": {},
                    "matched_symptoms": set(),
                },
            )
            entry["phrase_weights"][row["phrase"]] = max(
                entry["phrase_weights"].get(row["phrase"], 0.0), row["weight"]
            )
            entry["matched_symptoms"].add(row["symptom_name"])

        candidates = [
            {
                "disease_id": entry["disease_id"],
                "disease_name": entry["disease_name"],
                "disease_description": entry["disease_description"],
                "specialty": entry["specialty"],
                "matches": round(sum(entry["phrase_weights"].values()), 3),
                "matched_symptoms": sorted(entry["matched_symptoms"]),
            }
            for entry in per_disease.values()
        ]
        candidates.sort(key=lambda c: c["matches"], reverse=True)
        return candidates[:5]

    with get_driver().session(database=config.NEO4J_DATABASE) as session:
        return session.execute_read(_run)


def specialty_for_disease(disease_name: str) -> str | None:
    def _run(tx):
        record = tx.run(_SPECIALTY_FOR_DISEASE_QUERY, disease_name=disease_name).single()
        return record["specialty"] if record else None

    with get_driver().session(database=config.NEO4J_DATABASE) as session:
        return session.execute_read(_run)


def list_specialty_names() -> list[str]:
    """Every Specialty node name in the graph (e.g. "Cardiology",
    "Dermatology", ...) — used to canonicalize a patient's free-text
    specialty mention against real values before it's passed to
    Postgres's app_search_doctors ILIKE filter."""

    def _run(tx):
        return [record["specialty"] for record in tx.run(_ALL_SPECIALTIES_QUERY)]

    with get_driver().session(database=config.NEO4J_DATABASE) as session:
        return session.execute_read(_run)


def get_symptoms_for_diseases(disease_ids: list[str]) -> dict[str, list[str]]:
    """{disease_id: [symptom names]} for the given diseases, via
    Disease-[:HAS_SYMPTOM]->Symptom — used to ground follow-up questions
    in the graph's actual symptom data instead of the LLM's own guesses."""
    if not disease_ids:
        return {}

    def _run(tx):
        return {
            record["disease_id"]: record["symptoms"]
            for record in tx.run(_SYMPTOMS_FOR_DISEASES_QUERY, disease_ids=disease_ids)
        }

    with get_driver().session(database=config.NEO4J_DATABASE) as session:
        return session.execute_read(_run)
