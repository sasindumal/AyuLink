# AyuLink – Digital Healthcare Platform

> **Complete Documentation** — Architecture · Setup · Run · Test · Build · Deploy

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Directory Structure](#4-directory-structure)
5. [Prerequisites](#5-prerequisites)
6. [Setup & Installation](#6-setup--installation)
7. [Running the Application](#7-running-the-application)
8. [Database Management](#8-database-management)
9. [Authentication & Security](#9-authentication--security)
10. [API Reference](#10-api-reference)
11. [Frontend Pages & Components](#11-frontend-pages--components)
12. [Environment Variables](#12-environment-variables)
13. [Building for Production](#13-building-for-production)
14. [Testing Guide](#14-testing-guide)
15. [Deployment](#15-deployment)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Project Overview

AyuLink is a **digital healthcare platform** built for Sri Lanka's healthcare ecosystem. It replaces paper prescriptions with a secure **Digital Medical ID** and digital prescription system, connecting **Patients**, **Doctors**, and **Pharmacists** through a unified web application.

### Core Features

| Feature | Description |
|---------|-------------|
| **Digital Medical ID** | NIC-derived QR code identity (`AYU-<NIC>`) for every patient |
| **Role-Based Dashboards** | Tailored UIs for Patient, Doctor, and Pharmacist |
| **Digital Prescriptions** | Doctors create structured prescriptions with medication items |
| **QR Code Scanning** | Doctors/Pharmacists scan patient QR codes to look up records |
| **Pharmacy Dispensing** | Per-item dispensing with 15-minute revert window |
| **Three-State Tracking** | `NOT_DISPENSED` → `PARTIALLY_DISPENSED` → `FULLY_DISPENSED` |
| **Provider Verification** | Self-registered doctors/pharmacists must be approved before issuing or dispensing |

### Demo Credentials

| Role | NIC Number | Password |
|------|-----------|----------|
| 👤 Patient | `200012345678` | `password123` |
| 🩺 Doctor | `199812345678` | `password123` |
| 💊 Pharmacist | `199512345678` | `password123` |

---

## 2. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js (App Router) | 15.1+ |
| **Runtime** | React | 19.0 |
| **Language** | TypeScript | 5.7+ |
| **Styling** | Tailwind CSS v4 | 4.0 |
| **Database** | Supabase (managed PostgreSQL) | — |
| **DB Client** | @supabase/supabase-js | 2.x |
| **Auth** | NextAuth.js (Credentials) | 4.24 |
| **Validation** | zod | 4.x |
| **Password Hashing** | bcryptjs | 2.4 |
| **QR Generation** | qrcode.react | 4.2 |
| **QR Scanning** | html5-qrcode | 2.3 |
| **Icons** | lucide-react | 0.474 |
| **Font** | Plus Jakarta Sans | Google Fonts |
| **Bundler** | Turbopack (dev) | Built-in |

---

## 3. Architecture

### 3.1 System Architecture

```
┌─────────────────────────────────────────────────┐
│                 Browser (React 19)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Landing  │ │  Login / │ │  Role Dashboards │ │
│  │  Page    │ │ Register │ │ Patient/Doctor/  │ │
│  │          │ │          │ │ Pharmacist       │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────┬───────────────────────────┘
                      │ HTTP/HTTPS
┌─────────────────────▼───────────────────────────┐
│              Next.js 15 Server                  │
│  ┌──────────────┐ ┌───────────┐ ┌─────────────┐ │
│  │ API Routes   │ │ NextAuth  │ │ zod input   │ │
│  │ (Handlers)   │ │ (JWT)     │ │ validation  │ │
│  └──────┬───────┘ └───────────┘ └─────────────┘ │
│         │  supabase-js (service role key)       │
└─────────┼───────────────────────────────────────┘
          │ PostgREST over HTTPS
┌─────────▼───────────────────────────────────────┐
│           Supabase (PostgreSQL)                 │
│  ┌──────┐ ┌───────────┐ ┌────────────┐          │
│  │ User │ │ Prescrip- │ │ Doctor/    │          │
│  │      │ │ tion      │ │ Pharmacy   │          │
│  │      │ │ + Items   │ │ Profiles   │          │
│  └──────┘ └───────────┘ └────────────┘          │
│  RLS enabled (deny-all; service role only)      │
│  3 SQL functions for transactional writes       │
└─────────────────────────────────────────────────┘
```

**Key architectural decisions**

- **All database access is server-side.** API routes use a singleton supabase-js client authenticated with the **service role key** ([src/lib/supabase.ts](../src/lib/supabase.ts)). The browser never talks to Supabase directly.
- **Row Level Security is enabled on every table with no policies**, so the anon key cannot read or write anything. Only the service role (which bypasses RLS) has access.
- **Multi-table writes are atomic.** Registration, prescription creation, and dispensing each call a Postgres function via `supabase.rpc()`, so partial writes cannot occur and concurrent dispenses are serialized with row locks.
- **API response shapes mirror the old ORM output.** Tables and columns keep camelCase names (quoted identifiers), and PostgREST embedded selects reproduce the nested `items` / `patient` / `doctor` structure the frontend expects.

### 3.2 Page Navigation Flow

```
Landing (/) ──► Login (/login) ──► Role-based redirect
            └─► Register (/register)

Patient:    /patient/dashboard ──► /patient/medical-id
                               └─► /patient/prescriptions

Doctor:     /doctor/dashboard  ──► /doctor/scan
                               └─► /doctor/prescriptions

Pharmacist: /pharmacy/dashboard ──► /pharmacy/dispense
                                └─► /pharmacy/records
```

### 3.3 Prescription Lifecycle

```
1. Patient visits Doctor (shows QR Medical ID)
2. Doctor scans QR → GET /api/patients/[medicalId] → Patient info
3. Doctor creates Rx → POST /api/prescriptions → Status: NOT_DISPENSED
   (doctor must be verified)
4. Patient views Rx in their dashboard
5. Patient visits Pharmacy (shows QR)
6. Pharmacist looks up patient → active prescriptions listed
7. Pharmacist dispenses items → PUT /api/prescriptions/[id]
   - Each item toggles individually (pharmacist must be verified)
   - Status auto-computes atomically: NOT_DISPENSED → PARTIALLY → FULLY_DISPENSED
   - 15-minute revert window for undoing a dispense
```

### 3.4 Database Schema (ERD)

```
┌──────────────────────┐       ┌──────────────────────┐
│        User          │       │    DoctorProfile     │
├──────────────────────┤       ├──────────────────────┤
│ id          text PK  │──┐    │ id          text PK  │
│ nicNumber   text UK  │  │    │ userId      text FK  │◄──┐
│ firstName   text     │  │    │ slmcRegNo   text UK  │   │
│ lastName    text     │  │    │ specialization text  │   │
│ mobileNumber text    │  │    │ hospitalName text    │   │
│ dob         timestamptz│ │    └──────────────────────┘   │
│ passwordHash text    │  │                               │
│ role        Role     │  ├───────────────────────────────┘
│ verified    boolean  │  │
│ medicalId   text UK  │  │    ┌──────────────────────┐
│ createdAt   timestamptz│ │    │   PharmacyProfile    │
│ updatedAt   timestamptz│ │    ├──────────────────────┤
└──────────────────────┘  │    │ id            text PK│
         │                └───►│ userId        text FK│
         │                     │ pharmacyName  text   │
         │                     │ licenseNumber text UK│
         ▼                     │ pharmacyAddress text │
┌──────────────────────┐       └──────────────────────┘
│    Prescription      │
├──────────────────────┤
│ id         text PK   │
│ patientId  text FK   │◄── User (patient)
│ doctorId   text FK   │◄── User (doctor)
│ dateIssued timestamptz│
│ diagnosis  text      │
│ status     Enum      │  NOT_DISPENSED | PARTIALLY_DISPENSED | FULLY_DISPENSED
└──────────┬───────────┘
           │
           ▼ (1:many)
┌──────────────────────┐
│  PrescriptionItem    │
├──────────────────────┤
│ id             text PK│
│ prescriptionId text FK│
│ drugName       text   │
│ dosage         text   │
│ frequency      text   │
│ duration       text   │
│ instructions   text   │
│ dispensed      boolean│
│ dispensedAt    timestamptz?│
│ dispensedById  text FK?│◄── User (pharmacist)
└──────────────────────┘
```

All IDs are UUIDs stored as `text` (`gen_random_uuid()::text`). `updatedAt` is maintained by a database trigger.

### 3.5 Database Functions (RPC)

| Function | Called by | Purpose |
|----------|-----------|---------|
| `create_user_with_profile(p_user, p_doctor, p_pharmacy)` | `POST /api/auth/register` | Inserts the user and their doctor/pharmacy profile in one transaction. Sets `verified = true` only for patients. |
| `create_prescription_with_items(p_patient_id, p_doctor_id, p_diagnosis, p_items)` | `POST /api/prescriptions` | Inserts a prescription and all of its items in one transaction. |
| `dispense_prescription_item(p_prescription_id, p_item_id, p_dispensed, p_pharmacist_id)` | `PUT /api/prescriptions/[id]` | Locks the prescription row, updates the item, enforces the 15-minute revert window, and recomputes the three-state status — all atomically. |

---

## 4. Directory Structure

```
AyuLink/
├── supabase/
│   └── migrations/
│       └── 20260719000000_init.sql   # Full schema: tables, enums, indexes,
│                                     # triggers, RPC functions, RLS
├── public/
│   ├── logo.png                   # Brand logo (PNG)
│   ├── logo.svg                   # Brand logo (SVG)
│   ├── logo-white.jpg             # White variant for dark backgrounds
│   └── screenshots/               # README screenshots
│
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout (font, metadata, AuthProvider)
│   │   ├── page.tsx               # Landing page (/)
│   │   ├── globals.css            # Design tokens + component styles
│   │   ├── login/page.tsx         # Login page
│   │   ├── register/page.tsx      # Multi-step registration
│   │   │
│   │   ├── patient/               # Patient dashboard pages
│   │   │   ├── layout.tsx         # Role guard (PATIENT only)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── medical-id/page.tsx
│   │   │   └── prescriptions/page.tsx
│   │   │
│   │   ├── doctor/                # Doctor dashboard pages
│   │   │   ├── layout.tsx         # Role guard (DOCTOR only)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── scan/page.tsx
│   │   │   └── prescriptions/page.tsx
│   │   │
│   │   ├── pharmacy/              # Pharmacy dashboard pages
│   │   │   ├── layout.tsx         # Role guard (PHARMACIST only)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── dispense/page.tsx
│   │   │   └── records/page.tsx
│   │   │
│   │   └── api/                   # API Route Handlers
│   │       ├── auth/[...nextauth]/route.ts   # NextAuth handler
│   │       ├── auth/register/route.ts        # POST registration
│   │       ├── patients/[medicalId]/route.ts # GET patient lookup
│   │       ├── prescriptions/route.ts        # GET list / POST create
│   │       ├── prescriptions/[id]/route.ts   # GET detail / PUT dispense
│   │       ├── pharmacy/profile/route.ts     # GET pharmacy profile
│   │       └── seed/route.ts                 # GET seed (dev only)
│   │
│   ├── components/
│   │   ├── AuthProvider.tsx       # NextAuth SessionProvider wrapper
│   │   ├── DashboardLayout.tsx    # Sidebar + main content + role guard
│   │   ├── Sidebar.tsx            # Role-based navigation sidebar
│   │   ├── PrescriptionCard.tsx   # Expandable prescription display
│   │   ├── QRCodeDisplay.tsx      # QR code generator component
│   │   └── QRScanner.tsx          # Camera-based QR scanner
│   │
│   ├── lib/
│   │   ├── auth.ts                # NextAuth config (credentials, JWT, throttling)
│   │   ├── supabase.ts            # Supabase server client (service role, singleton)
│   │   ├── rate-limit.ts          # In-memory fixed-window rate limiter
│   │   ├── validation.ts          # zod schemas for all mutating routes
│   │   └── utils.ts               # cn() utility (clsx + tailwind-merge)
│   │
│   └── types/
│       ├── db.ts                  # Role / PrescriptionStatus enums
│       └── next-auth.d.ts         # NextAuth type augmentations
│
├── .env.example                   # Template for environment variables
├── .env                           # Environment variables (not committed)
├── next.config.ts                 # Next.js configuration
├── tsconfig.json                  # TypeScript configuration
├── postcss.config.mjs             # PostCSS (Tailwind v4)
└── package.json                   # Dependencies & scripts
```

---

## 5. Prerequisites

| Requirement | Version | Check Command |
|-------------|---------|---------------|
| **Node.js** | 18.17+ | `node -v` |
| **npm** | 9+ | `npm -v` |
| **Supabase account** | Free tier is fine | [supabase.com](https://supabase.com) |
| **Git** | Any | `git --version` |
| **Supabase CLI** (optional) | Latest | `supabase --version` |

No local PostgreSQL installation is needed — the database is hosted by Supabase.

---

## 6. Setup & Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/AyuLink.git
cd AyuLink
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Create a Supabase Project

1. Sign in at [supabase.com](https://supabase.com) and create a new project.
2. From **Project Settings → API**, note your **Project URL** and **service_role key**.

### Step 4: Configure Environment

Copy the template and fill in your values:

```bash
cp .env.example .env
```

```env
# Supabase (Project Settings -> API)
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"

# NextAuth.js configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-strong-random-secret-here"
```

> **Generate a secret:** `openssl rand -base64 32`
>
> ⚠️ The **service role key bypasses Row Level Security**. It must only ever live
> in server-side environment variables — never expose it to the browser or
> commit it to version control.

### Step 5: Apply the Database Schema

Run [supabase/migrations/20260719000000_init.sql](../supabase/migrations/20260719000000_init.sql) against your project. Either:

**Option A — Dashboard:** open **SQL Editor** in the Supabase Dashboard, paste the file's contents, and run it.

**Option B — Supabase CLI:**

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

This creates the tables, enums, indexes, `updatedAt` triggers, the database functions, and enables RLS.

> **Re-running on an existing project?** The migration needs a clean database.
> Run [`supabase/reset.sql`](../supabase/reset.sql) in the SQL Editor first —
> ⚠️ it drops every AyuLink table, function, and enum, and deletes **all app
> logins** (`auth.users`) — then run the init migration again.

### Step 6: Seed Demo Data

Start the dev server (`npm run dev`) and visit:

```
http://localhost:3000/api/seed
```

This creates 3 demo accounts (Patient, Doctor, Pharmacist — all pre-verified) and 2 sample prescriptions. Seeding is idempotent and blocked in production.

---

## 7. Running the Application

### Development Server (Turbopack)

```bash
npm run dev
```

Opens at **http://localhost:3000** with hot module replacement via Turbopack.

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `next dev --turbopack` | Start dev server with Turbopack |
| `build` | `next build` | Create production build |
| `start` | `next start` | Start production server |
| `lint` | `next lint` | Run ESLint |

---

## 8. Database Management

### Everyday Tasks

| Task | How |
|------|-----|
| Browse / edit data | Supabase Dashboard → **Table Editor** |
| Run ad-hoc SQL | Supabase Dashboard → **SQL Editor** |
| Apply schema changes | Add a new file to `supabase/migrations/` and run `supabase db push` (or paste into the SQL Editor) |
| Verify a doctor/pharmacist | Table Editor → `User` → set `verified = true` on their row |
| Reset demo data | Delete rows in the Table Editor, then visit `/api/seed` again |
| Inspect logs | Supabase Dashboard → **Logs** |

### Browser-Based Seeding (Dev Only)

Visit **http://localhost:3000/api/seed** to seed via browser. Blocked when `NODE_ENV=production`.

### Provider Verification

Doctors and pharmacists who self-register start with `verified = false` and receive
`403` responses from issue/dispense endpoints until an administrator flips
`verified` to `true` in the `User` table. Patients are auto-verified at
registration. Seeded demo accounts are pre-verified.

---

## 9. Authentication & Security

### How Login Works

```
1. User submits NIC + password (or License Number for pharmacists)
2. Attempt is rate-limited: max 5 tries per 15 minutes per IP + identifier
3. NextAuth CredentialsProvider looks up the user in Supabase
4. bcrypt.compare() validates the password (12 salt rounds)
5. Any failure returns the same generic "Invalid credentials" error
   (no user enumeration)
6. JWT token is issued with: id, role, medicalId, firstName, lastName, nicNumber
7. Token stored as HTTP-only cookie (24-hour expiry)
8. Subsequent requests: JWT is verified, session populated from token
```

### Security Measures

| Concern | Implementation |
|---------|----------------|
| **Passwords** | bcrypt, 12 salt rounds; 8-character minimum enforced server-side |
| **Sessions** | JWT, 24-hour expiry, HTTP-only cookies |
| **Login throttling** | 5 attempts / 15 min per IP+identifier; registration 10 / hour per IP |
| **User enumeration** | Single generic "Invalid credentials" message for all failures |
| **Input validation** | zod schemas on every mutating route (NIC format, mobile format, past-date DOB, item shape) |
| **API authorization** | Session + role checks on every endpoint |
| **Object-level access** | Patients can only read their own prescriptions; doctors only ones they issued; unauthorized lookups return 404 |
| **Provider gating** | Unverified doctors/pharmacists cannot issue or dispense |
| **Database exposure** | RLS enabled deny-all; only the server's service role key has access |
| **Atomic writes** | Multi-table writes run inside Postgres functions (real transactions, row locks) |
| **Duplicate races** | Unique-violation errors (Postgres `23505`) mapped to clean `409` responses |
| **QR code safety** | QR contains only the Medical ID (UUID) — no health data |
| **Seed protection** | `/api/seed` blocked when `NODE_ENV=production` |

> **Note:** the rate limiter is in-memory and per-instance. It is effective for a
> single server; for multi-instance/serverless deployments, replace it with a
> shared store (e.g. `@upstash/ratelimit` on Redis).

### Route Protection

Each dashboard section uses a `layout.tsx` that wraps content in `<DashboardLayout allowedRole="ROLE">`:

- **Unauthenticated** → redirect to `/login`
- **Wrong role** → redirect to correct dashboard
- **Correct role** → render content with sidebar

This client-side guard is a UX convenience; the actual enforcement happens in the API routes, which all validate the session server-side.

---

## 10. API Reference

### Authentication

#### `POST /api/auth/register`

Register a new user account. **Rate limited:** 10 requests/hour per IP.

**Request Body:**

```json
{
  "nicNumber": "200012345678",
  "firstName": "John",
  "lastName": "Doe",
  "mobileNumber": "0771234567",
  "dob": "2000-01-15",
  "password": "securePassword",
  "role": "PATIENT",
  "slmcRegNo": "SLMC-99999",          // Doctor only
  "specialization": "Cardiology",      // Doctor only
  "hospitalName": "National Hospital", // Doctor only
  "pharmacyName": "MediCare",          // Pharmacist only
  "pharmacyLicense": "PL-2024-001",    // Pharmacist only
  "pharmacyAddress": "45 Galle Road"   // Pharmacist only
}
```

Validation (zod): NIC must match the Sri Lankan format (9 digits + V/X, or 12 digits),
mobile must be 9–15 digits, DOB must be a valid past date, password ≥ 8 characters.

Doctors and pharmacists are created **unverified** and cannot issue/dispense until approved.

**Responses:** `201` Created | `400` Validation error | `409` Duplicate NIC/SLMC/License | `429` Rate limited

#### `POST /api/auth/[...nextauth]`

NextAuth.js handler — manages sign-in, sign-out, and session. Login attempts are
throttled (5 per 15 minutes per IP+identifier) and all credential failures return
the same generic error.

---

### Patient Lookup

#### `GET /api/patients/[medicalId]`

Look up a patient by their Medical ID (after QR scan). **Doctor/Pharmacist only.**

**Response (200):**

```json
{
  "patient": {
    "id": "uuid",
    "firstName": "Sasindu",
    "lastName": "Malhara",
    "nicNumber": "200012345678",
    "medicalId": "AYU-200012345678",
    "dob": "2000-05-15T00:00:00.000Z",
    "mobileNumber": "0771234567",
    "prescriptionsAsPatient": [...]
  }
}
```

**Responses:** `401` Unauthorized | `403` Patient role blocked | `404` Not found

---

### Prescriptions

#### `GET /api/prescriptions`

Fetch prescriptions filtered by the caller's role:
- **Patient** → own prescriptions only
- **Doctor** → own issued prescriptions (or by `?patientId=`)
- **Pharmacist** → prescriptions containing items they dispensed (or by `?patientId=` / `?medicalId=`; an unknown `medicalId` returns an empty list)

#### `POST /api/prescriptions`

Create a new prescription. **Doctor only — must be verified.**
Runs atomically via the `create_prescription_with_items` database function.

```json
{
  "patientId": "patient-uuid",
  "diagnosis": "Upper Respiratory Tract Infection",
  "items": [
    {
      "drugName": "Amoxicillin 500mg",
      "dosage": "1 capsule",
      "frequency": "Three times daily",
      "duration": "7 days",
      "instructions": "Take after meals"
    }
  ]
}
```

**Responses:** `201` Created | `400` Validation error | `403` Not a doctor / unverified | `404` Patient not found

#### `GET /api/prescriptions/[id]`

Fetch a single prescription with all items, patient, and doctor details.

**Object-level access control:** patients can only fetch their own prescriptions,
doctors only prescriptions they issued; pharmacists can fetch any (required for
dispensing scanned prescriptions). Unauthorized requests receive `404` so the
response does not confirm the prescription exists.

#### `PUT /api/prescriptions/[id]`

Dispense or revert an individual item. **Pharmacist only — must be verified.**

Runs atomically via the `dispense_prescription_item` database function, which
locks the prescription row, updates the item, and recomputes the three-state
status in one transaction. Reverts are only allowed within a **15-minute window**
after dispensing.

```json
{
  "itemId": "item-uuid",
  "dispensed": true
}
```

**Responses:** `200` OK | `400` Validation / not dispensed / window expired | `403` Not a pharmacist / unverified | `404` Prescription or item not found

---

### Pharmacy

#### `GET /api/pharmacy/profile`

Fetch the authenticated pharmacist's pharmacy profile. **Pharmacist only.**

### Seed (Dev Only)

#### `GET /api/seed`

Seeds the database with demo data. **Blocked in production.**

---

## 11. Frontend Pages & Components

### Pages (9 Dashboard + 3 Public = 12 Total)

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Hero, features, CTAs |
| `/login` | Login | NIC/License + password form |
| `/register` | Register | Multi-step form with role selection |
| `/patient/dashboard` | Patient Home | Stats, QR preview, prescription timeline |
| `/patient/medical-id` | Medical ID | Full QR code, personal info, usage guide |
| `/patient/prescriptions` | My Prescriptions | Filterable list (All/Active/Dispensed) |
| `/doctor/dashboard` | Doctor Home | Stats, quick actions, recent prescriptions |
| `/doctor/scan` | Scan & Prescribe | QR scanner + manual ID + prescription builder |
| `/doctor/prescriptions` | Issued Rxs | All issued prescriptions with filters |
| `/pharmacy/dashboard` | Pharmacy Home | Stats, quick actions, recent activity |
| `/pharmacy/dispense` | Scan & Dispense | QR scan + Rx lookup + per-item dispensing |
| `/pharmacy/records` | Records | Dispensing history with stats and filters |

### Shared Components

| Component | File | Purpose |
|-----------|------|---------|
| `AuthProvider` | `AuthProvider.tsx` | Wraps app with NextAuth `SessionProvider` |
| `DashboardLayout` | `DashboardLayout.tsx` | Sidebar + content area + role guard + loading |
| `Sidebar` | `Sidebar.tsx` | Role-based nav links, user card, logout button |
| `PrescriptionCard` | `PrescriptionCard.tsx` | Expandable card: diagnosis, medications, status |
| `QRCodeDisplay` | `QRCodeDisplay.tsx` | Renders QR code from Medical ID string |
| `QRScanner` | `QRScanner.tsx` | Camera-based QR scanner using html5-qrcode |

### Design System (globals.css)

| Token | Value | Usage |
|-------|-------|-------|
| `--color-background` | `#F7F0F0` | Main app background (Soft Shell) |
| `--color-primary-dark` | `#25671E` | Headers, primary text (Deep Forest) |
| `--color-primary-action` | `#48A111` | CTA buttons, active states (Vibrant Lime) |
| `--color-accent-warning` | `#F2B50B` | Pending statuses, alerts (Golden Amber) |
| `--color-surface` | `#FFFFFF` | Card backgrounds |
| `--color-border` | `#E5DFD6` | Borders and dividers |

**Component classes:** `.btn-primary`, `.btn-secondary`, `.card`, `.input-field`, `.badge-active`, `.badge-dispensed`, `.badge-warning`

**Animations:** `animate-fade-in`, `animate-slide-up`, `animate-slide-in-right`, `animate-pulse-soft`

---

## 12. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Your Supabase project URL (`https://xxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key — server-side only, bypasses RLS |
| `NEXTAUTH_URL` | ✅ | Application URL (`http://localhost:3000`) |
| `NEXTAUTH_SECRET` | ✅ | Secret for JWT signing (min 32 chars) |

> ⚠️ **Never commit `.env` to version control.** It is in `.gitignore` by default.
> A template is provided in `.env.example`.

---

## 13. Building for Production

### Build

```bash
npm run build
```

Expected output: **19 routes** (13 pages + 6 API endpoints), 0 TypeScript errors.

### Start Production Server

```bash
npm start
```

Runs at **http://localhost:3000** in production mode.

### Production Checklist

- [ ] Set `NEXTAUTH_SECRET` to a strong random value
- [ ] Set `NEXTAUTH_URL` to your production domain
- [ ] Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the production Supabase project
- [ ] Apply `supabase/migrations/20260719000000_init.sql` to the production database
- [ ] Confirm RLS shows as **enabled** on all 5 tables (Supabase Dashboard → Database → Tables)
- [ ] Ensure `NODE_ENV=production` (blocks `/api/seed`)
- [ ] Replace the in-memory rate limiter with a shared store if deploying to multiple instances / serverless
- [ ] Enable HTTPS (required for camera-based QR scanning)

---

## 14. Testing Guide

### Manual Testing Workflow

**Step 1: Seed the database**

Visit `http://localhost:3000/api/seed` with the dev server running.

**Step 2: Test the Patient flow**
1. Login with NIC `200012345678` / `password123`
2. Verify dashboard shows stats and QR preview
3. Navigate to **My Medical ID** — verify QR code and personal info
4. Navigate to **Prescriptions** — verify filter tabs (All/Active/Dispensed)

**Step 3: Test the Doctor flow**
1. Login with NIC `199812345678` / `password123`
2. Verify dashboard stats and quick-action cards
3. Go to **Scan & Prescribe** — enter Medical ID `AYU-200012345678`
4. Build and submit a prescription with multiple medications
5. Go to **My Prescriptions** — verify the new Rx appears

**Step 4: Test the Pharmacist flow**
1. Login with NIC `199512345678` / `password123`
2. Navigate to **Scan & Dispense** — look up Medical ID `AYU-200012345678`
3. Dispense individual items — verify status updates and the Undo window
4. Navigate to **Records** — verify dispensing history

**Step 5: Verify end-to-end**
- Log back in as Patient → see newly issued prescription with dispensing status
- Log in as Pharmacist → see dispensed items with pharmacist info

**Step 6: Verify security behavior**
- Fail login 6 times → expect "Too many login attempts"
- Register a new doctor → expect "pending verification" message; issuing a prescription should return 403 until `verified` is set to `true` in the `User` table

### API Testing (cURL)

```bash
# Register a new patient
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "nicNumber":"200099998888",
    "firstName":"Test",
    "lastName":"User",
    "mobileNumber":"0771111111",
    "dob":"2000-01-01",
    "password":"test1234",
    "role":"PATIENT"
  }'

# Seed database (dev only)
curl http://localhost:3000/api/seed
```

### Linting

```bash
npm run lint
```

### Type Checking

```bash
npx tsc --noEmit
```

### Database Inspection

Use the Supabase Dashboard → **Table Editor**, or connect any Postgres client
using the connection string from **Project Settings → Database**.

---

## 15. Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in [Vercel Dashboard](https://vercel.com)
3. Set environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`)
4. Vercel auto-detects Next.js — no extra build steps needed
5. Apply the SQL migration to your production Supabase project (SQL Editor or `supabase db push`)

> On Vercel/serverless, swap the in-memory rate limiter for a shared store
> (e.g. `@upstash/ratelimit`) — each serverless instance has its own memory.

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/public ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

### Self-Hosted (VPS)

```bash
git pull origin main
npm ci
npm run build
pm2 start npm --name ayulink -- start
```

The database schema only needs to be applied once per Supabase project.

---

## 16. Troubleshooting

| Problem | Solution |
|---------|----------|
| `Missing Supabase environment variables` on startup | Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` |
| Empty data / `relation "User" does not exist` | The SQL migration hasn't been applied — run `supabase/migrations/20260719000000_init.sql` |
| Migration fails with `already exists` errors | An older schema is present — run `supabase/reset.sql` first (⚠️ deletes all data and logins), then re-run the migration |
| `Could not find the function ... in the schema cache` | The RPC functions are missing — re-run the migration; then Dashboard → API → "Reload schema" if needed |
| `NEXTAUTH_SECRET` warning | Set a secret: `openssl rand -base64 32` |
| "Invalid credentials" with correct password | Check the account exists in the `User` table; NIC login is for patients/doctors, license login for pharmacists |
| "Too many login attempts" | Wait 15 minutes, or restart the dev server (limiter is in-memory) |
| 403 "pending verification" when issuing/dispensing | Set `verified = true` on the user's row in the `User` table |
| Port 3000 in use | `lsof -i :3000` then `kill -9 <PID>` |
| QR scanner not working | Requires HTTPS for camera access (or localhost) |
| Wrong dashboard after login | Clear cookies, check the `role` column in the `User` table |
| Build fails with TS errors | Run `npx tsc --noEmit` to see type issues |

---

> **Last updated:** July 2026 · **Version:** 0.1.0 · **License:** Private
