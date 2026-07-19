<div align="center">

<img src="public/logo.png" alt="AyuLink" width="80" height="80" />

# AyuLink

**Digital Healthcare Platform for Sri Lanka**

A secure, QR-code-driven digital prescription ecosystem connecting patients, doctors, and pharmacies — on web and mobile.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth_+_PostgreSQL-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![Expo](https://img.shields.io/badge/Expo-SDK_54-000020?style=flat-square&logo=expo)](https://expo.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

[Overview](#overview) · [Platform](#the-platform) · [Architecture](#architecture) · [Security](#security) · [Getting Started](#getting-started) · [API](#web-api-reference) · [Docs](#documentation)

</div>

---

## Overview

AyuLink replaces paper prescriptions with a verifiable digital workflow built around a single idea: **every patient carries one QR-coded Medical ID** (`AYU-<NIC>`, derived from their National Identity Card number). A doctor scans it to issue a structured digital prescription; a pharmacy scans it to dispense — item by item, with a full audit trail of who dispensed what, where, and when.

**Why it matters.** Paper prescriptions are illegible, easy to lose, impossible to audit, and trivial to forge. There is no shared record between the doctor who prescribes and the pharmacy that dispenses. AyuLink closes that loop:

| Stakeholder | What they get |
|-------------|---------------|
| **Patients** | A permanent Digital Medical ID, full prescription history, live dispensing status |
| **Doctors** | Instant patient lookup by QR scan, a structured prescription builder, an issued-prescriptions ledger |
| **Pharmacies** | Scan-to-dispense workflow, per-item tracking with a 15-minute undo window, complete dispensing records |

---

## The Platform

One shared Supabase backend, four clients:

| Client | Location | Stack | Notes |
|--------|----------|-------|-------|
| **Web app** | `src/` | Next.js 15 · React 19 · Tailwind v4 | All three roles; server-side API layer |
| **Patient app** | `mobile/patient-app` | React Native · Expo SDK 54 | Medical ID QR, prescription history |
| **Doctor app** | `mobile/doctor-app` | React Native · Expo SDK 54 | Camera QR scanning, prescription builder |
| **Pharmacy app** | `mobile/pharmacy-app` | React Native · Expo SDK 54 | Scan & dispense, 15-minute undo, records |

The mobile apps are **fully standalone**: they authenticate with Supabase Auth and call role-checked Postgres functions directly — no application server required. See [mobile/README.md](mobile/README.md).

### Core capabilities

- **Digital Medical ID** — deterministic `AYU-<NIC>` identifier rendered as a brand-styled QR code; contains no health data
- **Structured prescriptions** — diagnosis plus per-medication drug, dosage, frequency, duration, and instructions
- **Three-state lifecycle** — `NOT_DISPENSED → PARTIALLY_DISPENSED → FULLY_DISPENSED`, recomputed atomically from item state
- **Per-item dispensing** — each medication is dispensed individually and stamped with the pharmacist's identity and timestamp
- **15-minute revert window** — pharmacists can undo a mistaken dispense without breaking audit integrity
- **Provider verification** — self-registered doctors and pharmacies cannot issue or dispense until an administrator approves them
- **Dual login** — NIC number (patients, doctors) or pharmacy license number (pharmacies); one credential store across web and mobile

---

## Architecture

```
┌───────────────┐  ┌───────────────────────────────────────┐
│    Web app    │  │      Mobile apps (Expo / RN)          │
│  Next.js 15   │  │  Patient  ·  Doctor  ·  Pharmacy      │
└──────┬────────┘  └──────────────────┬────────────────────┘
       │ NextAuth JWT sessions        │ Supabase Auth sessions
       │ API routes (service role)    │ anon key + supabase.rpc()
       ▼                              ▼
┌─────────────────────────────────────────────────────────┐
│                  Supabase (PostgreSQL)                  │
│                                                         │
│  Supabase Auth (GoTrue) — single credential store       │
│  RLS: deny-all on every table                           │
│  SECURITY DEFINER functions enforce roles, ownership,   │
│  verification, and the dispensing state machine —       │
│  atomically, inside the database                        │
└─────────────────────────────────────────────────────────┘
```

Design decisions that matter in production:

- **Authorization lives in the database.** Tables are RLS-locked with no policies. Web traffic goes through server-side API routes (service role); mobile traffic goes through `SECURITY DEFINER` functions that check `auth.uid()`, role, and verification on every call. Neither client can bypass the rules.
- **Multi-step writes are transactions.** Registration, prescription creation, and dispensing run inside Postgres functions — the dispense function locks the prescription row, so concurrent dispenses can never corrupt the status.
- **One credential store.** Passwords live in Supabase Auth; the NIC maps to a synthetic email internally. Web and mobile accounts are the same accounts.

### Data model

```
User (id ← auth.users) ────────────────────────────────
  nicNumber (unique) · firstName · lastName · mobileNumber
  dob · role: PATIENT | DOCTOR | PHARMACIST
  verified (providers need approval) · medicalId (unique, AYU-<NIC>)

  ├── DoctorProfile      slmcRegNo (unique) · specialization · hospitalName
  ├── PharmacyProfile    pharmacyName · licenseNumber (unique) · pharmacyAddress
  └── Prescription[]     as patient / as doctor

Prescription ──────────────────────────────────────────
  patientId · doctorId · dateIssued · diagnosis
  status: NOT_DISPENSED | PARTIALLY_DISPENSED | FULLY_DISPENSED
  └── PrescriptionItem[]
        drugName · dosage · frequency · duration · instructions
        dispensed · dispensedAt · dispensedById (→ pharmacist)
```

Schema source of truth: [`supabase/migrations/20260719000000_init.sql`](supabase/migrations/20260719000000_init.sql)

---

## Security

| Layer | Implementation |
|-------|----------------|
| Credentials | Supabase Auth (GoTrue); one store for web + mobile; generic "Invalid credentials" on every failure |
| Web sessions | NextAuth JWT, 24-hour expiry, HTTP-only cookies |
| Mobile sessions | Supabase Auth tokens with automatic refresh, persisted on-device |
| Database | RLS deny-all on all tables; anon key has zero direct table access |
| Authorization | Role + ownership + verification checks on every API route and database function |
| Atomicity | Multi-table writes as Postgres transactions with row locking |
| Input validation | zod schemas (web) and in-database validation (mobile RPCs): NIC/mobile format, past-date DOB, item shape |
| Abuse controls | Rate-limited login/registration (web) and GoTrue rate limits (mobile) |
| Uniqueness | NIC, SLMC registration, pharmacy license — race-safe, mapped to clean 409s |
| QR contents | Only the Medical ID — never health data |

---

## Getting Started

### Prerequisites

- Node.js 18.17+ and npm 9+
- A free [Supabase](https://supabase.com/) project

### 1 · Provision the database

In the Supabase Dashboard:

1. **SQL Editor** → run [`supabase/migrations/20260719000000_init.sql`](supabase/migrations/20260719000000_init.sql)
   (re-provisioning an existing project? run [`supabase/reset.sql`](supabase/reset.sql) first — ⚠️ it wipes all AyuLink data and logins)
2. **SQL Editor** → run [`supabase/seed.sql`](supabase/seed.sql) for demo data (idempotent)
3. **Authentication → Sign In / Up → Email** → disable **"Confirm email"** (logins use synthetic NIC-derived emails)

### 2 · Run the web app

```bash
git clone https://github.com/your-username/ayulink.git
cd ayulink
npm install
cp .env.example .env   # fill in the values below
npm run dev            # http://localhost:3000
```

```env
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"   # server-side only — never expose
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate with: openssl rand -base64 32"
```

### 3 · Run the mobile apps (optional)

```bash
cd mobile/patient-app          # or doctor-app / pharmacy-app
npm install --legacy-peer-deps
# put your Supabase URL + anon key in src/lib/config.ts
npm start                      # scan with Expo Go
```

Full mobile instructions: [mobile/README.md](mobile/README.md)

### Demo accounts

Seeded accounts (all pre-verified, password `password123`):

| Role | Login | Credential |
|------|-------|-----------|
| Patient | NIC | `200012345678` — Medical ID `AYU-200012345678` |
| Doctor | NIC | `199812345678` — Dr. Amal Perera, Cardiology |
| Pharmacy | License or NIC | `PL-2024-001` / `199512345678` — MediCare Pharmacy |

> **Provider verification:** newly self-registered doctors and pharmacies are blocked from issuing/dispensing until `verified = true` is set on their `User` row (Supabase Table Editor).

---

## Prescription Lifecycle

```
Register patient ──► Medical ID (QR) issued
        │
        ▼
Doctor scans QR ──► patient record + history loads
        │
        ▼
Doctor issues prescription ──► status: NOT_DISPENSED
        │
        ▼
Patient sees it instantly on web / mobile
        │
        ▼
Pharmacy scans QR ──► dispenses item by item
        │              (identity + timestamp recorded, 15-min undo)
        ▼
Status recomputed atomically ──► PARTIALLY ──► FULLY_DISPENSED
```

---

## Web API Reference

The web app's server-side API (the mobile apps use database RPCs instead):

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/api/auth/register` | Public · rate-limited | Register (providers start unverified) |
| `POST/GET` | `/api/auth/[...nextauth]` | Public · rate-limited | Web sign-in / sign-out / session |
| `POST` | `/api/mobile/login` | Public · rate-limited | Token login (returns Bearer JWT) |
| `POST` | `/api/auth/otp/send` · `/verify` | Public · rate-limited | Mobile-number OTP verification |
| `GET` | `/api/patients/[medicalId]` | Doctor, Pharmacist | Patient lookup by Medical ID |
| `GET` | `/api/prescriptions` | All roles | Role-filtered prescription list |
| `POST` | `/api/prescriptions` | Verified doctor | Issue a prescription (atomic) |
| `GET` | `/api/prescriptions/[id]` | Owner / issuer / pharmacist | Prescription detail (ownership-checked) |
| `PUT` | `/api/prescriptions/[id]` | Verified pharmacist | Dispense / revert an item (atomic) |
| `GET` | `/api/pharmacy/profile` | Pharmacist | Pharmacy profile |
| `GET` | `/api/seed` | Development only | Seed demo data |

---

## Project Structure

```
ayulink/
├── supabase/
│   ├── migrations/          # Schema: tables, RLS, transactional + app RPC functions
│   ├── seed.sql             # Demo data (accounts, prescriptions) — no server needed
│   └── reset.sql            # Full teardown for re-provisioning
├── src/                     # Next.js web app
│   ├── app/                 #   Pages (landing, auth, 3 role dashboards) + API routes
│   ├── components/          #   AuthProvider, DashboardLayout, QR components, cards
│   ├── lib/                 #   auth, supabase client, credentials, validation, rate-limit
│   └── types/               #   Shared enums + NextAuth augmentations
├── mobile/
│   ├── patient-app/         # Expo app — Medical ID, prescriptions
│   ├── doctor-app/          # Expo app — scan & prescribe
│   ├── pharmacy-app/        # Expo app — scan & dispense, records
│   └── README.md            # Mobile setup guide
├── docs/                    # Full documentation + walkthrough
└── public/                  # Static assets
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Web dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `supabase db push` | Apply migrations via Supabase CLI |
| `npm start` *(in `mobile/*`)* | Expo dev server for an app |

---

## Documentation

| Document | Contents |
|----------|----------|
| [docs/README.md](docs/README.md) | Complete technical docs — setup, architecture, API, testing, deployment, troubleshooting |
| [docs/FULL_DOCUMENTATION.md](docs/FULL_DOCUMENTATION.md) | Scope, vision, role matrix, full feature inventory |
| [docs/walkthrough.md](docs/walkthrough.md) | Guided end-to-end product tour |
| [mobile/README.md](mobile/README.md) | Standalone mobile app setup |

---

## Roadmap

- [x] Standalone mobile apps for patients, doctors, and pharmacies
- [ ] Automated provider verification against SLMC / NMRA registries
- [ ] Integration with Sri Lanka's national health information system (HIS)
- [ ] Multi-language support (Sinhala / Tamil)
- [ ] SMS / email notifications
- [ ] Drug interaction checking
- [ ] Prescription expiry management
- [ ] Telemedicine / video consultations
- [ ] Lab results and diagnostic imaging
- [ ] Insurance and billing integration

---

## License

Proprietary — all rights reserved.

---

<div align="center">

**AyuLink** · Digital Healthcare for Sri Lanka

*Making healthcare safer, faster, and more transparent — one scan at a time.*

</div>
