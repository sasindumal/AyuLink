"""
AyuLink — Neo4j Aura Knowledge Graph Seeder
=============================================

Reads CSV datasets from the Dataset/ directory and populates the
Neo4j Aura knowledge graph with nodes and relationships matching
the Pydantic schema.

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
from uuid import uuid4

from dotenv import load_dotenv
from neo4j import GraphDatabase

# ──────────────────────────────────────────────
# Resolve paths
# ──────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATASET_DIR = PROJECT_ROOT / "Dataset_ref"

# Load .env from project root
load_dotenv(PROJECT_ROOT / ".env")

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


def split_commas(value: str) -> list[str]:
    """Split a comma-delimited string into a trimmed list."""
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


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
    ("constraint_channeling_center_name", "Channeling_Center", "name"),
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
# Node creation
# ──────────────────────────────────────────────

def seed_symptoms(session) -> int:
    """Seed Symptom nodes from the Standardized Symptom Ontology Dataset."""
    rows = read_csv("Standardized Symptom Ontology Dataset.csv")
    print(f"🩺 Seeding {len(rows)} Symptom nodes ...")

    query = """
    UNWIND $rows AS row
    MERGE (s:Symptom {name: row.name})
    ON CREATE SET
        s.id = row.id,
        s.description = row.description
    """

    data = [
        {
            "id": str(uuid4()),
            "name": row["Symptom_Name"].strip(),
            "description": row.get("Description", "").strip() or None,
        }
        for row in rows
    ]
    session.run(query, rows=data)
    print(f"   ✓ {len(data)} Symptom nodes merged\n")
    return len(data)


def seed_specialties(session) -> int:
    """Seed Specialty nodes from the Specialty and Clinical Taxonomy Dataset."""
    rows = read_csv("Specialty and Clinical Taxonomy Dataset.csv")
    print(f"🏥 Seeding {len(rows)} Specialty nodes ...")

    query = """
    UNWIND $rows AS row
    MERGE (sp:Specialty {name: row.name})
    ON CREATE SET
        sp.id = row.id,
        sp.description = row.description
    """

    data = [
        {
            "id": str(uuid4()),
            "name": row["Specialty_Name"].strip(),
            "description": row.get("Description", "").strip() or None,
        }
        for row in rows
    ]
    session.run(query, rows=data)
    print(f"   ✓ {len(data)} Specialty nodes merged\n")
    return len(data)


def seed_diseases(session) -> int:
    """Seed Disease nodes from the Comprehensive Disease Entity Catalog."""
    rows = read_csv("Comprehensive Disease Entity Catalog.csv")
    print(f"🦠 Seeding {len(rows)} Disease nodes ...")

    query = """
    UNWIND $rows AS row
    MERGE (d:Disease {name: row.name})
    ON CREATE SET
        d.id = row.id,
        d.description = row.description
    """

    data = [
        {
            "id": str(uuid4()),
            "name": row["Disease_Name"].strip(),
            "description": row.get("Description", "").strip() or None,
        }
        for row in rows
    ]
    session.run(query, rows=data)
    print(f"   ✓ {len(data)} Disease nodes merged\n")
    return len(data)


def seed_channeling_centers(session) -> int:
    """Seed Channeling_Center nodes from the Master Channeling Centres Registry."""
    rows = read_csv("Master Channeling Centres Registry.csv")
    print(f"🏢 Seeding {len(rows)} Channeling_Center nodes ...")

    query = """
    UNWIND $rows AS row
    MERGE (cc:Channeling_Center {name: row.name})
    ON CREATE SET
        cc.id = row.id,
        cc.address = row.address,
        cc.contact_number = row.contact_number,
        cc.latitude = row.latitude,
        cc.longitude = row.longitude
    """

    data = [
        {
            "id": str(uuid4()),
            "name": row["Name"].strip(),
            "address": row["Address"].strip(),
            "contact_number": row["Contact_Number"].strip(),
            "latitude": float(row["Latitude"]) if row.get("Latitude") else None,
            "longitude": float(row["Longitude"]) if row.get("Longitude") else None,
        }
        for row in rows
    ]
    session.run(query, rows=data)
    print(f"   ✓ {len(data)} Channeling_Center nodes merged\n")
    return len(data)


def seed_doctors(session) -> int:
    """Seed Doctor nodes from the Doctors Master Dataset."""
    rows = read_csv("Doctors Master Dataset.csv")
    print(f"👨‍⚕️ Seeding {len(rows)} Doctor nodes ...")

    query = """
    UNWIND $rows AS row
    MERGE (doc:Doctor {slmc_id: row.slmc_id})
    ON CREATE SET
        doc.id = row.id,
        doc.first_name = row.first_name,
        doc.last_name = row.last_name,
        doc.rating = row.rating
    """

    data = [
        {
            "id": str(uuid4()),
            "first_name": row["First_Name"].strip(),
            "last_name": row["Last_Name"].strip(),
            "slmc_id": row["SLMC_ID"].strip(),
            "rating": float(row["Rating"]) if row.get("Rating") else None,
        }
        for row in rows
    ]
    session.run(query, rows=data)
    print(f"   ✓ {len(data)} Doctor nodes merged\n")
    return len(data)


# ──────────────────────────────────────────────
# Relationship creation
# ──────────────────────────────────────────────

def create_manages_relationships(session) -> int:
    """
    Create (:Specialty)-[:MANAGES]->(:Disease) relationships
    from the Specialty CSV's Associated_Diseases column.
    """
    rows = read_csv("Specialty and Clinical Taxonomy Dataset.csv")
    print("🔗 Creating MANAGES relationships (Specialty → Disease) ...")

    query = """
    UNWIND $rels AS rel
    MATCH (sp:Specialty {name: rel.specialty})
    MATCH (d:Disease {name: rel.disease})
    MERGE (sp)-[:MANAGES]->(d)
    """

    rels = []
    for row in rows:
        specialty = row["Specialty_Name"].strip()
        diseases = split_semicolons(row.get("Associated_Diseases", ""))
        for disease in diseases:
            rels.append({"specialty": specialty, "disease": disease})

    session.run(query, rels=rels)
    print(f"   ✓ {len(rels)} MANAGES relationships merged\n")
    return len(rels)


def create_has_symptom_relationships(session) -> int:
    """
    Create (:Disease)-[:HAS_SYMPTOM]->(:Symptom) relationships
    from the Disease CSV's Symptoms column.
    """
    rows = read_csv("Comprehensive Disease Entity Catalog.csv")
    print("🔗 Creating HAS_SYMPTOM relationships (Disease → Symptom) ...")

    query = """
    UNWIND $rels AS rel
    MATCH (d:Disease {name: rel.disease})
    MERGE (s:Symptom {name: rel.symptom})
    ON CREATE SET s.id = rel.symptom_id
    MERGE (d)-[:HAS_SYMPTOM]->(s)
    """

    rels = []
    for row in rows:
        disease = row["Disease_Name"].strip()
        symptoms = split_semicolons(row.get("Symptoms", ""))
        for symptom in symptoms:
            rels.append({
                "disease": disease,
                "symptom": symptom,
                "symptom_id": str(uuid4()),
            })

    session.run(query, rels=rels)
    print(f"   ✓ {len(rels)} HAS_SYMPTOM relationships merged\n")
    return len(rels)


def create_specializes_in_relationships(session) -> int:
    """
    Create (:Doctor)-[:SPECIALIZES_IN]->(:Specialty) relationships
    from the Doctors CSV's Specialty column.
    """
    rows = read_csv("Doctors Master Dataset.csv")
    print("🔗 Creating SPECIALIZES_IN relationships (Doctor → Specialty) ...")

    query = """
    UNWIND $rels AS rel
    MATCH (doc:Doctor {slmc_id: rel.slmc_id})
    MERGE (sp:Specialty {name: rel.specialty})
    ON CREATE SET sp.id = rel.specialty_id
    MERGE (doc)-[:SPECIALIZES_IN]->(sp)
    """

    rels = [
        {
            "slmc_id": row["SLMC_ID"].strip(),
            "specialty": row["Specialty"].strip(),
            "specialty_id": str(uuid4()),
        }
        for row in rows
    ]

    session.run(query, rels=rels)
    print(f"   ✓ {len(rels)} SPECIALIZES_IN relationships merged\n")
    return len(rels)


def create_practices_at_relationships(session) -> int:
    """
    Create (:Doctor)-[:PRACTICES_AT]->(:Channeling_Center) relationships
    with consultation_fee, available_days, available_time properties
    from the Timeslots CSV.
    """
    rows = read_csv("Specialist Channelling Timeslots and Tariffs Dataset.csv")
    print("🔗 Creating PRACTICES_AT relationships (Doctor → Channeling Center) ...")

    query = """
    UNWIND $rels AS rel
    MATCH (doc:Doctor {slmc_id: rel.slmc_id})
    MATCH (cc:Channeling_Center {name: rel.center_name})
    MERGE (doc)-[r:PRACTICES_AT]->(cc)
    ON CREATE SET
        r.consultation_fee = rel.fee,
        r.available_days = rel.days,
        r.available_time = rel.time
    """

    rels = []
    for row in rows:
        days = split_commas(row.get("Available_Days", ""))
        rels.append({
            "slmc_id": row["Doctor_SLMC_ID"].strip(),
            "center_name": row["Channeling_Center_Name"].strip(),
            "fee": float(row["Consultation_Fee"]),
            "days": days,
            "time": row["Available_Time"].strip(),
        })

    session.run(query, rels=rels)
    print(f"   ✓ {len(rels)} PRACTICES_AT relationships merged\n")
    return len(rels)


def create_treats_relationships(session) -> int:
    """
    Create (:Doctor)-[:TREATS]->(:Disease) relationships.
    Derived from the Doctor's Specialty -> that Specialty's Associated_Diseases.
    """
    doctors = read_csv("Doctors Master Dataset.csv")
    specialties = read_csv("Specialty and Clinical Taxonomy Dataset.csv")
    print("🔗 Creating TREATS relationships (Doctor → Disease) ...")

    # Build specialty → diseases mapping
    specialty_diseases: dict[str, list[str]] = {}
    for row in specialties:
        name = row["Specialty_Name"].strip()
        diseases = split_semicolons(row.get("Associated_Diseases", ""))
        specialty_diseases[name] = diseases

    query = """
    UNWIND $rels AS rel
    MATCH (doc:Doctor {slmc_id: rel.slmc_id})
    MATCH (d:Disease {name: rel.disease})
    MERGE (doc)-[:TREATS]->(d)
    """

    rels = []
    for doc in doctors:
        slmc_id = doc["SLMC_ID"].strip()
        specialty = doc["Specialty"].strip()
        diseases = specialty_diseases.get(specialty, [])
        for disease in diseases:
            rels.append({"slmc_id": slmc_id, "disease": disease})

    # Execute in batches of 500 to avoid large transaction sizes
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

    node_labels = ["Doctor", "Channeling_Center", "Specialty", "Disease", "Symptom"]
    for label in node_labels:
        result = session.run(f"MATCH (n:{label}) RETURN count(n) AS cnt")
        count = result.single()["cnt"]
        print(f"   {label:<25} {count:>5} nodes")

    print()

    rel_types = [
        "SPECIALIZES_IN",
        "PRACTICES_AT",
        "TREATS",
        "MANAGES",
        "HAS_SYMPTOM",
    ]
    for rel_type in rel_types:
        result = session.run(
            f"MATCH ()-[r:{rel_type}]->() RETURN count(r) AS cnt"
        )
        count = result.single()["cnt"]
        print(f"   {rel_type:<25} {count:>5} relationships")

    print()

    # Sample traversal: pick the first doctor and show their graph
    result = session.run("""
        MATCH (doc:Doctor {slmc_id: '12485'})
        OPTIONAL MATCH (doc)-[:SPECIALIZES_IN]->(sp:Specialty)
        OPTIONAL MATCH (doc)-[:PRACTICES_AT]->(cc:Channeling_Center)
        RETURN doc.first_name + ' ' + doc.last_name AS doctor,
               sp.name AS specialty,
               collect(DISTINCT cc.name) AS centers
    """)
    record = result.single()
    if record:
        print(f"   🔍 Sample: Dr. {record['doctor']}")
        print(f"      Specialty: {record['specialty']}")
        print(f"      Centers:   {', '.join(record['centers'])}")

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
        # 1. Constraints
        create_constraints(session)

        # 2. Nodes (order: leaf nodes first)
        counts = {}
        counts["symptoms"] = seed_symptoms(session)
        counts["specialties"] = seed_specialties(session)
        counts["diseases"] = seed_diseases(session)
        counts["centers"] = seed_channeling_centers(session)
        counts["doctors"] = seed_doctors(session)

        # 3. Relationships
        counts["manages"] = create_manages_relationships(session)
        counts["has_symptom"] = create_has_symptom_relationships(session)
        counts["specializes_in"] = create_specializes_in_relationships(session)
        counts["practices_at"] = create_practices_at_relationships(session)
        counts["treats"] = create_treats_relationships(session)

        # 4. Verify
        verify_counts(session)

    driver.close()

    elapsed = time.time() - start_time
    total_nodes = (
        counts["symptoms"]
        + counts["specialties"]
        + counts["diseases"]
        + counts["centers"]
        + counts["doctors"]
    )
    total_rels = (
        counts["manages"]
        + counts["has_symptom"]
        + counts["specializes_in"]
        + counts["practices_at"]
        + counts["treats"]
    )

    print()
    print(f"🎉 Done! Seeded {total_nodes} nodes and {total_rels} relationships")
    print(f"⏱  Completed in {elapsed:.1f}s")
    print()


if __name__ == "__main__":
    main()
