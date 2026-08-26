"""
AyuLink — Neo4j Aura Knowledge Graph Seeder
=============================================

Reads CSV datasets from the Dataset_ref/ directory, validates every
row/relationship against the Pydantic schema in schema.py, and
populates the Neo4j Aura knowledge graph.

Graph model:
    (:Doctor {id, first_name, last_name, slmc_id})
    (:Specialty {id, name, description})
    (:Disease {id, name, description})
    (:Symptom {id, name, description})

    (:Doctor)-[:SPECIALIZES_IN]->(:Specialty)
    (:Specialty)-[:MANAGES]->(:Disease)
    (:Disease)-[:HAS_SYMPTOM]->(:Symptom)
    (:Doctor)-[:TREATS]->(:Disease)

Usage:
    python knowledge-graph/seed_neo4j.py

Requires NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE
in the project-root .env file.
"""

import os
import sys
import csv
import time
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase
from pydantic import ValidationError

from schema import DoctorNode, SpecialtyNode, DiseaseNode, SymptomNode

# ──────────────────────────────────────────────
# Resolve paths
# ──────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parents[4]
DATASET_DIR = PROJECT_ROOT / "Dataset_ref"
BACKEND_DIR = Path(__file__).resolve().parents[3]

# Load .env from backend/
load_dotenv(BACKEND_DIR / ".env")

NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE")


# ──────────────────────────────────────────────
# CSV helpers
# ──────────────────────────────────────────────

def read_csv(filename: str) -> list[dict]:
    """Read a CSV file from the dataset directory and return rows as dicts."""
    filepath = DATASET_DIR / filename
    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def split_semicolons(value: str) -> list[str]:
    """Split a semicolon-delimited string into a trimmed list."""
    if not value:
        return []
    return [item.strip() for item in value.split(";") if item.strip()]


# ──────────────────────────────────────────────
# Neo4j connection
# ──────────────────────────────────────────────

def get_driver():
    """Create and verify a Neo4j driver connection."""
    if not all([NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD]):
        print("❌ Missing Neo4j credentials in .env")
        sys.exit(1)

    print(f"🔗 Connecting to {NEO4J_URI} ...")
    driver = GraphDatabase.driver(
        NEO4J_URI,
        auth=(NEO4J_USERNAME, NEO4J_PASSWORD),
    )
    driver.verify_connectivity()
    print("✅ Connected to Neo4j Aura successfully!\n")
    return driver


# ──────────────────────────────────────────────
# Schema constraints
# ──────────────────────────────────────────────

CONSTRAINTS = [
    ("constraint_doctor_slmc", "Doctor", "slmc_id"),
    ("constraint_specialty_name", "Specialty", "name"),
    ("constraint_disease_name", "Disease", "name"),
    ("constraint_symptom_name", "Symptom", "name"),
]


def create_constraints(session):
    """Create uniqueness constraints on all node types."""
    print("📐 Creating uniqueness constraints ...")
    for constraint_name, label, prop in CONSTRAINTS:
        query = (
            f"CREATE CONSTRAINT {constraint_name} IF NOT EXISTS "
            f"FOR (n:{label}) REQUIRE n.{prop} IS UNIQUE"
        )
        session.run(query)
        print(f"   ✓ {label}.{prop}")
    print()


# ──────────────────────────────────────────────
# Node creation (each row validated via schema.py before insert)
# ──────────────────────────────────────────────

def seed_symptoms(session) -> int:
    """Seed Symptom nodes from the Standardized Symptom Ontology Dataset."""
    rows = read_csv("Standardized Symptom Ontology Dataset.csv")
    print(f"🩺 Validating & seeding {len(rows)} Symptom nodes ...")

    data = []
    errors = 0
    for row in rows:
        try:
            node = SymptomNode(
                name=row["Symptom_Name"],
                description=row.get("Description", "").strip() or None,
            )
        except ValidationError as exc:
            errors += 1
            print(f"   ⚠ skipped invalid symptom row {row}: {exc}")
            continue
        data.append({
            "id": str(node.id),
            "name": node.name,
            "description": node.description,
        })

    query = """
    UNWIND $rows AS row
    MERGE (s:Symptom {name: row.name})
    ON CREATE SET
        s.id = row.id,
        s.description = row.description
    """
    session.run(query, rows=data)
    print(f"   ✓ {len(data)} Symptom nodes merged ({errors} invalid rows skipped)\n")
    return len(data)


def seed_specialties(session) -> int:
    """Seed Specialty nodes from the Specialty and Clinical Taxonomy Dataset."""
    rows = read_csv("Specialty and Clinical Taxonomy Dataset.csv")
    print(f"🏥 Validating & seeding {len(rows)} Specialty nodes ...")

    data = []
    errors = 0
    for row in rows:
        try:
            node = SpecialtyNode(
                name=row["Specialty_Name"],
                description=row.get("Description", "").strip() or None,
            )
        except ValidationError as exc:
            errors += 1
            print(f"   ⚠ skipped invalid specialty row {row}: {exc}")
            continue
        data.append({
            "id": str(node.id),
            "name": node.name,
            "description": node.description,
        })

    query = """
    UNWIND $rows AS row
    MERGE (sp:Specialty {name: row.name})
    ON CREATE SET
        sp.id = row.id,
        sp.description = row.description
    """
    session.run(query, rows=data)
    print(f"   ✓ {len(data)} Specialty nodes merged ({errors} invalid rows skipped)\n")
    return len(data)


def seed_diseases(session) -> int:
    """Seed Disease nodes from the Comprehensive Disease Entity Catalog."""
    rows = read_csv("Comprehensive Disease Entity Catalog.csv")
    print(f"🦠 Validating & seeding {len(rows)} Disease nodes ...")

    data = []
    errors = 0
    for row in rows:
        try:
            node = DiseaseNode(
                name=row["Disease_Name"],
                description=row.get("Description", "").strip() or None,
            )
        except ValidationError as exc:
            errors += 1
            print(f"   ⚠ skipped invalid disease row {row}: {exc}")
            continue
        data.append({
            "id": str(node.id),
            "name": node.name,
            "description": node.description,
        })

    query = """
    UNWIND $rows AS row
    MERGE (d:Disease {name: row.name})
    ON CREATE SET
        d.id = row.id,
        d.description = row.description
    """
    session.run(query, rows=data)
    print(f"   ✓ {len(data)} Disease nodes merged ({errors} invalid rows skipped)\n")
    return len(data)


def seed_doctors(session) -> int:
    """Seed Doctor nodes from the Doctors Master Dataset."""
    rows = read_csv("Doctors Master Dataset.csv")
    print(f"👨‍⚕️ Validating & seeding {len(rows)} Doctor nodes ...")

    data = []
    errors = 0
    for row in rows:
        try:
            node = DoctorNode(
                first_name=row["First_Name"],
                last_name=row["Last_Name"],
                slmc_id=row["SLMC_ID"],
            )
        except ValidationError as exc:
            errors += 1
            print(f"   ⚠ skipped invalid doctor row {row}: {exc}")
            continue
        data.append({
            "id": str(node.id),
            "first_name": node.first_name,
            "last_name": node.last_name,
            "slmc_id": node.slmc_id,
        })

    query = """
    UNWIND $rows AS row
    MERGE (doc:Doctor {slmc_id: row.slmc_id})
    ON CREATE SET
        doc.id = row.id,
        doc.first_name = row.first_name,
        doc.last_name = row.last_name
    """
    session.run(query, rows=data)
    print(f"   ✓ {len(data)} Doctor nodes merged ({errors} invalid rows skipped)\n")
    return len(data)


# ──────────────────────────────────────────────
# Relationship creation
# ──────────────────────────────────────────────

def create_specializes_in_relationships(session) -> int:
    """
    Create (:Doctor)-[:SPECIALIZES_IN]->(:Specialty) relationships
    from the Doctors CSV's Specialty column.

    Validation: Doctor must have a valid SLMC ID, Specialty name must
    not be empty. A Doctor can specialize in one or more specialties;
    a Specialty can have multiple Doctors.
    """
    rows = read_csv("Doctors Master Dataset.csv")
    print("🔗 Creating SPECIALIZES_IN relationships (Doctor → Specialty) ...")

    rels = []
    for row in rows:
        slmc_id = row["SLMC_ID"].strip()
        specialty = row["Specialty"].strip()
        if not slmc_id or not specialty:
            continue
        rels.append({"slmc_id": slmc_id, "specialty": specialty})

    query = """
    UNWIND $rels AS rel
    MATCH (doc:Doctor {slmc_id: rel.slmc_id})
    MATCH (sp:Specialty {name: rel.specialty})
    MERGE (doc)-[:SPECIALIZES_IN]->(sp)
    """
    session.run(query, rels=rels)
    print(f"   ✓ {len(rels)} SPECIALIZES_IN relationships merged\n")
    return len(rels)


def create_manages_relationships(session) -> int:
    """
    Create (:Specialty)-[:MANAGES]->(:Disease) relationships
    from the Specialty CSV's Associated_Diseases column.

    Validation: Specialty and Disease names must not be empty. A
    Specialty can manage multiple Diseases; a Disease can be managed
    by multiple Specialties.
    """
    rows = read_csv("Specialty and Clinical Taxonomy Dataset.csv")
    print("🔗 Creating MANAGES relationships (Specialty → Disease) ...")

    rels = []
    for row in rows:
        specialty = row["Specialty_Name"].strip()
        if not specialty:
            continue
        for disease in split_semicolons(row.get("Associated_Diseases", "")):
            rels.append({"specialty": specialty, "disease": disease})

    query = """
    UNWIND $rels AS rel
    MATCH (sp:Specialty {name: rel.specialty})
    MATCH (d:Disease {name: rel.disease})
    MERGE (sp)-[:MANAGES]->(d)
    """
    session.run(query, rels=rels)
    print(f"   ✓ {len(rels)} MANAGES relationships merged\n")
    return len(rels)


def create_has_symptom_relationships(session) -> int:
    """
    Create (:Disease)-[:HAS_SYMPTOM]->(:Symptom) relationships
    from the Disease CSV's Symptoms column.

    Validation: Disease and Symptom names must not be empty. A
    Disease can have multiple Symptoms; a Symptom can be associated
    with multiple Diseases.
    """
    rows = read_csv("Comprehensive Disease Entity Catalog.csv")
    print("🔗 Creating HAS_SYMPTOM relationships (Disease → Symptom) ...")

    rels = []
    for row in rows:
        disease = row["Disease_Name"].strip()
        if not disease:
            continue
        for symptom in split_semicolons(row.get("Symptoms", "")):
            rels.append({"disease": disease, "symptom": symptom})

    query = """
    UNWIND $rels AS rel
    MATCH (d:Disease {name: rel.disease})
    MERGE (s:Symptom {name: rel.symptom})
    ON CREATE SET s.id = randomUUID()
    MERGE (d)-[:HAS_SYMPTOM]->(s)
    """
    session.run(query, rels=rels)
    print(f"   ✓ {len(rels)} HAS_SYMPTOM relationships merged\n")
    return len(rels)


def create_treats_relationships(session) -> int:
    """
    Create (:Doctor)-[:TREATS]->(:Disease) relationships.
    Derived from the Doctor's Specialty -> that Specialty's
    Associated_Diseases (i.e. a doctor treats the diseases managed
    by their specialty).

    Validation: Doctor must have a valid SLMC ID, Disease name must
    not be empty. A Doctor can treat multiple Diseases; a Disease can
    be treated by multiple Doctors.
    """
    doctors = read_csv("Doctors Master Dataset.csv")
    specialties = read_csv("Specialty and Clinical Taxonomy Dataset.csv")
    print("🔗 Creating TREATS relationships (Doctor → Disease) ...")

    specialty_diseases: dict[str, list[str]] = {
        row["Specialty_Name"].strip(): split_semicolons(row.get("Associated_Diseases", ""))
        for row in specialties
    }

    rels = []
    for doc in doctors:
        slmc_id = doc["SLMC_ID"].strip()
        specialty = doc["Specialty"].strip()
        if not slmc_id:
            continue
        for disease in specialty_diseases.get(specialty, []):
            rels.append({"slmc_id": slmc_id, "disease": disease})

    query = """
    UNWIND $rels AS rel
    MATCH (doc:Doctor {slmc_id: rel.slmc_id})
    MATCH (d:Disease {name: rel.disease})
    MERGE (doc)-[:TREATS]->(d)
    """

    batch_size = 500
    total = 0
    for i in range(0, len(rels), batch_size):
        batch = rels[i : i + batch_size]
        session.run(query, rels=batch)
        total += len(batch)

    print(f"   ✓ {total} TREATS relationships merged\n")
    return total


# ──────────────────────────────────────────────
# Verification queries
# ──────────────────────────────────────────────

def verify_counts(session):
    """Run count queries to verify the seeded data."""
    print("=" * 55)
    print("📊 VERIFICATION — Node & Relationship Counts")
    print("=" * 55)

    node_labels = ["Doctor", "Specialty", "Disease", "Symptom"]
    for label in node_labels:
        result = session.run(f"MATCH (n:{label}) RETURN count(n) AS cnt")
        count = result.single()["cnt"]
        print(f"   {label:<15} {count:>5} nodes")

    print()

    rel_types = ["SPECIALIZES_IN", "MANAGES", "HAS_SYMPTOM", "TREATS"]
    for rel_type in rel_types:
        result = session.run(f"MATCH ()-[r:{rel_type}]->() RETURN count(r) AS cnt")
        count = result.single()["cnt"]
        print(f"   {rel_type:<15} {count:>5} relationships")

    print()

    result = session.run("""
        MATCH (doc:Doctor {slmc_id: '12485'})
        OPTIONAL MATCH (doc)-[:SPECIALIZES_IN]->(sp:Specialty)
        OPTIONAL MATCH (doc)-[:TREATS]->(dis:Disease)
        RETURN doc.first_name + ' ' + doc.last_name AS doctor,
               sp.name AS specialty,
               collect(DISTINCT dis.name) AS diseases
    """)
    record = result.single()
    if record:
        print(f"   🔍 Sample: Dr. {record['doctor']}")
        print(f"      Specialty: {record['specialty']}")
        print(f"      Treats:    {', '.join(record['diseases'][:5])}...")

    print("=" * 55)


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

def main():
    start_time = time.time()

    print()
    print("=" * 55)
    print("  AyuLink — Neo4j Knowledge Graph Seeder")
    print("=" * 55)
    print()

    driver = get_driver()

    with driver.session(database=NEO4J_DATABASE) as session:
        create_constraints(session)

        counts = {}
        counts["symptoms"] = seed_symptoms(session)
        counts["specialties"] = seed_specialties(session)
        counts["diseases"] = seed_diseases(session)
        counts["doctors"] = seed_doctors(session)

        counts["specializes_in"] = create_specializes_in_relationships(session)
        counts["manages"] = create_manages_relationships(session)
        counts["has_symptom"] = create_has_symptom_relationships(session)
        counts["treats"] = create_treats_relationships(session)

        verify_counts(session)

    driver.close()

    elapsed = time.time() - start_time
    total_nodes = (
        counts["symptoms"] + counts["specialties"] + counts["diseases"] + counts["doctors"]
    )
    total_rels = (
        counts["specializes_in"] + counts["manages"] + counts["has_symptom"] + counts["treats"]
    )

    print()
    print(f"🎉 Done! Seeded {total_nodes} nodes and {total_rels} relationships")
    print(f"⏱  Completed in {elapsed:.1f}s")
    print()


if __name__ == "__main__":
    main()
