"""What Ayu can fill, and what "filled" means for each part of it.

This is the single source of truth the rest of the agent derives from:
the planner reads it to see what is still empty, the extractor builds its
Pydantic model from it, the question composer is told which attributes it
is chasing, and the save step maps items back onto
`app_save_my_health_profile`'s payload.

Two ideas carry the whole design:

1. **A section is not "answered" until every REQUIRED attribute is set.**
   "Diabetes" with no relative, or a vaccination with no year, is not a
   family history or an immunisation record a doctor can act on — it is a
   half-entry that looks complete. Attributes marked `required=True` are
   chased with a follow-up question until they are given or explicitly
   declined.

2. **UNKNOWN is not NONE.** Every list section carries a `*_status` of
   UNKNOWN / NONE / LISTED. "No known drug allergies" is a clinical
   statement; "nobody asked" is the absence of one, and a doctor reading
   an empty list has to be able to tell which they are looking at.
"""

from dataclasses import dataclass, field
from typing import Literal, Optional


@dataclass(frozen=True)
class Attr:
    """One thing Ayu needs about an item."""

    name: str
    # What it means, in English. Goes to the extractor AND to the question
    # composer, so it is written to be readable by both.
    describe: str
    # Without this, the entry is not clinically usable and gets chased.
    required: bool = False
    # Closed vocabulary, mirroring the CHECK constraints in
    # 20260915000000_patient_health_profile.sql.
    choices: Optional[tuple[str, ...]] = None
    kind: Literal["str", "int", "float", "bool"] = "str"
    # Shown to the patient in a follow-up ("which year?"), in English; the
    # composer translates it into their language.
    ask_hint: str = ""


@dataclass(frozen=True)
class Section:
    key: str
    # LIST   — zero or more items, with an "anything else?" loop.
    # SCALAR — one set of values on PatientProfile.
    shape: Literal["LIST", "SCALAR"]
    # Human name, used in the report and in composed questions.
    title: str
    # What this section is for, given to the planner and the composer.
    purpose: str
    attrs: tuple[Attr, ...]
    # LIST only: the PatientProfile.*_status column, and where items land.
    status_key: Optional[str] = None
    target: Optional[Literal["allergies", "conditions", "medications", "history"]] = None
    history_kind: Optional[str] = None
    # SCALAR only: the PatientProfile columns these attributes map to.
    profile_fields: tuple[str, ...] = ()
    # Only ask this of female patients.
    female_only: bool = False
    # SCALAR only: which stored values count as a real answer. Needed where
    # the column has a default that is neither an answer nor UNKNOWN.
    answered_values: tuple[str, ...] = ()


SEVERITIES = ("MILD", "MODERATE", "SEVERE", "ANAPHYLAXIS")
ALLERGY_KINDS = ("DRUG", "FOOD", "ENVIRONMENTAL", "OTHER")
BLOOD_GROUPS = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")


SECTIONS: tuple[Section, ...] = (
    Section(
        key="allergies",
        shape="LIST",
        title="Allergies",
        purpose="Medicines, foods or anything else the patient reacts to. The "
                "single most important thing a doctor checks before prescribing.",
        status_key="allergies_status",
        target="allergies",
        attrs=(
            Attr("allergen", "the thing they are allergic to, e.g. 'Penicillin'",
                 required=True, ask_hint="what exactly are they allergic to"),
            Attr("kind", "DRUG for a medicine, FOOD for anything eaten, "
                 "ENVIRONMENTAL for dust/pollen/latex/stings, else OTHER",
                 required=True, choices=ALLERGY_KINDS,
                 ask_hint="whether it is a medicine, a food, or something in "
                          "the environment"),
            Attr("reaction", "what happens to them, e.g. 'rash', 'swelling'",
                 ask_hint="what happens when they are exposed to it"),
            Attr("severity", "how bad the reaction is", choices=SEVERITIES,
                 ask_hint="how severe the reaction is"),
        ),
    ),
    Section(
        key="conditions",
        shape="LIST",
        title="Long-term conditions",
        purpose="Ongoing illnesses — diabetes, blood pressure, asthma, heart "
                "problems — that change what is safe to prescribe.",
        status_key="conditions_status",
        target="conditions",
        attrs=(
            Attr("condition", "the condition name in English, e.g. 'Type 2 Diabetes'",
                 required=True, ask_hint="the name of the condition"),
            Attr("notes", "anything else said about it"),
        ),
    ),
    Section(
        key="medications",
        shape="LIST",
        title="Regular medicines",
        purpose="What the patient already takes, including anything prescribed "
                "elsewhere. A pharmacist reads the dose and the frequency as "
                "two separate things.",
        status_key="medications_status",
        target="medications",
        attrs=(
            Attr("drugName", "the medicine's name, e.g. 'Metformin'",
                 required=True, ask_hint="the name of the medicine"),
            Attr("dosage", "the dose ONLY, e.g. '500mg'", required=True,
                 ask_hint="the dose (how many mg, or how many tablets)"),
            Attr("frequency", "how often it is taken, e.g. 'twice a day', '1-0-1'",
                 required=True, ask_hint="how often they take it"),
            Attr("notes", "anything else said about it"),
        ),
    ),
    Section(
        key="surgeries",
        shape="LIST",
        title="Surgeries & hospital stays",
        purpose="Operations and hospital admissions.",
        status_key="surgeries_status",
        target="history",
        history_kind="SURGERY",
        attrs=(
            Attr("label", "the procedure or the reason, e.g. 'Appendectomy', 'Dengue'",
                 required=True, ask_hint="what the operation or admission was for"),
            Attr("admitted", "true if it was a hospital STAY rather than an operation",
                 required=True, kind="bool",
                 ask_hint="whether it was an operation or a hospital stay"),
            Attr("year", "the four-digit year it happened", kind="int",
                 ask_hint="which year it happened"),
        ),
    ),
    Section(
        key="family_history",
        shape="LIST",
        title="Family history",
        purpose="Conditions in the patient's PARENTS or SIBLINGS — never the "
                "patient themselves. Which relative it is, is the point.",
        status_key="family_history_status",
        target="history",
        history_kind="FAMILY_HISTORY",
        attrs=(
            Attr("label", "the condition in English, e.g. 'Diabetes'",
                 required=True, ask_hint="the name of the condition"),
            # No year: nobody reliably knows when a parent's diabetes
            # started, and a doctor reads WHO has it, not when.
            Attr("relationship", "which relative has it — Mother, Father, "
                 "Brother, Sister, Grandmother, Grandfather. NEVER 'Self'.",
                 required=True, ask_hint="which relative has it"),
        ),
    ),
    Section(
        key="immunisations",
        shape="LIST",
        title="Vaccinations",
        purpose="Vaccines the patient has had — tetanus, hepatitis B, COVID, rabies.",
        status_key="immunisations_status",
        target="history",
        history_kind="IMMUNISATION",
        attrs=(
            Attr("label", "the vaccine name in English, e.g. 'COVID-19'",
                 required=True, ask_hint="which vaccine"),
            Attr("year", "the four-digit year they had it", required=True, kind="int",
                 ask_hint="which year they had it"),
        ),
    ),
    Section(
        key="implants",
        shape="LIST",
        title="Implants & devices",
        purpose="Pacemaker, stent, metal plate or screw — things that matter "
                "for scans and surgery.",
        status_key="implants_status",
        target="history",
        history_kind="IMPLANT",
        attrs=(
            Attr("label", "the device in English, e.g. 'Pacemaker'",
                 required=True, ask_hint="which device"),
            Attr("year", "the four-digit year it was fitted", kind="int",
                 ask_hint="which year it was fitted"),
        ),
    ),
    Section(
        key="body",
        shape="SCALAR",
        title="Body & blood",
        purpose="Blood group, height and weight — dosing and transfusion basics.",
        profile_fields=("bloodGroup", "heightCm", "weightKg"),
        attrs=(
            Attr("bloodGroup", "blood group", choices=BLOOD_GROUPS,
                 ask_hint="their blood group"),
            Attr("heightCm", "height in centimetres, converting feet/inches if needed",
                 kind="float", ask_hint="their height"),
            Attr("weightKg", "weight in kilograms, converting pounds if needed",
                 kind="float", ask_hint="their weight"),
        ),
    ),
    Section(
        key="pregnancy",
        shape="SCALAR",
        title="Pregnancy",
        purpose="Whether the patient is pregnant or breastfeeding — it changes "
                "what can safely be prescribed.",
        profile_fields=("pregnancyStatus",),
        female_only=True,
        answered_values=("NOT_PREGNANT", "PREGNANT", "BREASTFEEDING"),
        attrs=(
            Attr("pregnancyStatus", "whether they are pregnant or breastfeeding "
                 "right now", required=True,
                 choices=("NOT_PREGNANT", "PREGNANT", "BREASTFEEDING"),
                 ask_hint="whether they are pregnant or breastfeeding"),
        ),
    ),
    Section(
        key="lifestyle",
        shape="SCALAR",
        title="Lifestyle",
        purpose="Smoking, alcohol and betel. Betel is asked explicitly because "
                "it is a leading oral-cancer risk factor in Sri Lanka.",
        profile_fields=("smoking", "alcohol", "betel"),
        attrs=(
            # Three INDEPENDENT habits. A "no" about one must never carry
            # over to another in the same sentence.
            Attr("smoking", "smoking", required=True,
                 choices=("NEVER", "FORMER", "CURRENT"),
                 ask_hint="whether they smoke"),
            Attr("alcohol", "drinking alcohol", required=True,
                 choices=("NEVER", "OCCASIONAL", "REGULAR"),
                 ask_hint="whether they drink alcohol"),
            Attr("betel", "chewing betel", required=True,
                 choices=("NEVER", "OCCASIONAL", "REGULAR"),
                 ask_hint="whether they chew betel"),
        ),
    ),
    Section(
        key="emergency_contact",
        shape="SCALAR",
        title="Emergency contact",
        purpose="Who to call. A name with no number, or a number with no name, "
                "is not a contact.",
        profile_fields=("emergencyContactName", "emergencyContactRelationship",
                        "emergencyContactPhone"),
        attrs=(
            Attr("emergencyContactName", "the person's name", required=True,
                 ask_hint="the person's name"),
            Attr("emergencyContactRelationship",
                 "how they are related, e.g. 'Brother', 'Wife'", required=True,
                 ask_hint="how that person is related to them"),
            Attr("emergencyContactPhone", "their phone number", required=True,
                 ask_hint="that person's phone number"),
        ),
    ),
)

BY_KEY: dict[str, Section] = {s.key: s for s in SECTIONS}

# PatientProfile stores snake_case; the save payload takes camelCase.
COLUMN_OF: dict[str, str] = {
    "bloodGroup": "blood_group",
    "heightCm": "height_cm",
    "weightKg": "weight_kg",
    "pregnancyStatus": "pregnancy_status",
    "smoking": "smoking",
    "alcohol": "alcohol",
    "betel": "betel",
    "emergencyContactName": "emergency_contact_name",
    "emergencyContactRelationship": "emergency_contact_relationship",
    "emergencyContactPhone": "emergency_contact_phone",
}


def status_payload_key(status_key: str) -> str:
    """'allergies_status' -> 'allergiesStatus'."""
    head, *rest = status_key.split("_")
    return head + "".join(w.capitalize() for w in rest)


def required_attrs(section: Section) -> list[Attr]:
    return [a for a in section.attrs if a.required]


def missing_required(section: Section, item: dict) -> list[Attr]:
    """Required attributes with nothing usable in them yet."""
    out = []
    for a in required_attrs(section):
        v = item.get(a.name)
        if v is None or (isinstance(v, str) and not v.strip()):
            out.append(a)
    return out


def applicable(section: Section, gender: str) -> bool:
    return not section.female_only or (gender or "").upper() == "FEMALE"


def _has_value(profile: dict, field: str, answered_values: tuple[str, ...] = ()) -> bool:
    v = profile.get(COLUMN_OF.get(field, field))
    if answered_values:
        return v in answered_values
    return v not in (None, "", "UNKNOWN", "NOT_APPLICABLE")


def is_empty(section: Section, profile: dict) -> bool:
    """Is this section still worth asking about?

    "Empty" is not "untouched" — it is "a doctor still can't rely on it".

      * LIST  — UNKNOWN status. NONE counts as answered ("no allergies"
        is a real statement), so re-asking would feel like Ayu never
        listens.
      * SCALAR with required attributes — any REQUIRED one still missing.
        Setting only "smoking" on the profile screen used to mark the whole
        lifestyle section done, so Ayu never asked about alcohol or betel.
      * SCALAR with no required attributes (just "body") — only empty when
        nothing at all is filled, so an optional height nobody knows is not
        nagged every month.
    """
    if section.shape == "LIST":
        return (profile.get(section.status_key) or "UNKNOWN") == "UNKNOWN"

    required = [a.name for a in section.attrs if a.required]
    if required:
        return any(
            not _has_value(profile, name, section.answered_values) for name in required
        )
    return not any(_has_value(profile, f) for f in section.profile_fields)


def pending_sections(profile: dict, gender: str = "") -> list[str]:
    """Section keys with nothing recorded against them, in schema order."""
    return [
        s.key
        for s in SECTIONS
        if applicable(s, gender) and is_empty(s, profile)
    ]
