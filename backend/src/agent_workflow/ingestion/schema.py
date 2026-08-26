from uuid import UUID, uuid4
from typing import Optional

from pydantic import BaseModel, Field, field_validator



# ============================================================
# NODE SCHEMAS
# ============================================================

class SpecialtyNode(BaseModel):
    """
    Neo4j Node:
    (:Specialty)
    """

    id: UUID = Field(default_factory=uuid4)

    name: str = Field(..., min_length=1)

    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError(
                "Specialty name must not be empty"
            )

        return value


class DiseaseNode(BaseModel):
    """
    Neo4j Node:
    (:Disease)
    """

    id: UUID = Field(default_factory=uuid4)

    name: str = Field(..., min_length=1)

    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError(
                "Disease name must not be empty"
            )

        return value


class SymptomNode(BaseModel):
    """
    Neo4j Node:
    (:Symptom)

    `embedding` is populated separately by seed_neo4j.py's embedding pass
    (not at row-validation time here) — it backs the symptom_embedding_idx
    vector index used for semantic symptom matching.
    """

    id: UUID = Field(default_factory=uuid4)

    name: str = Field(..., min_length=1)

    description: Optional[str] = None

    embedding: Optional[list[float]] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError(
                "Symptom name must not be empty"
            )

        return value


# ============================================================
# RELATIONSHIP SCHEMAS
# ============================================================

class ManagesRelationship(BaseModel):
    """
    (:Specialty)-[:MANAGES]->(:Disease)
    """

    pass


class HasSymptomRelationship(BaseModel):
    """
    (:Disease)-[:HAS_SYMPTOM]->(:Symptom)
    """

    pass
