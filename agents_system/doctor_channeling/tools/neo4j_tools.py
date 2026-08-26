"""Read-only Cypher queries against the seeded knowledge graph.

Symptom matching is fuzzy substring CONTAINS (no pgvector/embeddings
per project decision) — the single biggest correctness risk in the
clinical path; symptom_agent tries to normalize phrasing toward
catalog terms before this is called.

Queries run via session.execute_read (a managed transaction), not a
bare session.run — Aura's connections routinely go idle-stale between
requests in a long-running server process, and only managed
transactions get the driver's automatic retry on that class of
transient connection error.
"""

from neo4j import GraphDatabase

import config

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
