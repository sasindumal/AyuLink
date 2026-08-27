"""Typed settings loaded from the backend/.env file."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[1]
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

# Which LLM/embedding backend utils/llm.py wires up — "lm_studio" (local,
# OpenAI-compatible), "google" (Google AI Studio / Gemini API), or
# "openrouter" (OpenRouter's OpenAI-compatible API, proxying many hosted
# models). Every provider's settings below are read regardless of which
# is active, so switching is just changing this one value and restarting.
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "lm_studio").strip().lower()
if LLM_PROVIDER not in ("lm_studio", "google", "openrouter"):
    raise RuntimeError(
        f"Unsupported LLM_PROVIDER: {LLM_PROVIDER!r} (expected 'lm_studio', 'google', or 'openrouter')"
    )

LM_STUDIO_BASE_URL = os.environ.get("LM_STUDIO_BASE_URL", "http://localhost:1234/v1")
LM_STUDIO_API_KEY = os.environ.get("LM_STUDIO_API_KEY", "lm-studio")
LM_STUDIO_MODEL = os.environ.get("LM_STUDIO_MODEL", "local-model")
LM_STUDIO_VISION_MODEL = os.environ.get("LM_STUDIO_VISION_MODEL", "local-vision-model")
LM_STUDIO_EMBEDDING_MODEL = os.environ.get(
    "LM_STUDIO_EMBEDDING_MODEL", "text-embedding-nomic-embed-text-v1.5"
)

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
GOOGLE_MODEL = os.environ.get("GOOGLE_MODEL", "gemini-2.5-flash")
GOOGLE_VISION_MODEL = os.environ.get("GOOGLE_VISION_MODEL", "gemini-2.5-flash")
GOOGLE_EMBEDDING_MODEL = os.environ.get("GOOGLE_EMBEDDING_MODEL", "models/gemini-embedding-001")

if LLM_PROVIDER == "google" and not GOOGLE_API_KEY:
    raise RuntimeError("LLM_PROVIDER=google requires GOOGLE_API_KEY to be set")

OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash-0731")
OPENROUTER_VISION_MODEL = os.environ.get("OPENROUTER_VISION_MODEL", "deepseek/deepseek-v4-flash-0731")
OPENROUTER_EMBEDDING_MODEL = os.environ.get("OPENROUTER_EMBEDDING_MODEL", "openai/text-embedding-3-small")

if LLM_PROVIDER == "openrouter" and not OPENROUTER_API_KEY:
    raise RuntimeError("LLM_PROVIDER=openrouter requires OPENROUTER_API_KEY to be set")

CONFIDENCE_THRESHOLD = 0.6
MAX_FOLLOWUP_ROUNDS = 3
# A doctor never diagnoses off a single mentioned symptom — always ask at
# least this many follow-up questions first, regardless of how confident
# the raw symptom match looks (a single common symptom like "fever" can
# trivially hit 100% match against whichever disease the graph returns
# first, which isn't the same as actually being confident).
MIN_SYMPTOMS_BEFORE_DIAGNOSIS = 3

# Symptom.embedding vector similarity below this floor is discarded before
# it ever reaches disease scoring — otherwise a barely-related symptom
# would still contribute partial "matches" weight and quietly inflate
# disease_agent's confidence score.
SYMPTOM_VECTOR_SIMILARITY_FLOOR = 0.55
SYMPTOM_VECTOR_TOP_K = 3
