<div align="center">

<img src="public/logo.png" alt="AyuLink Logo" width="80" height="80" />

# AyuLink

### Digital Healthcare Platform for Sri Lanka

**A secure, QR-code-driven digital prescription system connecting Patients, Doctors, and Pharmacists.**

[![Next.js](https://img.shields.io/badge/Next.js-15.1-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

</div>

---

## 📖 Overview

**AyuLink** is a production-ready web application that digitizes Sri Lanka's healthcare prescription workflow. It replaces paper-based prescriptions with a secure **Digital Medical ID** system — every patient gets a unique QR code that instantly connects them to their medical records, active prescriptions, and dispensing history.

### The Problem

Sri Lanka's healthcare system relies heavily on paper prescriptions, which suffer from:

| Problem | Impact |
|---------|--------|
| **Illegible handwriting** | Pharmacists misread prescriptions, risking patient safety |
| **Lost/damaged prescriptions** | Patients lose access to their medication history |
| **No centralized records** | Doctors cannot see a patient's full prescription history |
| **No dispensing verification** | No audit trail of what was actually dispensed |
| **Fraud risk** | Paper prescriptions can be duplicated or tampered with |
| **Inefficiency** | Manual processes slow down every step of the healthcare workflow |

### The Solution

AyuLink connects three key stakeholders through one unified platform:

- 👤 **Patients** — Get a Digital Medical ID with QR code; view prescriptions and dispensing status
- 🩺 **Doctors** — Scan patient QR codes; create structured digital prescriptions
- 💊 **Pharmacists** — Scan QR codes; dispense medications per item with a full audit trail

---

## 📸 Screenshots

### 1. Landing Page
![AyuLink Landing Page](public/screenshots/landing.png)

### 2. Patient Dashboard
![Patient Dashboard](public/screenshots/patient-dashboard.png)

### 3. Doctor Dashboard (Scan & Prescribe)
![Doctor Scan & Prescribe](public/screenshots/doctor-dashboard.png)

---

## ✨ Features

### 🪪 Digital Medical ID
- Every patient receives a unique Medical ID derived from their NIC (`AYU-<NIC>`) at registration
- SVG QR code rendered with brand-green color (`#25671E`)
- Copyable Medical ID with clipboard feedback
- "Verified by AyuLink" pulsing badge

### 💊 Digital Prescriptions
- Doctors create structured prescriptions with diagnosis, medications, dosage, frequency, duration, and instructions
- Three-state prescription tracking: **Not Dispensed → Partially Dispensed → Fully Dispensed**
- Status auto-computed from individual item dispensing state

### 📷 QR Code Scanning
- Real-time camera-based QR scanning via `html5-qrcode` (rear camera, 250×250px scan area)
- Fallback manual Medical ID entry with lookup
- Clean modal overlay with scan-line animation

### 🔐 Security & Access Control
- Separate dashboards for Patients, Doctors, and Pharmacists
- JWT sessions (24-hour expiry) with role- and ownership-based guards on every API endpoint
- Dual login: NIC-based (Patients/Doctors) and License Number (Pharmacists)
- Passwords hashed with bcrypt (12 salt rounds); login and registration rate-limited
- Server-side input validation (zod) on every mutating route
- Row Level Security enabled on all tables — the database is closed to direct client access

### ✅ Provider Verification
- Self-registered doctors and pharmacists start **unverified**
- Issuing and dispensing are blocked until an administrator approves the account
- Approve via the Supabase Table Editor (`User.verified = true`)

### ⏪ 15-Minute Revert Window
- Pharmacists can undo individual item dispensing within 15 minutes of action
- Prevents permanent errors while maintaining audit integrity

### 📊 Role-Specific Dashboards
- Real-time stats, activity timelines, quick-action cards
- Prescription history with search, filter tabs, and expandable cards

---

## 🗺️ Application Routes

```
/                          → Landing Page
/login                     → Login (NIC or Pharmacy License)
/register                  → Multi-Step Registration

/patient/dashboard         → Patient: Stats, QR preview, prescription timeline
/patient/medical-id        → Patient: Full QR code + usage guide
/patient/prescriptions     → Patient: Filterable, searchable prescription list

/doctor/dashboard          → Doctor: Stats, quick actions, recent prescriptions
/doctor/scan               → Doctor: QR scan / manual lookup + prescription builder
/doctor/prescriptions      → Doctor: All issued prescriptions with filters

/pharmacy/dashboard        → Pharmacist: Stats, pharmacy identity, quick actions
/pharmacy/dispense         → Pharmacist: QR scan + per-item dispensing
/pharmacy/records          → Pharmacist: Dispensing history and personal records
```

---

## 📱 Mobile Apps

Three native mobile apps (React Native + Expo) live in [`mobile/`](mobile/), sharing the same API and design language:

| App | For | Highlights |
|-----|-----|-----------|
| **AyuLink** (`mobile/patient-app`) | Patients | Digital Medical ID QR, prescription history |
| **AyuLink Doctor** (`mobile/doctor-app`) | Doctors | Camera QR scanning, prescription builder |
| **AyuLink Pharmacy** (`mobile/pharmacy-app`) | Pharmacies | Scan & dispense with 15-minute undo |

The apps are **fully standalone** — they talk directly to Supabase (Supabase Auth + role-checked database functions over RLS-locked tables) and do not need the Next.js server running. See [mobile/README.md](mobile/README.md) for setup.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15.1 (App Router + Turbopack) |
| **Language** | TypeScript 5.7 |
| **UI** | React 19 + Tailwind CSS v4 |
| **Database** | Supabase (PostgreSQL) |
| **DB Client** | @supabase/supabase-js |
| **Auth** | NextAuth.js 4.24 (Credentials + JWT) |
| **Validation** | zod |
| **QR Code** | qrcode.react (render), html5-qrcode (scan) |
| **Icons** | lucide-react |
| **Crypto** | bcryptjs |
| **Font** | Plus Jakarta Sans |

---

## 🗄️ Database Schema

```
User ──────────────────────────────────────────────────
  id, nicNumber (unique), firstName, lastName
  mobileNumber, dob, passwordHash, role
  verified (bool — providers need approval)
  medicalId (unique, AYU-<NIC>)
  
  ├── DoctorProfile (optional)
  │     slmcRegNo, specialization, hospitalName
  │
  ├── PharmacyProfile (optional)
  │     pharmacyName, licenseNumber, pharmacyAddress
  │
  ├── Prescription[] (as Patient)
  ├── Prescription[] (as Doctor)
  └── PrescriptionItem[] (dispensed by this Pharmacist)

Prescription ──────────────────────────────────────────
  id, patientId (FK), doctorId (FK)
  dateIssued, diagnosis
  status: NOT_DISPENSED | PARTIALLY_DISPENSED | FULLY_DISPENSED
  └── PrescriptionItem[]

PrescriptionItem ──────────────────────────────────────
  id, prescriptionId (FK)
  drugName, dosage, frequency, duration, instructions
  dispensed (bool), dispensedAt?, dispensedById? (FK → User)
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18.17+ |
| npm | 9+ |
| PostgreSQL | 14+ |

### 1. Clone the repository

```bash
git clone https://github.com/your-username/ayulink.git
cd ayulink
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root:

```env
# Supabase (Project Settings -> API)
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"

# NextAuth secret — generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-secret-here"

# Base URL of your app
NEXTAUTH_URL="http://localhost:3000"
```

### 4. Set up the database

Create a [Supabase](https://supabase.com/) project, then run the schema in
`supabase/migrations/20260719000000_init.sql` — either paste it into the
Dashboard **SQL Editor**, or use the CLI:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

> **Re-running on an existing project?** The schema must be applied to a clean
> database. Run [`supabase/reset.sql`](supabase/reset.sql) in the SQL Editor
> first — ⚠️ it drops every AyuLink table, function, enum, **and all app
> logins** — then run the init migration.

To seed demo accounts, run [`supabase/seed.sql`](supabase/seed.sql) in the SQL
Editor (works without any server, safe to re-run) — or start the dev server and
visit `http://localhost:3000/api/seed`.

> **Provider verification:** doctors and pharmacists who self-register start
> unverified and cannot issue or dispense prescriptions. Approve them by
> setting `verified = true` on their row in the `User` table (Supabase
> Dashboard -> Table Editor). Seeded demo accounts are pre-verified.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌱 Demo Accounts

After seeding, use these credentials to explore all three roles:

| Role | Login Method | Credential | Password | Name |
|------|-------------|------------|----------|------|
| 👤 Patient | NIC Number | `200012345678` | `password123` | Sasindu Malhara |
| 🩺 Doctor | NIC Number | `199812345678` | `password123` | Dr. Amal Perera |
| 💊 Pharmacist | License `PL-2024-001` or NIC | `199512345678` | `password123` | Nimal Fernando (MediCare Pharmacy) |

> **Tip:** Re-run `supabase/seed.sql` (or visit `/api/seed` in dev) any time — both are idempotent.

---

## 🔌 API Reference

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| `POST` | `/api/auth/register` | Public (rate-limited) | Register a new user (providers start unverified) |
| `POST/GET` | `/api/auth/[...nextauth]` | Public (rate-limited) | NextAuth sign-in / sign-out / session (web) |
| `POST` | `/api/mobile/login` | Public (rate-limited) | Mobile login — returns a Bearer JWT |
| `POST` | `/api/auth/otp/send` · `/verify` | Public (rate-limited) | Mobile-number OTP verification |
| `GET` | `/api/patients/[medicalId]` | Doctor, Pharmacist | Look up a patient by Medical ID |
| `GET` | `/api/prescriptions` | All roles | List prescriptions (role-filtered) |
| `POST` | `/api/prescriptions` | Verified Doctor | Create a new prescription (atomic) |
| `GET` | `/api/prescriptions/[id]` | Owner / issuer / Pharmacist | Get a single prescription (ownership-checked) |
| `PUT` | `/api/prescriptions/[id]` | Verified Pharmacist | Dispense or revert an individual item (atomic) |
| `GET` | `/api/pharmacy/profile` | Pharmacist | Get pharmacist's pharmacy profile |
| `GET` | `/api/seed` | Dev only | Seed database with demo data |

---

## 📋 Prescription Lifecycle

```
Patient registers
    └── Gets a unique Digital Medical ID (QR code)
            │
            ▼
    Patient visits Doctor
    Doctor scans QR / enters Medical ID
            │
            ▼
    Doctor creates digital Prescription
    Status: NOT_DISPENSED
            │
            ▼
    Patient views Rx in dashboard
            │
            ▼
    Patient visits Pharmacy
    Pharmacist scans QR
            │
            ▼
    Pharmacist dispenses items one by one
    Status auto-updates: NOT_DISPENSED → PARTIALLY_DISPENSED → FULLY_DISPENSED
    (15-minute revert window for each item)
```

---

## 🔒 Security

| Concern | Implementation |
|---------|----------------|
| **Passwords** | bcrypt with 12 salt rounds; 8-char minimum enforced server-side |
| **Sessions** | JWT, 24-hour expiry, HTTP-only cookies |
| **API guards** | Role checks on every endpoint + ownership checks on prescription reads |
| **Provider gating** | Unverified doctors/pharmacists cannot issue or dispense |
| **Rate limiting** | Login: 5 / 15 min per IP+identifier · Registration: 10 / hour per IP |
| **User enumeration** | All login failures return one generic "Invalid credentials" message |
| **Input validation** | zod schemas on all mutating routes (NIC/mobile format, past DOB, item shape) |
| **Database** | RLS deny-all; service-role access from the server only; atomic writes via SQL functions |
| **Unique identifiers** | NIC, SLMC registration, pharmacy license (race-safe, mapped to 409) |
| **QR code safety** | Contains only the Medical ID (`AYU-<NIC>`) — no health data embedded |
| **Camera access** | Requires HTTPS (except localhost) |
| **Seed protection** | `/api/seed` blocked in production (`NODE_ENV`) |

---

## 🧩 Reusable Components

| Component | Description |
|-----------|-------------|
| `AuthProvider` | Wraps app with NextAuth `SessionProvider` |
| `DashboardLayout` | Role guard + sidebar + main layout shell |
| `Sidebar` | Role-aware navigation with active state highlighting |
| `PrescriptionCard` | Color-coded, expandable prescription display |
| `QRCodeDisplay` | SVG QR renderer with decorative corners + copy button |
| `QRScanner` | Camera modal with scan-line animation and auto-stop |

---

## 🎨 Design System

**Colors**

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#F7F0F0` | App background |
| Primary Dark | `#25671E` | QR code, borders, accents |
| Primary Action | `#48A111` | Buttons, highlights |
| Warning | `#F2B50B` | Partially dispensed state |
| Surface | `#FFFFFF` | Cards |
| Border | `#E5DFD6` | Input borders |

**Animations:** `animate-fade-in` · `animate-slide-up` · `animate-slide-in-right` · `animate-pulse-soft`

**Font:** [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) — weights 300–800

---

## 📁 Project Structure

```
ayulink/
├── supabase/
│   └── migrations/            # SQL schema for Supabase
├── src/
│   ├── app/
│   │   ├── page.tsx           # Landing page
│   │   ├── login/             # Login page
│   │   ├── register/          # Multi-step registration
│   │   ├── patient/           # Patient dashboard, medical-id, prescriptions
│   │   ├── doctor/            # Doctor dashboard, scan, prescriptions
│   │   ├── pharmacy/          # Pharmacy dashboard, dispense, records
│   │   └── api/               # API route handlers
│   │       ├── auth/          # NextAuth + register
│   │       ├── patients/      # Patient lookup
│   │       ├── prescriptions/ # Rx CRUD + dispensing
│   │       ├── pharmacy/      # Pharmacy profile
│   │       └── seed/          # Dev seeding
│   ├── components/
│   │   ├── AuthProvider.tsx
│   │   ├── DashboardLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── PrescriptionCard.tsx
│   │   ├── QRCodeDisplay.tsx
│   │   └── QRScanner.tsx
│   ├── lib/
│   │   ├── auth.ts            # NextAuth configuration (throttled, generic errors)
│   │   ├── supabase.ts        # Supabase server client (service role)
│   │   ├── rate-limit.ts      # In-memory rate limiter
│   │   ├── validation.ts      # zod request schemas
│   │   └── utils.ts           # cn() utility (clsx + tailwind-merge)
│   └── types/                 # Role/status enums + NextAuth augmentations
├── mobile/                    # React Native (Expo) apps
│   ├── patient-app/           # Patient app (Medical ID QR, prescriptions)
│   ├── doctor-app/            # Doctor app (scan & prescribe)
│   └── pharmacy-app/          # Pharmacy app (scan & dispense)
├── public/                    # Static assets
├── docs/                      # Project documentation
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## 📜 Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with Turbopack |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `supabase db push` | Apply SQL migrations to Supabase |
| `GET /api/seed` | Seed demo data (dev only) |

---

## 🔮 Roadmap (Future)

- [x] Mobile apps for patients, doctors, and pharmacies (React Native / Expo)
- [ ] Integration with Sri Lanka's national health information system (HIS)
- [ ] Telemedicine / video consultations
- [ ] Lab results and diagnostic imaging
- [ ] Insurance and billing integration
- [ ] Multi-language support (Sinhala / Tamil)
- [ ] SMS / email notifications
- [ ] Drug interaction checking
- [ ] Prescription expiry management
- [ ] Automated provider verification against SLMC / NMRA registries

---

## 📄 License

This project is private. All rights reserved.

---

<div align="center">

**AyuLink** · Digital Healthcare for Sri Lanka · v0.1.0

*Making healthcare safer, faster, and more transparent — one scan at a time.*

</div>
