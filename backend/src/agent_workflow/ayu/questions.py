"""The interview Ayu runs.

Questions are hand-written in both languages rather than translated at
runtime. Two reasons: a fixed script is predictable (the same patient
gets the same question every month, so "you already asked me this" is
never a surprise), and it removes an LLM call per question — the model is
only used for the part that genuinely needs judgement, which is reading
the answer.

Each entry says which slice of the health profile it fills, so a single
loop can drive the whole interview and a gap-check can re-ask only the
sections still marked UNKNOWN.
"""

from typing import Literal, TypedDict


class Question(TypedDict, total=False):
    # Section key on PatientProfile, e.g. "allergies_status". Scalar
    # questions that have no *_status column leave this unset.
    status_key: str
    # Where extracted items land in the save payload.
    target: Literal["allergies", "conditions", "medications", "history", "profile"]
    # For history questions, which kind of event this produces.
    history_kind: str
    # "list"  — expects zero or more entries ("what are you allergic to?")
    # "scalar" — expects a handful of named values ("blood group?")
    kind: Literal["list", "scalar"]
    en: str
    si: str
    # What an item means here, given to the extractor so it knows what
    # `label` should hold.
    item_hint: str
    # Scalar questions only: the profile fields this answer may fill.
    fields: list[str]


QUESTIONS: list[Question] = [
    {
        "status_key": "allergies_status",
        "target": "allergies",
        "kind": "list",
        "en": "Are you allergic to any medicines, foods, or anything else? "
              "If you're not sure, just say so.",
        "si": "ඔබට කිසියම් ඖෂධයකට, ආහාරයකට හෝ වෙනත් දෙයකට අසාත්මිකතාවයක් තිබෙනවාද? "
              "විශ්වාස නැත්නම් ඒ බවත් කියන්න.",
        "item_hint": "label = the allergen (e.g. 'Penicillin'); detail = what happens "
                     "(e.g. 'rash'); severity = MILD/MODERATE/SEVERE/ANAPHYLAXIS if stated.",
    },
    {
        "status_key": "conditions_status",
        "target": "conditions",
        "kind": "list",
        "en": "Do you have any long-term conditions — diabetes, blood pressure, "
              "asthma, heart problems, anything like that?",
        "si": "ඔබට දිගුකාලීන රෝගී තත්ත්වයන් තිබෙනවාද — දියවැඩියාව, අධි රුධිර පීඩනය, "
              "ඇදුම, හෘද රෝග වැනි?",
        "item_hint": "label = the condition name in English (e.g. 'Type 2 Diabetes'); "
                     "year = the year it started, if mentioned.",
    },
    {
        "status_key": "medications_status",
        "target": "medications",
        "kind": "list",
        "en": "Are you taking any medicines regularly at the moment — including "
              "anything prescribed somewhere else?",
        "si": "ඔබ දැනට නිතිපතා ගන්නා ඖෂධ තිබෙනවාද — වෙනත් තැනකින් ලබා දුන් ඒවා ඇතුළුව?",
        "item_hint": "label = the drug name (e.g. 'Metformin'); detail = dose and how "
                     "often (e.g. '500mg, twice a day').",
    },
    {
        "status_key": "surgeries_status",
        "target": "history",
        "history_kind": "SURGERY",
        "kind": "list",
        "en": "Have you had any surgery or been admitted to hospital before?",
        "si": "ඔබට කලින් සැත්කමක් කර තිබෙනවාද, නැත්නම් රෝහලේ නැවතී තිබෙනවාද?",
        "item_hint": "label = the procedure or reason (e.g. 'Appendectomy'); "
                     "year = the year it happened, if mentioned.",
    },
    {
        "status_key": "family_history_status",
        "target": "history",
        "history_kind": "FAMILY_HISTORY",
        "kind": "list",
        "en": "Do your parents or brothers and sisters have any conditions that "
              "run in the family — diabetes, heart disease, cancer, stroke?",
        "si": "ඔබේ දෙමව්පියන්ට හෝ සහෝදර සහෝදරියන්ට පවුලේ පැවත එන රෝග තිබෙනවාද — "
              "දියවැඩියාව, හෘද රෝග, පිළිකා, ආඝාතය?",
        "item_hint": "label = the condition in English; relationship = who has it "
                     "('Mother', 'Father', 'Sibling').",
    },
    {
        "status_key": "immunisations_status",
        "target": "history",
        "history_kind": "IMMUNISATION",
        "kind": "list",
        "en": "Do you remember any vaccinations you've had — tetanus, hepatitis B, "
              "COVID, rabies?",
        "si": "ඔබ ලබාගත් එන්නත් මතකද — ටෙටනස්, හෙපටයිටිස් B, කොවිඩ්, ලෙඩ බල්ලන්ගෙන් "
              "වැළකීමේ එන්නත වැනි?",
        "item_hint": "label = the vaccine name in English; year if mentioned.",
    },
    {
        "status_key": "implants_status",
        "target": "history",
        "history_kind": "IMPLANT",
        "kind": "list",
        "en": "Do you have anything implanted — a pacemaker, a stent, a metal "
              "plate or screw?",
        "si": "ඔබේ ශරීරය තුළ බද්ධ කර ඇති කිසිවක් තිබෙනවාද — පේස්මේකරයක්, ස්ටෙන්ට් "
              "එකක්, ලෝහ තහඩුවක් හෝ ඉස්කුරුප්පුවක් වැනි?",
        "item_hint": "label = the device in English (e.g. 'Pacemaker').",
    },
    {
        "target": "profile",
        "kind": "scalar",
        "fields": ["bloodGroup", "heightCm", "weightKg"],
        "en": "Do you know your blood group? And roughly your height and weight?",
        "si": "ඔබේ රුධිර වර්ගය දන්නවාද? ඒ වගේම ආසන්න වශයෙන් උස සහ බර කීයද?",
        "item_hint": "bloodGroup one of A+ A- B+ B- AB+ AB- O+ O-; heightCm and "
                     "weightKg as numbers (convert feet/inches or pounds if needed).",
    },
    {
        "target": "profile",
        "kind": "scalar",
        "fields": ["smoking", "alcohol", "betel"],
        "en": "Do you smoke, drink alcohol, or chew betel at all?",
        "si": "ඔබ දුම් බොනවාද, මත්පැන් පානය කරනවාද, බුලත් විටක් හපනවාද?",
        "item_hint": "Three INDEPENDENT habits — judge each on its own, and do not "
                     "let a 'no' about one carry over to another. smoking: NEVER / "
                     "FORMER (used to) / CURRENT. alcohol and betel: NEVER / "
                     "OCCASIONAL (sometimes, a little, socially, rarely) / REGULAR "
                     "(daily, often). Omit any habit the patient did not mention.",
    },
    {
        "target": "profile",
        "kind": "scalar",
        "fields": ["emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone"],
        "en": "Last one — who should we call in an emergency? A name, how they're "
              "related to you, and a phone number.",
        "si": "අවසාන ප්‍රශ්නය — හදිසි අවස්ථාවකදී කාට කතා කරන්නද? නමක්, ඔබට ඥාති සම්බන්ධය, "
              "සහ දුරකථන අංකයක්.",
        "item_hint": "emergencyContactName, emergencyContactRelationship (e.g. "
                     "'Brother'), emergencyContactPhone.",
    },
]


def question_text(q: Question, language: str) -> str:
    return q["si"] if language == "SI" else q["en"]


def pending_indexes(profile: dict) -> list[int]:
    """Which questions still have nothing recorded against them.

    UNKNOWN counts as unanswered; NONE does not — a patient who said "no
    allergies" has answered, and re-asking every month would make Ayu
    feel like it never listens. Scalar questions are judged on whether
    any of their fields is filled.
    """
    out: list[int] = []
    for i, q in enumerate(QUESTIONS):
        key = q.get("status_key")
        if key:
            if (profile.get(key) or "UNKNOWN") == "UNKNOWN":
                out.append(i)
            continue
        # Scalar: the DB stores these under snake_case column names.
        snake = {
            "bloodGroup": "blood_group",
            "heightCm": "height_cm",
            "weightKg": "weight_kg",
            "smoking": "smoking",
            "alcohol": "alcohol",
            "betel": "betel",
            "emergencyContactName": "emergency_contact_name",
            "emergencyContactRelationship": "emergency_contact_relationship",
            "emergencyContactPhone": "emergency_contact_phone",
        }
        filled = False
        for f in q.get("fields", []):
            v = profile.get(snake.get(f, f))
            if v not in (None, "", "UNKNOWN"):
                filled = True
                break
        if not filled:
            out.append(i)
    return out
