"""Typed settings loaded from the repo-root .env file."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


SUPABASE_URL = _require("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_ANON_KEY = _require("SUPABASE_ANON_KEY")

NEO4J_URI = _require("NEO4J_URI")
NEO4J_USERNAME = _require("NEO4J_USERNAME")
NEO4J_PASSWORD = _require("NEO4J_PASSWORD")
NEO4J_DATABASE = _require("NEO4J_DATABASE")

AGENTS_CHECKPOINT_DATABASE_URL = _require("AGENTS_CHECKPOINT_DATABASE_URL")

LM_STUDIO_BASE_URL = os.environ.get("LM_STUDIO_BASE_URL", "http://localhost:1234/v1")
LM_STUDIO_API_KEY = os.environ.get("LM_STUDIO_API_KEY", "lm-studio")
LM_STUDIO_MODEL = os.environ.get("LM_STUDIO_MODEL", "local-model")
LM_STUDIO_VISION_MODEL = os.environ.get("LM_STUDIO_VISION_MODEL", "local-vision-model")

CONFIDENCE_THRESHOLD = 0.6
MAX_FOLLOWUP_ROUNDS = 3
# A doctor never diagnoses off a single mentioned symptom — always ask at
# least this many follow-up questions first, regardless of how confident
# the raw symptom match looks (a single common symptom like "fever" can
# trivially hit 100% match against whichever disease the graph returns
# first, which isn't the same as actually being confident).
MIN_SYMPTOMS_BEFORE_DIAGNOSIS = 3
