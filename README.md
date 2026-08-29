<p align="center">
  <img src="docs/assets/logo.png" alt="AyuLink logo" width="220">
</p>

<h1 align="center">AyuLink</h1>

<p align="center">
  <a href="https://ayulink-web.onrender.com"><b>Website</b></a> ·
  <a href="https://github.com/sasindumal/AyuLink/releases/latest"><b>Download the apps</b></a> ·
  <a href="docs/README.md"><b>Documentation</b></a>
</p>

A digital healthcare platform for Sri Lanka. Patients carry a QR-based
digital medical ID and a health profile any doctor can read in seconds;
an AI assistant triages symptoms against a real medical knowledge graph,
finds a doctor and books the appointment; doctors issue digital
prescriptions; pharmacies dispense against them item by item; channeling
centers manage the appointments booked at their location.

Four standalone React Native (Expo) apps, one marketing website, one
Supabase Postgres database, and a LangGraph + FastAPI service running
**two** agents.

## Repository layout

```
AyuLink/
├── frontend/mobile/        4 Expo apps — see frontend/mobile/README.md
│   ├── patient-app/            AyuLink (patients)
│   ├── doctor-app/             AyuLink Doctor
│   ├── pharmacy-app/           AyuLink Pharmacy
│   └── channeling-center-app/  AyuLink Channeling Center
├── frontend/web/            Marketing website (not an app) — see frontend/web/README.md
├── backend/                 LangGraph + FastAPI agent service — see backend/README.md
├── supabase/                Database schema (30 migrations), seed data, reset script
└── docs/                    Full project documentation (this is the index)
```

## Start here

| I want to... | Read |
|---|---|
| Understand the whole platform, its architecture, and the database schema | [`docs/README.md`](docs/README.md) |
| See every feature, the full tech stack, and end-to-end workflows | [`docs/FEATURES.md`](docs/FEATURES.md) |
| See how the pieces fit together as a diagram | [`docs/WORKFLOW.md`](docs/WORKFLOW.md) |
| Understand the AI assistants in depth | [`docs/AGENTIC_SYSTEM.md`](docs/AGENTIC_SYSTEM.md) |
| Run the mobile apps | [`frontend/mobile/README.md`](frontend/mobile/README.md) |
| Run the agent backend | [`backend/README.md`](backend/README.md) |
| Run the marketing website | [`frontend/web/README.md`](frontend/web/README.md) |
| Build & release mobile APKs | [`frontend/mobile/README.md § Building & releasing APKs`](frontend/mobile/README.md#building--releasing-apks) |

## Quick start

1. Create a free [Supabase](https://supabase.com) project and run the
   migrations in [`supabase/migrations/`](supabase/migrations) in
   filename order — details in [`docs/README.md`](docs/README.md#8-database-management).
2. `cd frontend/mobile/patient-app && npm install --legacy-peer-deps && npm start`
   (repeat for the other three apps) — details in
   [`frontend/mobile/README.md`](frontend/mobile/README.md).
3. Set up [`backend/`](backend) — details in [`backend/README.md`](backend/README.md).

## What's in it

**For patients** — a QR Digital Medical ID; a health profile (allergies,
conditions, regular medicines, surgeries, family history) that doctors
read on scan; AI symptom triage; doctor search and booking with a real
availability calendar; prescription history, exportable as CSV; dose and
appointment reminders; a full care timeline per diagnosis.

**For doctors** — scan a Medical ID, read the patient's clinical history,
issue a structured prescription, set a follow-up plan.

**For pharmacies** — scan a Medical ID or a single prescription's own QR
and dispense item by item, with a 15-minute undo window.

**For channeling centers** — confirm, reschedule, cancel or complete
every appointment booked at their location.

## Two AI agents

Both live in [`backend/`](backend), share one FastAPI process, one
Postgres checkpointer and one provider-agnostic LLM layer — but they are
separate graphs, because they do genuinely different jobs.

| | **Diagnosis assistant** | **Ayu** |
|---|---|---|
| Job | Symptom triage → doctor search → booking → post-care follow-up | Fills the patient's health profile |
| Shape | 22 nodes, 4 branches, free-form intent routing | 7 nodes; the interview is planned per patient from what their profile is missing |
| Endpoints | `/chat*` | `/ayu/*` |
| Grounding | Neo4j `Specialty→Disease→Symptom` graph, hybrid keyword + vector retrieval | Structured extraction into `PatientProfile` |
| Languages | Any (answers in the patient's language) | English / Sinhala, **stores English only** |

## Tech stack at a glance

- **Mobile**: React Native (Expo SDK 54), Expo Router, TypeScript
- **Web**: Next.js (static export), Tailwind CSS v4, glassmorphism design system
- **Database/Auth**: Supabase (Postgres, deny-all RLS, Supabase Auth, `pg_net` for push)
- **AI backend**: FastAPI, LangGraph (two `StateGraph`s), LangChain, Neo4j (knowledge graph + vector search), an LLM provider of your choice (local LM Studio, Google Gemini, or OpenRouter)
- **Access control**: 53 role-checked `SECURITY DEFINER` PostgreSQL functions as the *only* path to data
