# Running the full AyuLink system locally

End-to-end guide to bring up **everything** — the database, the knowledge
graph, the AI backend, all four mobile apps, and the website — on one
machine, and verify it with a full patient → doctor → pharmacy →
channeling-centre loop.

The per-package guides go deeper on each piece; this document is the
order to run them in and how to check the whole thing works:

- [`backend/README.md`](../backend/README.md) — the AI service in detail
- [`frontend/mobile/README.md`](../frontend/mobile/README.md) — the four apps in detail
- [`frontend/web/README.md`](../frontend/web/README.md) — the website
- [`docs/README.md` §8](README.md#8-database-management) — database management

---

## 0. What runs where

| Piece | How you run it | Needed for |
|---|---|---|
| **Supabase Postgres** | Hosted free project (no local install) | Everything |
| **Neo4j Aura** | Hosted free instance | AI Diagnosis agent only |
| **LLM provider** | LM Studio (local) *or* a Google / OpenRouter API key | Both AI agents |
| **Backend** (`backend/`) | `uvicorn` on `:8000` on this machine | Patient app's *Diagnosis* + *Ayu* chats |
| **4 mobile apps** (`frontend/mobile/*`) | `npx expo start`, opened in Expo Go / a simulator | — |
| **Website** (`frontend/web/`) | `npm run dev` on `:3000` | Nothing else — standalone, optional |

**Minimal path (no AI):** do steps 1 and 3 only. The four apps are fully
usable — registration, Medical ID QR, prescriptions, dispensing,
appointments, care timeline — with just the database. The backend, Neo4j
and the LLM provider are only for the patient app's two chat features.

### Prerequisites

- **Node.js 20+** and npm
- **Python 3.12**
- The **Expo Go** app on a phone, or Xcode / Android Studio for a simulator
- A [Supabase](https://supabase.com) account (free tier)
- For the AI features: a [Neo4j Aura](https://neo4j.com/cloud/aura/) account
  (free tier) and either [LM Studio](https://lmstudio.ai) or a
  [Google AI Studio](https://aistudio.google.com/apikey) /
  [OpenRouter](https://openrouter.ai/keys) API key
- Optional: the [Supabase CLI](https://supabase.com/docs/guides/cli)
  (`supabase`) — makes seeding one command instead of copy-paste

---

## 1. Database — Supabase Postgres

1. **Create a project** at [supabase.com](https://supabase.com) (free tier is fine).

2. **Run the migrations.** Every file in
   [`supabase/migrations/`](../supabase/migrations) in filename order —
   32 files, `20260719000000_init.sql` through
   `20260919000000_ayu_clock_clearable.sql`. Later files re-publish
   functions the earlier ones defined, so the order is **not** optional.

   ```bash
   # with the Supabase CLI, linked to your project:
   supabase db push
   ```

   No CLI? Paste each file into the Supabase **SQL Editor** one at a time,
   oldest first. Already ran an older AyuLink schema? Paste
   [`supabase/reset.sql`](../supabase/reset.sql) first (⚠️ deletes all
   AyuLink data and logins), then run every migration.

3. **Disable email confirmation.** Dashboard → **Authentication → Sign In / Up
   → Email** → turn **"Confirm email" off**. Logins use a synthetic
   `<nic>@nic.ayulink.app` address that can't receive mail, so sign-up
   fails while this is on.

4. **Seed demo data** (idempotent):

   ```bash
   supabase db query --linked -f supabase/seed.sql               # patient, doctor, pharmacist, 2 prescriptions
   supabase db query --linked -f supabase/seed_appointments.sql  # 2 channeling centres, schedules, 1 booking

   # Recommended — every doctor + channeling centre from Dataset_ref/, plus
   # 30 mock pharmacies, all loginable with password123. Also writes
   # backend/src/agent_workflow/ingestion/demo_credentials.csv (gitignored).
   python3 backend/src/agent_workflow/ingestion/seed_postgres_dataset.py
   supabase db query --linked -f backend/src/agent_workflow/ingestion/seed_postgres_dataset.sql
   ```

   (No CLI? Paste each `.sql` into the SQL Editor.)

5. **Copy your keys.** Project Settings → **API** → the **Project URL** and
   the **anon public** key. You'll paste these into each app in step 4
   and into `backend/.env` in step 3.

Demo logins (all password `password123`):

| App | Credential |
|---|---|
| Patient | NIC `200012345678` (Medical ID `AYU-200012345678`) |
| Doctor | NIC `199812345678` |
| Pharmacy | licence `PL-2024-001` or NIC `199512345678` |
| Channeling Centre | NIC `199012345678` (Colombo) / `199112345678` (Kandy) |

---

## 2. Knowledge graph + LLM provider *(AI features only — skip for the minimal path)*

### 2a. Neo4j Aura

Create a free instance at [neo4j.com/cloud/aura](https://neo4j.com/cloud/aura/).
Keep the connection URI, username, password and database name for the next step.

### 2b. Pick an LLM provider

Set `LLM_PROVIDER` in `backend/.env` (step 3) to one of:

- **`lm_studio`** (default, fully local) — open [LM Studio](https://lmstudio.ai),
  load a **chat** model and an **embedding** model, start its local server
  (`http://localhost:1234/v1`), and set `LM_STUDIO_MODEL` /
  `LM_STUDIO_EMBEDDING_MODEL` to their exact names. A vision model is
  optional (without it, image-only report pages degrade gracefully).
- **`google`** — set `GOOGLE_API_KEY` from
  [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
- **`openrouter`** — set `OPENROUTER_API_KEY` from
  [openrouter.ai/keys](https://openrouter.ai/keys).

Only the active provider's variables are required. Full notes:
[`backend/README.md` §2](../backend/README.md#2-choose-an-llm-provider).

### 2c. Seed the graph

```bash
cd backend/src/agent_workflow/ingestion
pip install -r requirements.txt          # separate from backend/requirements.txt
python3 seed_neo4j.py
```

Reads `Dataset_ref/` at the repo root, creates `Specialty` / `Disease` /
`Symptom` nodes and their relationships, embeds every symptom with the
configured provider, and builds the `symptom_embedding_idx` vector index.
Safe to re-run. Changed provider or embedding model later? Re-run with
`--reset-embeddings`.

---

## 3. Backend — FastAPI + LangGraph *(AI features only)*

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate               # re-run in every new terminal
pip install -r requirements.txt
cp .env.example .env                     # then edit .env — see below
```

Fill in `backend/.env`:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_ANON_KEY` | the same project + anon key from step 1.5 |
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE` | from step 2a |
| `AGENTS_CHECKPOINT_DATABASE_URL` | Supabase → Settings → Database → Connection string → URI, **Session pooler** or direct (port 5432), **not** Transaction pooler |
| `LLM_PROVIDER` + that provider's block | from step 2b |

Run it:

```bash
source .venv/bin/activate
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

- `python -m uvicorn` (not bare `uvicorn`) sidesteps a conda `base` env
  shadowing the venv — see [Troubleshooting](../backend/README.md#troubleshooting).
- `--host 0.0.0.0` is required: a phone or simulator can't reach a server
  bound to `127.0.0.1`.
- Check it: `curl http://localhost:8000/health` → `{"status":"ok"}`.

---

## 4. The four mobile apps

For **each** of `patient-app`, `doctor-app`, `pharmacy-app`,
`channeling-center-app`:

```bash
cd frontend/mobile/patient-app          # then repeat for the other three
npm install --legacy-peer-deps
```

Edit `src/lib/config.ts` and paste your step-1.5 values:

```ts
export const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
export const SUPABASE_ANON_KEY = "eyJ...";
```

**Patient app only** — also point it at the backend from step 3:

```bash
cp .env.example .env
# set EXPO_PUBLIC_AGENT_API_URL to this machine's LAN IP, not localhost:
#   macOS Wi-Fi:  ipconfig getifaddr en0      ->  http://192.168.1.23:8000
```

The phone/simulator and this machine must be on the same network; this IP
changes when the machine switches networks, so update `.env` and restart
Expo when it does.

Run:

```bash
npm start          # QR for Expo Go
npm run ios        # iOS simulator
npm run android    # Android emulator
```

Each app runs on its own Metro port — start them in separate terminals,
or press `w`/`i`/`a` in one and switch. Only the patient app needs the
backend; the other three talk to Supabase directly.

> Push notifications don't deliver in Expo Go (SDK 53+). Everything else
> — including scheduled reminders while the app is open — works.

---

## 5. Website *(optional, standalone)*

```bash
cd frontend/web
npm install
npm run dev        # http://localhost:3000
```

No `.env`, no backend — it's a static marketing site and doesn't call
Supabase or the agents. The `/demo/` hub is described in
[`docs/DEMO.md`](DEMO.md).

---

## 6. Verify — one full loop

With step 1 done (and step 3 for the AI parts), run this end to end:

1. **Patient app** — sign in as `200012345678` / `password123`.
   - *Medical ID* tab → your QR code is there.
   - Tap the **Ayu** bubble on Home → answer a couple of questions →
     it saves to your health profile. *(needs backend)*
   - *Assistant* tab → describe symptoms (e.g. "fever and body aches for
     two days") → it explains a likely condition from the knowledge
     graph, finds a doctor, asks for a time, and books it.
     *(needs backend + Neo4j)*
2. **Doctor app** — sign in as `199812345678` → **Scan & Prescribe** →
   scan the patient QR (or type `AYU-200012345678`) → open **Clinical
   History** (the Ayu answers show up here) → build and issue a
   prescription.
3. **Pharmacy app** — sign in (`PL-2024-001`) → **Dispense** → scan the
   same QR → dispense an item → confirm the 15-minute **undo** appears.
4. **Channeling Centre app** — sign in as the matching centre
   (`199012345678`) → **Appointments** → confirm the booking, then later
   mark the visit **complete**.
5. **Patient app** — pull to refresh:
   - the prescription shows **Active**, then **dispensed** with the
     pharmacy's name;
   - the **care timeline** for the treatment reads
     `DIAGNOSED → APPOINTMENT_BOOKED → … → APPOINTMENT_COMPLETED`.

If all six happen, the full system is up.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Sign-up fails silently | Email confirmation still on — step 1.3 |
| App loads but every screen errors | `SUPABASE_URL` / `SUPABASE_ANON_KEY` not set in `src/lib/config.ts` |
| Migration fails part-way | Run them **in filename order**; a later file re-publishes an earlier function. On drift, run the failed file alone in the SQL Editor |
| `curl :8000/health` refused | Backend not running, or bound to `127.0.0.1` — use `--host 0.0.0.0` |
| Diagnosis / Ayu chat errors in-screen, rest of app fine | `EXPO_PUBLIC_AGENT_API_URL` wrong (using `localhost` instead of LAN IP), or backend down |
| `ModuleNotFoundError` despite the venv | A conda `base` env is shadowing it — `python -m uvicorn …`, see [backend troubleshooting](../backend/README.md#troubleshooting) |
| Diagnosis returns vague matches | Knowledge graph not seeded / embedding provider was down — re-run `seed_neo4j.py` (step 2c) |
| Neo4j "index does not exist" | Same — `seed_neo4j.py` builds `symptom_embedding_idx` |
