from typing import Optional
from uuid import UUID, uuid4
from enum import Enum
import re

from pydantic import BaseModel, Field, field_validator


# ============================================================
# ENUMS
# ============================================================

class DayOfWeek(str, Enum):
    MONDAY = "Monday"
    TUESDAY = "Tuesday"
    WEDNESDAY = "Wednesday"
    THURSDAY = "Thursday"
    FRIDAY = "Friday"
    SATURDAY = "Saturday"
    SUNDAY = "Sunday"


# ============================================================
# NODE SCHEMAS
# ============================================================

class DoctorNode(BaseModel):
    """
    Neo4j Node:
    (:Doctor)
    """

    id: UUID = Field(default_factory=uuid4)
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)
    slmc_id: str = Field(..., min_length=1)
    rating: Optional[float] = Field(
        default=None,
        ge=0,
        le=5
    )

    @field_validator("first_name", "last_name", "slmc_id")
    @classmethod
    def validate_required_string(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Value must not be empty")

        return value


class ChannelingCenterNode(BaseModel):
    """
    Neo4j Node:
    (:Channeling_Center)
    """

    id: UUID = Field(default_factory=uuid4)

    name: str = Field(..., min_length=1)

    address: str = Field(..., min_length=1)

    contact_number: str = Field(..., min_length=1)

    latitude: Optional[float] = None

    longitude: Optional[float] = None

    @field_validator(
        "name",
        "address",
        "contact_number"
    )
    @classmethod
    def validate_required_string(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Value must not be empty")

        return value

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, value: Optional[float]) -> Optional[float]:

        if value is not None and not -90 <= value <= 90:
            raise ValueError(
                "Latitude must be between -90 and 90"
            )

        return value

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, value: Optional[float]) -> Optional[float]:

        if value is not None and not -180 <= value <= 180:
            raise ValueError(
                "Longitude must be between -180 and 180"
            )

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

class PracticesAtRelationship(BaseModel):
    """
    (:Doctor)-[:PRACTICES_AT]->(:Channeling_Center)

    Relationship properties:
        consultation_fee
        available_days
        available_time
    """

    consultation_fee: float = Field(
        ...,
        ge=0
    )

    available_days: list[DayOfWeek] = Field(
        ...,
        min_length=1
    )

    available_time: str = Field(
        ...,
        min_length=1
    )

    @field_validator("available_time")
    @classmethod
    def validate_available_time(cls, value: str) -> str:

        value = value.strip()

        # Valid examples:
        # 09:00
        # 17:30
        # 09:00-17:00
        # 09:00 - 17:00

        pattern = (
            r"^(0\d|1\d|2[0-3]):[0-5]\d"
            r"(\s*-\s*(0\d|1\d|2[0-3]):[0-5]\d)?$"
        )

        if not re.match(pattern, value):
            raise ValueError(
                "Available time must be in the format "
                "'HH:MM' or 'HH:MM-HH:MM'"
            )

        return value


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