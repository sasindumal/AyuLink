# AyuLink Backend

LangGraph + FastAPI agent service backing the patient app's *Assistant* tab:
general Q&A, symptom triage against a Neo4j knowledge graph (hybrid
semantic + graph retrieval), doctor search, and booking — talking to
Supabase Postgres (via RPCs) and Neo4j Aura, with an LLM provider you
choose (local LM Studio or Google AI Studio).

```
backend/
├── app.py                          FastAPI entrypoint (/chat, /health, ...)
├── requirements.txt
├── .env                            not committed — copy from .env.example
├── utils/
│   ├── config.py                   env var loading/validation
│   └── llm.py                      text_llm / vision_llm / embed_texts()
├── src/
│   ├── api/                        auth, SSE streaming, LangGraph checkpointer
│   └── agent_workflow/
│       ├── retrevel/               agent.py (graph), state, schemas, tools, subagents
│       └── ingestion/               Neo4j knowledge-graph seeder (separate requirements.txt)
└── tests/
    └── test_pipeline.py            live end-to-end script (not pytest)
```

## 1. One-time setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

> **Every terminal session, you must `source .venv/bin/activate` again
> before running anything.** If you skip it, `uvicorn`/`python` fall back
> to whatever Python is already active on your `PATH` (e.g. a `(base)`
> conda env) — one that doesn't have this project's dependencies, so
> imports like `langgraph.checkpoint.postgres` fail. If you ever deleted
> `backend/.venv` (e.g. after moving/cloning the repo), just redo the
> three commands above to recreate it — a venv's `bin/activate` doesn't
> survive being moved to a new path.

Copy the env template and fill in real values:

```bash
cp .env.example .env
```

`backend/.env` needs, at minimum:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY` — same Supabase project the web/mobile apps use.
- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE` — a Neo4j Aura instance (free tier is fine).
- `AGENTS_CHECKPOINT_DATABASE_URL` — a Postgres connection string for the LangGraph checkpointer. Supabase Dashboard → your project → Settings → Database → Connection string → **"Session pooler"** (not "Transaction pooler").

See [`.env.example`](.env.example) for the full list, including the LLM provider block below.

## 2. Choose an LLM provider

Set `LLM_PROVIDER` in `backend/.env` to `lm_studio` (default, fully local) or `google` (Google AI Studio / Gemini API). Whichever isn't selected can be left blank — only the active provider's variables are required at startup.

**`lm_studio`** — open [LM Studio](https://lmstudio.ai), load a chat model and start its local server (default `http://localhost:1234/v1`), then set `LM_STUDIO_MODEL` to that model's exact name (`curl http://localhost:1234/v1/models` lists what's loaded). A vision-capable model (`LM_STUDIO_VISION_MODEL`) is optional — without one, image-only PDF report pages degrade to "please describe your symptoms" instead of failing. For hybrid symptom retrieval, also load an **embedding** model and set `LM_STUDIO_EMBEDDING_MODEL` — this is a separate model slot from the chat model.

**`google`** — get an API key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and set `GOOGLE_API_KEY`. `GOOGLE_MODEL`, `GOOGLE_VISION_MODEL`, `GOOGLE_EMBEDDING_MODEL` default to `gemini-2.0-flash` / `gemini-2.0-flash` / `models/text-embedding-004`.

## 3. Seed the knowledge graph (one-time, or after a reset)

```bash
cd src/agent_workflow/ingestion
pip install -r requirements.txt   # separate from backend/requirements.txt
python3 seed_neo4j.py
```

Reads `Dataset_ref/` at the repo root, populates Neo4j (Doctor/Specialty/Disease/Symptom nodes + relationships), embeds every `Symptom` node via the configured LLM provider, and creates the `symptom_embedding_idx` vector index used by hybrid retrieval. Safe to rerun — it only embeds `Symptom` nodes that don't have an embedding yet. If the embedding provider isn't reachable, the graph still seeds and the embedding/vector-index step is skipped with a warning (agents fall back to substring-only matching until you rerun this with the provider up).

## 4. Run

```bash
cd backend            # if not already there
source .venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

`--host 0.0.0.0` is required, not optional — a physical phone or the iOS Simulator can't reach a server bound only to `127.0.0.1`. Check it's up with `curl http://localhost:8000/health` → `{"status":"ok"}`.

Then, in the patient app: copy `frontend/mobile/patient-app/.env.example` to `.env` and set `EXPO_PUBLIC_AGENT_API_URL` to this machine's **LAN IP** (`ipconfig getifaddr en0` on macOS), not `localhost` — e.g. `http://192.168.1.23:8000`. Your phone/simulator and this machine must be on the same Wi-Fi network; this IP changes whenever the machine switches networks, so update `.env` and restart `npx expo start` each time.

## 5. Tests

```bash
source .venv/bin/activate
python3 tests/test_pipeline.py
```

A live end-to-end script (not pytest) — hits the running server over HTTP/SSE, so the server from step 4 must already be up and LM Studio/Google must be reachable. `TEST_PATIENT_JWT` is optional; without it, scenarios needing Postgres RPCs (doctor search, availability, booking) are skipped rather than faked. See the docstring at the top of [`tests/test_pipeline.py`](tests/test_pipeline.py) for how to get one.

## Troubleshooting

- **`ModuleNotFoundError` for a package that's in `requirements.txt`** — almost always means the venv isn't activated (check your prompt for `(.venv)`, or run `which python3` and confirm it points inside `backend/.venv`), or `pip install -r requirements.txt` was run against a different environment than the one `uvicorn`/`python3` is now using.
- **`source .venv/bin/activate` → "no such file or directory"** — the venv doesn't exist yet (or was deleted/moved). Recreate it: step 1 above.
- **Neo4j `Untitled index` / vector search errors** — the `symptom_embedding_idx` vector index doesn't exist yet; run step 3's seeder once with an embedding provider reachable.
