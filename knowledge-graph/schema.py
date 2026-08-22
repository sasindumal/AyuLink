from uuid import UUID, uuid4
from typing import Optional

from pydantic import BaseModel, Field, field_validator



# ============================================================
# NODE SCHEMAS
# ============================================================

class DoctorNode(BaseModel):
    """
    Neo4j Node:
    (:Doctor)

    `id` must equal the PostgreSQL "User".id (== "DoctorProfile".user_id)
    for the same doctor — the two stores share one UUID per doctor.
    """

    id: UUID = Field(default_factory=uuid4)
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    slmc_id: str = Field(..., min_length=1)

    @field_validator("first_name", "last_name", "slmc_id")
    @classmethod
    def validate_required_string(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Value must not be empty")

        return value



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
                "Symptom name must not be empty"
            )

        return value


# ============================================================
# RELATIONSHIP SCHEMAS
# ============================================================

class SpecializesInRelationship(BaseModel):
    """
    (:Doctor)-[:SPECIALIZES_IN]->(:Specialty)
    """

    pass


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


class TreatsRelationship(BaseModel):
    """
    (:Doctor)-[:TREATS]->(:Disease)
    """

    pass
