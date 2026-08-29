# AyuLink — Full Project Documentation

This is the index/reference document for the whole AyuLink platform. For
just getting something running, use the shorter per-package guides
([`frontend/mobile/README.md`](../frontend/mobile/README.md),
[`backend/README.md`](../backend/README.md)) — come back here for how
everything fits together, the full database schema, and cross-app flows.
Companion documents:
[`RUN_LOCALLY.md`](RUN_LOCALLY.md) — bring the whole system up on one
machine (database, knowledge graph, backend, all four apps, website) and
verify it with a full end-to-end loop.
[`FEATURES.md`](FEATURES.md) — every feature in every app and the website,
the full technology stack, and the end-to-end workflows.
[`AGENTIC_SYSTEM.md`](AGENTIC_SYSTEM.md) — the two AI agents in depth.
[`WORKFLOW.md`](WORKFLOW.md) — system diagrams, plus an editable draw.io file.
[`DEMO.md`](DEMO.md) — get all four apps onto a phone with no build.

## Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [The Four Mobile Apps](#4-the-four-mobile-apps)
5. [Database Schema](#5-database-schema)
6. [Key Data Flows](#6-key-data-flows)
7. [AI Assistant (Agentic System)](#7-ai-assistant-agentic-system)
7b. [Ayu — the health-profile assistant](#7b-ayu--the-health-profile-assistant)
8. [Database Management](#8-database-management)
9. [Known Gaps / Notes](#9-known-gaps--notes)

---

## 1. Overview

AyuLink digitizes the patient-doctor-pharmacy-channeling-center loop for a
Sri Lankan healthcare context:

- A **patient** carries one QR code (their Medical ID) instead of a paper
  record, keeps a **health profile** (allergies, chronic conditions,
  regular medicines, surgeries, family history) that any doctor reads on
  scan, can find and book a doctor's appointment several ways, and can
  talk to two AI assistants — one that triages symptoms against a real
  medical knowledge graph and books on their behalf, and **Ayu**, which
  fills the health profile by interview in English or Sinhala.
- A **doctor** scans that QR (or types the Medical ID), opens the
  patient's **Clinical History** (allergies first, severity-ordered, each
  entry badged self-reported or clinician-confirmed), and issues a
  structured digital prescription — no handwriting, no paper.
- A **pharmacy** scans either the patient's Medical ID (sees every active
  prescription) or a *specific prescription's own* QR (patients can show
  just one, so the pharmacy never sees the others) and dispenses
  medication item-by-item, with a 15-minute undo window.
- A **channeling center** manages the appointments booked at its location
  — confirm, reschedule, cancel, mark complete — independent of whichever
  app the patient used to book.

There is also a small static marketing website ([`frontend/web/`](../frontend/web))
— a Next.js site that just describes AyuLink and links out to the four
apps (see §4). It is not itself one of the four apps, has no login of
its own, and doesn't call Supabase, Neo4j, or anything else.

The four apps share one Supabase Postgres database. There is no custom
backend server for the CRUD apps — every mobile app talks to Supabase
directly via `supabase-js`. The one exception is the patient app's
**Assistant** tab, which talks to a
separate LangGraph + FastAPI service (`backend/`) for the parts a plain
CRUD API can't do: LLM-driven conversation, a symptom→disease→specialty
knowledge graph, and human-in-the-loop booking.

## 2. Architecture

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐
│   Patient app    │  │   Doctor app    │  │  Pharmacy app   │  │ Channeling Center app     │
│  (Expo/RN)       │  │  (Expo/RN)      │  │  (Expo/RN)      │  │  (Expo/RN)                │
└────────┬─────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬──────────────────┘
         │  supabase-js (anon key) — every op is an RPC call, RLS deny-all otherwise
         └──────────────────────────┬──────────────────────────────────────┘
                                     ▼
                       ┌────────────────────────────┐
                       │   Supabase Postgres          │
                       │   - RLS (deny-all)            │
                       │   - SECURITY DEFINER app_* RPCs│
                       │   - Supabase Auth              │
                       │   - pg_net → Expo push API      │
                       └────────────────────────────┘
                                     ▲
                                     │ Postgres RPCs (patient's own JWT)
                                     │ + LangGraph checkpoints
                       ┌────────────────────────────┐
                       │  backend/ — FastAPI + LangGraph │
                       │  multi-agent StateGraph          │
                       │  (patient app's Assistant tab only)│
                       └───────────┬────────────────┘
                                   │ Cypher (read-only)
                                   ▼
                       ┌────────────────────────────┐
                       │   Neo4j Aura knowledge graph │
                       │  Specialty→Disease→Symptom     │
                       │  + vector index for hybrid search│
                       └────────────────────────────┘
```

Each mobile app is fully independent (own `package.json`, own Expo
project, own `app.json`/bundle id) but shares the same `src/components/ui.tsx`
design-system pattern, the same `src/lib/api.ts` thin RPC wrapper, and the
same Postgres schema/RPCs. There is no shared npm package between them —
consistency is maintained by convention, not by code sharing.

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Mobile UI | React Native 0.81, Expo SDK 54, Expo Router (file-based routing), TypeScript |
| Mobile data | `supabase-js` (anon key), calling `rpc()` exclusively — no direct table access |
| QR | `react-native-qrcode-svg` (generate), `expo-camera` (scan) |
| Push notifications | `expo-notifications` + Expo's push API, triggered from a Postgres trigger via `pg_net` |
| Database | Supabase Postgres — Row Level Security (deny-all), `SECURITY DEFINER` PL/pgSQL functions (`app_*`) as the only access path |
| Auth | Supabase Auth (email/password) — NIC/license number mapped to a synthetic email under the hood |
| AI backend framework | FastAPI (Python), Server-Sent Events for streaming |
| Agent orchestration | LangGraph — **two** separate `StateGraph`s (diagnosis + Ayu), `interrupt()`/`Command(resume=...)` for human-in-the-loop, one shared Postgres-backed checkpointer |
| LLM abstraction | LangChain (`BaseChatModel`, `Embeddings`) — provider-agnostic call sites |
| LLM providers (choose one) | Local [LM Studio](https://lmstudio.ai) (fully offline), Google AI Studio (Gemini), or OpenRouter |
| Knowledge graph | Neo4j Aura — `Specialty`→`Disease`→`Symptom` graph + a vector index for embedding-based symptom search |
| PDF/image ingestion | PyMuPDF (text/page extraction), a vision-capable LLM (report image description) |

See [`AGENTIC_SYSTEM.md`](AGENTIC_SYSTEM.md) for the AI backend in depth.

## 4. The Four Mobile Apps

### AyuLink (patient app)

- **Auth**: register/sign in with NIC + password.
- **Home**: greeting, notification bell (unread badge), recent AI treatments, quick actions.
- **Medical ID**: a full-screen QR code encoding the patient's Medical ID (`AYU-<NIC>`) — shown to doctors and pharmacies for lookup.
- **Appointments** tab, four discovery modes:
  - **Quick Search** — filter by specialty (category picker from the DB), city, minimum rating; sort by soonest/nearest/rating; each result shows the soonest slot for that doctor, with a link into their full availability.
  - **By Doctor** — search doctors by specialty/city/min-rating, pick one, see every upcoming slot they hold over the next 14 days (searchable/sortable by center, nearest, soonest).
  - **By Center** — browse channeling centers (searchable, sortable by name/nearest), pick one, see every doctor available there.
  - **My Appointments** — upcoming/past split, searchable, filterable by specialty/city, sortable by doctor/center/date-time; each card opens a detail modal with Reschedule/Cancel/Open-in-Maps and, if it came from an AI diagnosis, a link back to that chat.
- **Prescriptions** tab — always sorted by most recent; an **Active** section (not/partially dispensed) and a **Dispensed** archive section below it (fully dispensed or expired); searching looks across every status at once. Each prescription can show a QR unique to itself (not the patient's Medical ID) so a pharmacy scanning it sees *only that one prescription*.
- **Treatments** tab — the patient's AI-diagnosis history; a treatment's displayed name is the AI's own working diagnosis until a doctor who saw them for that booked appointment issues a prescription, at which point the prescription's diagnosis text becomes the permanent, confirmed name.
- **Diagnosis (Assistant)** — a chat screen backed by `backend/`: symptom triage, doctor search, and booking, all through one conversation. Renders full Markdown (bold, lists, headings, code, links). Voice UI is present but currently stubbed ("coming soon") — see §9.
- **Health Profile** — the Tier 1/2/3 background a doctor reads on scan. Every list section is a **three-state** control ("Not answered" / "I have none" / entries), because an empty allergy list nobody filled in is not the same as "no known allergies".
- **Profile & settings** — top-right avatar on Home. Registration details (name, phone, DOB editable; NIC and Medical ID deliberately not, since the QR derives from the NIC), the Ayu on/off switch, and **Download prescription history (CSV)** — one row per medication, RFC-4180 escaped, BOM + CRLF so Excel handles Sinhala correctly.
- **Ayu** — a floating bubble. Asks language once, then interviews the patient to fill the health profile; re-checks monthly for anything still unanswered. Long-press to turn off; the permanent switch is in Profile.
- **Reminders** — per-dose local notifications while a course runs, and an appointment nudge 3 hours before, rebuilt on every Appointments refresh so a reschedule anywhere corrects it.
- **Notifications** — persisted history of appointment events (booked/rescheduled/cancelled/completed).

### AyuLink Doctor

- **Home**: greeting, notification bell, "Scan & Prescribe" shortcut, recent prescriptions.
- **Clinical History**: a button under the patient card after a scan — allergies (severity-ordered), long-term conditions, current medicines, surgeries, family history, implants, vaccinations, lifestyle and emergency contact. Everything is badged **Self-reported** unless a clinician confirmed it, and "Not answered" is shown as loudly as an entry.
- **Scan & Prescribe**: scan a patient's Medical ID QR (or type it), then build a prescription — diagnosis, optional age/weight, and one or more medications (drug name; dosage as a separate manually-typed amount + a unit **dropdown** that also accepts a typed custom unit; frequency and duration as free text with one-tap common presets, e.g. `1-0-1`, `7 days`); set an expiry duration (7/14/30/60/90 days, or *Never*, default 30). Submitting shows a full-detail confirmation modal before returning to the patient lookup screen.
- **Issued** tab: every prescription this doctor has issued, always sorted by most recent; search by patient/medical ID/diagnosis; filter by exact issue date; "look up by patient" (scan or type a Medical ID) narrows the list to one patient. A prescription can be **edited or deleted only within 1 day of issuing, and only while nothing on it has been dispensed or it hasn't expired** — enforced both in the UI and in the database RPC.
- Registration collects up to 5 specialties (multi-select from the canonical DB list) — a doctor is then searchable under any one of them.

### AyuLink Pharmacy

- **Home**: pharmacy identity card, stats (prescriptions seen / items dispensed / patients served), notification bell.
- **Dispense**: scan a QR. If it's a patient's Medical ID, shows every active (not fully dispensed, not expired) prescription for that patient. If it's a *specific prescription's* own QR, shows **only that one prescription** — the patient's other pending prescriptions are never revealed this way. Dispensing is per medication item, with a 15-minute undo window; a fully dispensed or expired prescription refuses further dispensing at the database level, not just in the UI.
- **Clinical History (narrowed)**: `app_get_patient_health_profile` returns `scope: DISPENSING` to a pharmacist — allergies and current medicines only. Enough to catch a dangerous dispense, and nothing more; a pharmacy has no reason to read someone's family history to hand over tablets.
- **Records**: everything this pharmacy has ever dispensed.

### AyuLink Channeling Center

- **Home**: center identity, today/upcoming/completed stats, notification bell.
- **Appointments**: every appointment booked at this center — confirm, reschedule, cancel, or mark complete.

### The website (`frontend/web/`)

A single static marketing page — not an app: what AyuLink is, a features
section, a "how it works" walkthrough, and a "Get the app" section with a
card for each of the four apps above (linking out to app store listings
once published; today those buttons are honestly marked "Coming Soon"
rather than pointing anywhere). No login, no dashboards, no database
calls — see [`frontend/web/README.md`](../frontend/web/README.md).

## 5. Database Schema

All access goes through role-checked `SECURITY DEFINER` functions
(`app_*`) called via `supabase.rpc()`. Every table has Row Level Security
enabled with **no** policies, so the anon key shipped in every app cannot
read or write a table directly — only these functions can, and each one
starts by resolving `auth.uid()` and checking the caller's role. This is
the single access-control pattern for the entire platform; there is no
separate authorization layer to keep in sync.

### Core tables

| Table | Purpose |
|---|---|
| `User` | Every account, one row regardless of role (`PATIENT`/`DOCTOR`/`PHARMACIST`/`CHANNELING_CENTER`). Holds the Medical ID (`AYU-<NIC>`), `verified` flag (self-registered non-patients start unverified), and `gender` (`MALE`/`FEMALE`, collected for patients and doctors — gates the pregnancy question and section). |
| `DoctorProfile` | 1:1 with a doctor `User` — SLMC registration number, legacy free-text specialty, rating. |
| `PharmacyProfile` | 1:1 with a pharmacist `User` — pharmacy name, license number, location (`point`). |
| `ChannelingCenter` | 1:1 with a channeling-center `User` — name, address, contact number, location (`point`). |
| `Specialty` | Canonical specialty reference list (30+ names, matching the Neo4j graph's `Specialty` nodes 1:1) — powers every specialty picker in every app. |
| `DoctorSpecialty` | Join table: a doctor can hold up to 5 specialties; search matches on any of them. |
| `DoctorSchedule` | A doctor's *recurring weekly template* at one center (day of week + time range) — distinct from a dated `Appointment`. |
| `Appointment` | One booked slot: patient, doctor, center, date/time, status (`BOOKED`/`COMPLETED`/`CANCELLED`), a per-patient order number (`APT-<NIC>-0001`, ascending, assigned once), symptom-only `reason` (never a disease name — generated fresh by the AI at booking time when booked via chat), cancellation audit fields. |
| `Prescription` | Diagnosis text, status (`NOT_DISPENSED`/`PARTIALLY_DISPENSED`/`FULLY_DISPENSED`, plus a *derived* `EXPIRED` — see below), optional patient age/weight recorded at issue time, `expires_at` (null = never expires). |
| `PrescriptionItem` | One medication line: drug name, dosage, frequency, duration, instructions, dispensed state + who/when. |
| `Treatment` | One AI-assisted diagnosis session (from `backend/`), linkable to a booked `Appointment`; displayed name is the AI's own `disease_name` until a doctor's prescription confirms it (`confirmed_diagnosis` + `confirming_prescription_id`). |
| `Notification` | Persisted history of appointment events (booked/rescheduled/cancelled/completed), delivered to patient + doctor + channeling center. |
| `DeviceToken` | Expo push tokens, per user. |
| `MobileOtp` | (Reserved) OTP support. |

### Health profile tables

Added in `20260915000000_patient_health_profile.sql`. Owned and
maintained by the patient; read by clinicians on scan.

| Table | Purpose |
|---|---|
| `PatientProfile` | 1:1 with a patient `User` — blood group, height/weight, pregnancy status, lifestyle (smoking / alcohol / **betel**, listed explicitly because it is a leading oral-cancer risk factor in Sri Lanka), emergency contact, preferred language, plus Ayu's own bookkeeping (`ayu_enabled`, `ayu_last_prompted_at`, `profile_completed_at`). |
| `PatientAllergy` | Allergen, kind (`DRUG`/`FOOD`/`ENVIRONMENTAL`/`OTHER`), reaction, severity (`MILD`…`ANAPHYLAXIS`), `source`, who confirmed it. |
| `PatientCondition` | Long-term conditions, since-date, `ACTIVE`/`RESOLVED`. |
| `PatientMedication` | What the patient reports taking regularly — distinct from `PrescriptionItem`, which is what a doctor in *this* system issued. Most people's regular tablets predate the app entirely. |
| `PatientHistoryEvent` | Surgeries, hospitalisations, immunisations, family history and implants in one table — they are all "a labelled thing that happened, optionally with a year and a note". Five near-identical tables would buy nothing but five sets of RPCs to keep in sync. |

### UNKNOWN is not NONE

Every list-shaped section carries its own `*_status` of
`UNKNOWN` / `NONE` / `LISTED` on `PatientProfile`, rather than being
inferred from an empty array.

"No known drug allergies" is a clinical statement. "Nobody has asked" is
the absence of one. Collapsing them would let a doctor read silence as
reassurance — the exact failure this data exists to prevent. It is also
what makes Ayu's monthly gap-check possible: a section answered `NONE`
is finished and never re-asked, while `UNKNOWN` is still open.

The same principle applies to `PatientProfile.preferred_language`, which
is **nullable**: `NULL` means "never asked", so Ayu knows to show the
language picker. It previously defaulted to `'EN'`, which made a patient
who had never been asked indistinguishable from one who chose English —
so the picker never appeared for anyone.

### Patient-entered is not doctor-verified

Every clinical row records `source` (`PATIENT` | `DOCTOR`) plus who
confirmed it and when — the same pattern `Treatment` already uses for
`disease_name` vs `confirmed_diagnosis`. The patient's own words are
kept; a clinician's confirmation is added alongside, never over the top.
The doctor app surfaces that distinction as a badge on every entry,
because acting on an unverified allergy list *as if* it were verified is
the failure mode here.

### The `EXPIRED` status is derived, not stored

`Prescription.status` in the database only ever holds
`NOT_DISPENSED`/`PARTIALLY_DISPENSED`/`FULLY_DISPENSED` — there is no
`EXPIRED` value in the Postgres enum. `prescription_json()` computes the
value every app actually sees:

```sql
case when expires_at is not null and now() > expires_at
     then 'EXPIRED' else status::text end
```

A `null` `expires_at` ("Never" at issue time) means a prescription can
never become `EXPIRED`, no matter how long ago it was fully dispensed.
Any other prescription — fully, partially, or not dispensed — becomes
`EXPIRED` once its time is up, at which point the patient app moves it
into the Dispensed/archive section and the pharmacy refuses to dispense
against it. The same pattern (a computed field overriding the raw column
in the JSON the RPC returns) is used for `Treatment.disease_name`.

### RPC functions, by area

*(Full source: [`supabase/migrations/`](../supabase/migrations), applied in filename order.)*

- **Profile/auth**: `app_get_my_profile`, `app_register_profile`, `app_login_email_for_license`, `app_register_push_token`
- **Doctor discovery**: `app_search_doctors`, `app_search_doctor_slots`, `app_get_doctor_availability`, `app_get_center_availability`, `app_list_channeling_centers`, `app_list_specialties`, `app_list_cities`
- **Doctor's own schedule**: `app_get_my_schedule`, `app_upsert_schedule_slot`, `app_delete_schedule_slot`
- **Appointments**: `app_book_appointment`, `app_reschedule_appointment`, `app_cancel_appointment`, `app_complete_appointment`, `app_list_my_appointments`, `app_list_center_appointments`
- **Prescriptions**: `app_create_prescription`, `app_update_prescription` (doctor, within 1 day, nothing dispensed, not expired), `app_delete_prescription` (same guard), `app_list_prescriptions` (role-filtered: a patient's own, a doctor's issued, a pharmacist's dispensed-from), `app_lookup_patient` (Medical ID → patient + all their prescriptions), `app_lookup_prescription_by_id` (a *single* prescription's own QR → just that one, refuses a fully-dispensed or expired one), `app_dispense_item` (per-item dispense/undo, 15-minute window)
- **Treatments (AI diagnoses)**: `app_create_treatment`, `app_link_treatment_appointment`, `app_unlink_treatment_appointment`, `app_delete_treatment`, `app_list_my_treatments`, `app_treatment_by_thread`, `app_treatment_timeline` (care-journey events + `followupPlan` + `courseEndsAt`), `app_complete_treatment` (patient marks a diagnosis done — the only path to `COMPLETED`), `app_treatment_doctors_to_rate` / `app_rate_doctor` (post-course per-doctor 1–5 rating, feeding `DoctorProfile.rating` via trigger)
- **Notifications**: `app_list_notifications`, `app_mark_notification_read`, `app_mark_all_notifications_read`, `app_unread_notification_count`
- **Role profiles**: `app_get_pharmacy_profile`, `app_get_my_channeling_center_profile`
- **Health profile**: `app_get_my_health_profile` (patient's own), `app_save_my_health_profile` (whole-object atomic save — both editors that write it, the patient's form and Ayu, hold the complete picture and save once), `app_get_patient_health_profile` (clinician read; `scope: FULL` for a doctor, `scope: DISPENSING` — allergies + medicines only — for a pharmacist)
- **Account & export**: `app_update_my_account` (the editable half of registration, all roles; NIC and Medical ID excluded on purpose), `app_export_my_prescriptions` (flat one-row-per-medication export behind "Download as CSV")

## 6. Key Data Flows

**Booking an appointment (either app UI or AI chat)** — search →
pick a slot → `app_book_appointment` (or, via chat, the agent's
`booking_agent` node calling the same RPC with the patient's own JWT) →
a Postgres trigger on `Appointment` inserts `Notification` rows for the
patient, the doctor, and the channeling center, and best-effort fires an
Expo push via `pg_net` → the channeling center's app shows it; the
patient can reschedule/cancel from either side.

**Prescription lifecycle** — doctor issues (`app_create_prescription`,
optional expiry) → patient sees it as *Active*, can show its own QR →
pharmacy scans (either the patient's Medical ID for the full active list,
or the prescription's own QR for just that one) → dispenses items
(`app_dispense_item`) → once every item is dispensed, or once
`expires_at` passes (whichever happens first, per the derived-status rule
above), it moves to the patient's Dispensed/archive section and can no
longer be edited, deleted, or dispensed against.

**Care timeline** — `app_treatment_timeline` replays one diagnosis as an
ordered event list: `DIAGNOSED` → `APPOINTMENT_BOOKED` →
`APPOINTMENT_STARTED` → `APPOINTMENT_COMPLETED` / `APPOINTMENT_CANCELLED`
→ `PRESCRIPTION_ISSUED` → `ITEM_DISPENSED`. Each is derived from the
underlying row's own timestamp, not a separate event log, so the timeline
can never drift from the records it describes. `Appointment.completed_at`
exists for exactly this reason — completion previously had no timestamp
of its own (only `cancelled_at` did), so the closing event had nothing
honest to date itself by.

**AI diagnosis → confirmed treatment name** — a patient's Diagnosis chat
creates a `Treatment` with the AI's own tentative name; if the chat books
an appointment, that gets linked. If the doctor the patient actually sees
for that appointment later issues a prescription, `app_create_prescription`
finds the matching unconfirmed `Treatment` (by patient + that doctor's
linked appointment) and sets its `confirmed_diagnosis` to the doctor's own
diagnosis text — from then on, that's the name shown in the Treatments
tab, not the AI's guess.

**Per-prescription QR vs. Medical ID QR** — the Medical ID QR is a
standing "show me everything" credential (any pharmacist scanning it sees
every active prescription); a prescription's own QR is scoped to just
that one record. Both are validated purely by Postgres RPC role/ownership
checks at scan time — there is no separate signing/expiry scheme on the
QR payload itself, consistent with how every other permission in this
system is enforced at the database layer, not client-side.

## 7. AI Assistant (Agentic System)

The patient app's Diagnosis/Assistant tab is a LangGraph multi-agent
system — a 22-node `StateGraph` whose `manager_agent` routes each turn to
one of four branches: a clinical-triage branch (grounded in a Neo4j
symptom→disease→specialty knowledge graph, with hybrid exact+vector
retrieval), a doctor-search branch, a booking branch, and a **post-care**
branch (an end-of-course check-in that marks a diagnosis complete —
collecting per-doctor 1–5 star ratings first — or steers the patient back
into booking if they're still unwell). Ten nodes issue human-in-the-loop
`interrupt()`s wherever the patient needs to make a choice; everything is
streamed to the client over Server-Sent Events and persisted via a
Postgres-backed checkpointer so a conversation survives a server restart
or a resumed thread days later. The post-care branch is opened by the app
(`POST /chat/followup`) from a local notification it scheduled for the
course-end moment; `POST /chat/sync` folds out-of-chat care events (visit
started, prescription issued, drugs dispensed) into the thread.

Full architecture, every node's responsibility, the state schema, the SSE
event vocabulary, and the LLM-provider abstraction: **[`AGENTIC_SYSTEM.md`](AGENTIC_SYSTEM.md)**.

## 7b. Ayu — the health-profile assistant

A **second** LangGraph agent (`backend/src/agent_workflow/ayu/`), separate
from the diagnosis one and reached on its own `/ayu/*` endpoints. It runs
an interview it plans per patient — it reads what the health profile
already holds, decides what to ask, and writes each question itself —
picks English or Sinhala up front, and re-checks monthly for anything
still unanswered.

Kept as its own graph rather than another branch of the diagnosis agent
because the two have nothing in common but the patient: one classifies
free-form intent and routes, the other runs a script to completion.
Merging them would make `manager_agent` responsible for telling "I have a
headache" from an answer to question 4 of an interview. They share the
FastAPI process, the Postgres checkpointer and the LLM provider layer —
not the graph.

Four ideas carry the design (full detail in
[`AGENTIC_SYSTEM.md` §13](AGENTIC_SYSTEM.md#13-ayu--the-health-profile-assistant)):

- **Planned, not fixed.** `start` reads the profile and asks only about
  the sections still missing — first run and monthly check-in alike. The
  LLM orders them and writes every question; a deterministic floor makes
  sure no genuine gap is dropped.
- **An entry is not usable until it is complete.** Each attribute in
  `schema.py` is `required` or not; a required one still empty produces a
  follow-up asking *only* for it by name (which relative, which year, the
  dose *and* the frequency). Chased once, then taken as it stands.
- **The conversation may be Sinhala; the stored values never are.**
  Doctors, the drug catalogue and the Neo4j graph are English-only.
  `guards.is_latin` / `guards.to_latin` re-translate any field that comes
  back in Sinhala script before it is stored.
- **"I don't know" and "I have none" are different answers.** The first
  leaves the section `UNKNOWN`; the second records `NONE`, a real clinical
  statement. An LLM asked for that boolean on a negation-heavy sentence
  flipped between the two across calls, so `guards.said_dont_know` /
  `said_no` settle it — same second-guessing `manager_agent` applies to
  its own `booking` route.

| Endpoint | Purpose |
|---|---|
| `POST /ayu/chat` | Open Ayu. Both `mode`s ask only about sections the profile is still missing (the patient may have filled part of it on the profile screen); `INTAKE` differs only in its greeting and in stamping `profile_completed_at` when it finishes. Ayu speaks first. |
| `POST /ayu/resume` | Answer a language pick, a question, or the final confirm/edit. |
| `GET /ayu/history` | Rehydrate an interview in progress. |
| `GET /ayu/status` | Whether Ayu is on, the chosen language, how many gaps remain, and whether a monthly check-in is due. |
| `POST /ayu/enabled` | The on/off switch on the patient's home screen. |
| `POST /ayu/snooze` | Records a nudge, so the next one is a month away rather than on the next launch. |

## 8. Database Management

**Create the schema** (new Supabase project): run every file in
[`supabase/migrations/`](../supabase/migrations) in filename order, via
`supabase db push` or pasted into the SQL Editor one at a time.

**Reset** (wipe all AyuLink data and logins — already have an older
schema, or just want a clean slate): paste
[`supabase/reset.sql`](../supabase/reset.sql) into the SQL Editor, then
re-run every migration in order.

**Seed demo data** (idempotent — safe to re-run):

```bash
supabase db query --linked -f supabase/seed.sql               # patient, doctor, pharmacist, 2 prescriptions
supabase db query --linked -f supabase/seed_appointments.sql  # 2 channeling centers, schedules, 1 booking

# Recommended: bulk-import every doctor + channeling center from Dataset_ref/,
# plus 30 mock pharmacies — all loginable with password123 (synthetic NICs;
# pharmacies also get PL-2024-1xx licenses).
python3 backend/src/agent_workflow/ingestion/seed_postgres_dataset.py
supabase db query --linked -f backend/src/agent_workflow/ingestion/seed_postgres_dataset.sql
```

No Supabase CLI installed? Paste each `.sql` file into the Supabase **SQL
Editor** instead — same effect. The bulk seeder also writes
`backend/src/agent_workflow/ingestion/demo_credentials.csv` (gitignored) —
role, name, NIC/license and Medical ID for **every** seeded account,
including the hand-written demo ones. Demo logins are also summarised in
[`frontend/mobile/README.md`](../frontend/mobile/README.md#demo-accounts).

**Seed the Neo4j knowledge graph** (separate database, only needed for
the AI assistant): see [`AGENTIC_SYSTEM.md`](AGENTIC_SYSTEM.md#12-knowledge-graph--ingestion).

## 9. Known Gaps / Notes

- **Voice mode** in the patient app's Diagnosis chat is UI-only (a
  "coming soon" placeholder for speech-to-text) — Expo Go cannot load
  third-party native modules, and the feature was descoped to keep the
  app runnable without a custom native build. Text-to-speech
  (`expo-speech`, an official Expo module) does work.
- **Doctor schedule management has no screen yet.** The RPCs to
  create/edit/delete a doctor's recurring weekly availability
  (`app_get_my_schedule`, `app_upsert_schedule_slot`,
  `app_delete_schedule_slot`) exist and work, but no doctor-app screen
  calls them — today `DoctorSchedule` rows come only from seed data and
  the bulk `Dataset_ref/` import.
- **Medication adherence tracking is not built.** Dose reminders fire,
  but there is no "mark this dose taken" record, no Today checklist, and
  no escalation when a dose is missed. That needs a `DoseLog` table and
  its own RPCs.
- **Chat-cancelled appointments leave no timeline entry.** `booking_agent`
  unlinks the `Treatment` when it cancels, so `appointment_id` is already
  null and neither `APPOINTMENT_BOOKED` nor `APPOINTMENT_CANCELLED`
  resolves. UI-initiated cancellations keep the link and do show both.
- **Push notifications** need an EAS project + custom dev-client build
  per app for real on-device delivery — Expo Go has not supported remote
  push since SDK 53. In-app notification history (the `Notification`
  table) works regardless.
- **Self-registered doctors/pharmacies/channeling centers start
  unverified** (`verified = false`) and see a banner, but — per current
  product decision — this no longer blocks anything. The flag still
  exists and could gate something again later.
- **Registration no longer collects map coordinates.** The `location`
  columns remain `not null`; a registrant who supplies none gets a
  Colombo-centre default (`20260917…` / `20260912…`). Nearest-first
  sorting still reads those columns, so a centre that never sets a real
  point will sort as if it were in Colombo.
