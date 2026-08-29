"""Deterministic checks applied over the LLM's output.

Every rule here exists because the model got the same input right most of
the time and then quietly didn't. On a health record that is not a
tolerable failure rate, so each of these overrules the model on one
narrow, safety-relevant judgement:

  * "I have none" vs "I don't know"  — the first is a clinical statement.
  * Sinhala script in a stored value — the doctor reading it may not read
    Sinhala.
  * "Self" as a family relative     — filed under the wrong person.
  * "N/A" as a real answer          — filler, not data.
"""

from typing import Optional

from utils.llm import text_llm

# ------------------------------------------------------------ vocabularies

DONT_KNOW = (
    "don't know", "dont know", "do not know", "not sure", "no idea",
    "can't remember", "cant remember", "don't remember", "dont remember",
    "not certain", "unsure", "no clue",
    "දන්නේ නැහැ", "දන්නෙ නෑ", "මතක නෑ", "මතක නැහැ", "විශ්වාස නැහැ",
    "විශ්වාස නෑ", "හරියට දන්නේ නෑ",
)

NEGATION = (
    "none", "nothing", "never", "no allergies", "no such", "not any",
    "nope", "no i don't", "no i dont",
    "නෑ", "නැහැ", "නැත", "කිසිවක් නෑ", "කිසිම",
)

AFFIRMATION = (
    "yes", "yeah", "yep", "ok", "sure", "one more", "another", "also",
    "ඔව්", "තියෙනවා", "තව", "ඔවු",
)

# Answers that are a flat "no" on their own. Needed because the substring
# scan above is deliberately loose: "නෑ, තව නෑ" means "no, no more" but
# contains "තව" ("more"), so an affirmation-first read of it says yes.
STANDALONE_NO = {
    "no", "nope", "nah", "no.", "no thanks", "that's all", "thats all",
    "නෑ", "නැහැ", "නැත", "එපා",
}

# Filler the model emits for a field it had nothing to say about.
PLACEHOLDERS = ("n/a", "na", "none", "unknown", "-", "--", "null", "nil", "n.a.")

# The patient is not their own relative. Asked about parents and siblings,
# the extractor returned "Diabetes (Self)" — a claim about the patient's
# own health, filed under family history.
NOT_A_RELATIVE = ("self", "me", "myself", "i", "own", "මම", "මට", "මාගේ")

RELATIONSHIPS: dict[str, str] = {
    "mother": "Mother", "mom": "Mother", "mum": "Mother", "amma": "Mother",
    "අම්මා": "Mother", "මව": "Mother", "මවට": "Mother", "අම්මට": "Mother",
    "father": "Father", "dad": "Father", "thatha": "Father", "appachchi": "Father",
    "තාත්තා": "Father", "පියා": "Father", "තාත්තට": "Father", "පියාට": "Father",
    "brother": "Brother", "aiya": "Brother", "malli": "Brother",
    "අයියා": "Brother", "මල්ලි": "Brother", "සහෝදරයා": "Brother",
    "sister": "Sister", "akka": "Sister", "nangi": "Sister",
    "අක්කා": "Sister", "නංගි": "Sister", "සහෝදරිය": "Sister",
    "sibling": "Sibling", "siblings": "Sibling",
    "parent": "Parent", "parents": "Parent", "දෙමව්පියන්": "Parent",
    "grandmother": "Grandmother", "grandma": "Grandmother", "achchi": "Grandmother",
    "ආච්චි": "Grandmother",
    "grandfather": "Grandfather", "grandpa": "Grandfather", "seeya": "Grandfather",
    "සීයා": "Grandfather",
    "wife": "Wife", "husband": "Husband", "බිරිඳ": "Wife", "සැමියා": "Husband",
    "son": "Son", "daughter": "Daughter", "uncle": "Uncle", "aunt": "Aunt",
    "මාමා": "Uncle", "නැන්දා": "Aunt", "friend": "Friend", "යාළුවා": "Friend",
}


# ------------------------------------------------------------------ script

def is_latin(text: str) -> bool:
    """No Sinhala/Tamil script anywhere in this value?"""
    return all(ord(c) < 0x0D00 for c in text or "")


def to_latin(text: str, kind: str = "medical term") -> str:
    """Force one value into Latin script, translating or transliterating.

    Checked on the way OUT of extraction rather than trusted from the
    prompt: "always answer in English" holds most of the time and then
    quietly doesn't, and a drug name stored in Sinhala script is invisible
    to the doctor this profile exists for. If the retry also comes back in
    Sinhala the original is kept — a value a Sinhala-reading clinician can
    still use beats an empty field.
    """
    if is_latin(text):
        return text
    try:
        out = str(
            text_llm.invoke(
                [
                    {
                        "role": "system",
                        "content": f"Convert this {kind} to Latin script. Translate it "
                        "to its standard English name if it is a medical term; "
                        "transliterate it if it is a person's name or a place. Reply "
                        "with ONLY the converted text, nothing else.",
                    },
                    {"role": "user", "content": text},
                ]
            ).content
        ).strip()
        return out if out and is_latin(out) else text
    except Exception:  # noqa: BLE001
        return text


def label(text: str) -> str:
    """Capitalise the first letter, leaving the rest alone.

    The model returns "penicillin" or "Penicillin" depending on the run,
    and a doctor scanning an allergy list should not see the same drug
    styled two ways. Only the first character is touched — upper-casing the
    whole word would wreck "pH", "COVID-19" and "Vitamin D3".
    """
    t = to_latin((text or "").strip())
    return t[:1].upper() + t[1:] if t else t


# ------------------------------------------------------------- intent reads

def said_dont_know(answer: str) -> bool:
    return any(k in (answer or "").lower() for k in DONT_KNOW)


def said_no(answer: str) -> bool:
    return any(n in (answer or "").lower() for n in NEGATION)


def said_yes(answer: str) -> bool:
    return any(a in (answer or "").lower() for a in AFFIRMATION)


def is_placeholder(value) -> bool:
    return isinstance(value, str) and value.strip().lower() in PLACEHOLDERS


# ------------------------------------------------------------ relationships

def relationship(answer: str) -> Optional[str]:
    """Normalise "my mother" / "අම්මා" to a stored relationship, or None.

    None means genuinely unknown — the entry keeps its label and loses
    nothing, rather than a relative being guessed at.
    """
    text = (answer or "").strip().lower()
    if not text or said_dont_know(text) or text in PLACEHOLDERS:
        return None
    for word, canonical in RELATIONSHIPS.items():
        if word in text:
            return canonical
    if any(n == text or f" {n} " in f" {text} " for n in NOT_A_RELATIVE):
        return None
    # Something real that isn't in the map ("step-mother", "cousin") — keep
    # their own words rather than dropping the answer.
    return label(answer.strip()) or None


def clean_relationship(raw: Optional[str]) -> Optional[str]:
    """What the extractor offered for a relative, if it is usable at all."""
    text = (raw or "").strip()
    if not text or text.lower() in NOT_A_RELATIVE or is_placeholder(text):
        return None
    return relationship(text)


def relationship_was_said(value: Optional[str], answer: str) -> Optional[str]:
    """Keep a relative only if the patient actually named one.

    The extractor will happily infer one from the question rather than the
    answer: asked "any conditions that run in your family?", "yes diabetes"
    came back as relationship="Parent". Nobody said parent — and because a
    filled required attribute is what stops Ayu asking, that guess silently
    suppressed the "which relative?" follow-up and put an unattributed
    condition on the record.

    Inference is welcome elsewhere (prawns really are a FOOD). Here it is
    exactly wrong: WHO has it is the entire content of the answer.
    """
    if not value:
        return None
    text = (answer or "").lower()
    if value.lower() in text:
        return value
    for word, canonical in RELATIONSHIPS.items():
        if canonical == value and word in text:
            return value
    return None
