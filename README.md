<p align="center">
  <img src="docs/assets/logo.png" alt="AyuLink logo" width="220">
</p>

<h1 align="center">AyuLink</h1>

A digital healthcare platform for Sri Lanka: patients get a QR-based digital
medical ID, AI-assisted symptom triage, doctor/appointment discovery and
booking, and a running prescription history; doctors issue digital
prescriptions; pharmacies dispense against them; channeling centers manage
the appointments booked at their location. Four standalone React Native
(Expo) apps, one Supabase Postgres database, and one LangGraph + FastAPI
agent service for the patient app's AI assistant.

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
├── supabase/                Database schema (migrations), seed data, reset script
└── docs/                    Full project documentation (this is the index)
```

## Start here

| I want to... | Read |
|---|---|
| Understand the whole platform, its architecture, and the database schema | [`docs/README.md`](docs/README.md) |
| Understand the AI assistant's multi-agent system in depth | [`docs/AGENTIC_SYSTEM.md`](docs/AGENTIC_SYSTEM.md) |
| Run the mobile apps | [`frontend/mobile/README.md`](frontend/mobile/README.md) |
| Run the agent backend | [`backend/README.md`](backend/README.md) |
| Run the marketing website | [`frontend/web/README.md`](frontend/web/README.md) |
| Build & release mobile APKs, or see what shipped in past versions | [`frontend/mobile/README.md § Building & releasing APKs`](frontend/mobile/README.md#building--releasing-apks) / [`CHANGELOG.md`](CHANGELOG.md) |

## Quick start

1. Create a free [Supabase](https://supabase.com) project and run the
   migrations in [`supabase/migrations/`](supabase/migrations) in order —
   details in [`docs/README.md`](docs/README.md#database).
2. `cd frontend/mobile/patient-app && npm install --legacy-peer-deps && npm start`
   (repeat for the other three apps) — details in
   [`frontend/mobile/README.md`](frontend/mobile/README.md).
3. Set up [`backend/`](backend) — details in [`backend/README.md`](backend/README.md).

## Tech stack at a glance

- **Mobile**: React Native (Expo SDK 54), Expo Router, TypeScript
- **Database/Auth**: Supabase (Postgres, Row Level Security, Supabase Auth, `pg_net` for push)
- **AI backend**: FastAPI, LangGraph (multi-agent StateGraph), LangChain, Neo4j (knowledge graph + vector search), an LLM provider of your choice (local LM Studio, Google Gemini, or OpenRouter)
