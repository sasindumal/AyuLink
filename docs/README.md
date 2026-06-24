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
9. [Authentication System](#9-authentication-system)
10. [API Reference](#10-api-reference)
11. [Frontend Pages & Components](#11-frontend-pages--components)
12. [Environment Variables](#12-environment-variables)
13. [Building for Production](#13-building-for-production)
14. [Testing Guide](#14-testing-guide)
15. [Deployment](#15-deployment)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Project Overview

AyuLink is a **production-ready digital healthcare platform** built for Sri Lanka's healthcare ecosystem. It replaces paper prescriptions with a secure **Digital Medical ID** and digital prescription system, connecting **Patients**, **Doctors**, and **Pharmacists** through a unified web application.

### Core Features

| Feature | Description |
|---------|-------------|
| **Digital Medical ID** | UUID-based QR code identity for every patient |
| **Role-Based Dashboards** | Tailored UIs for Patient, Doctor, and Pharmacist |
| **Digital Prescriptions** | Doctors create structured prescriptions with medication items |
| **QR Code Scanning** | Doctors/Pharmacists scan patient QR codes to look up records |
| **Pharmacy Dispensing** | Per-item dispensing with 15-minute revert window |
| **Three-State Tracking** | `NOT_DISPENSED` → `PARTIALLY_DISPENSED` → `FULLY_DISPENSED` |

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
| **Database** | PostgreSQL | 14+ |
| **ORM** | Prisma | 6.3 |
| **Auth** | NextAuth.js (Credentials) | 4.24 |
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
│              Next.js 15 Server                   │
│  ┌──────────────┐ ┌───────────┐ ┌─────────────┐ │
│  │ API Routes   │ │ NextAuth  │ │    SSR      │ │
│  │ (Handlers)   │ │ (JWT)     │ │  Rendering  │ │
│  └──────┬───────┘ └───────────┘ └──────┬──────┘ │
└─────────┼──────────────────────────────┼────────┘
          │                              │
┌─────────▼──────────────────────────────▼────────┐
│              Prisma ORM → PostgreSQL             │
│  ┌──────┐ ┌───────────┐ ┌────────────┐          │
│  │ User │ │ Prescrip- │ │ Doctor/    │          │
│  │      │ │ tion      │ │ Pharmacy   │          │
│  │      │ │ + Items   │ │ Profiles   │          │
│  └──────┘ └───────────┘ └────────────┘          │
└─────────────────────────────────────────────────┘
```

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
4. Patient views Rx in their dashboard
5. Patient visits Pharmacy (shows QR or Rx ID)
6. Pharmacist looks up Rx → GET /api/prescriptions/[id]
7. Pharmacist dispenses items → PUT /api/prescriptions/[id]
   - Each item toggles individually
   - Status auto-computes: NOT_DISPENSED → PARTIALLY → FULLY_DISPENSED
   - 15-minute revert window for undoing a dispense
```

### 3.4 Database Schema (ERD)

```
┌──────────────────────┐       ┌──────────────────────┐
│        User          │       │    DoctorProfile      │
├──────────────────────┤       ├──────────────────────┤
│ id          UUID PK  │──┐    │ id          UUID PK  │
│ nicNumber   String UK│  │    │ userId      UUID FK  │◄──┐
│ firstName   String   │  │    │ slmcRegNo   String UK│   │
│ lastName    String   │  │    │ specialization String│   │
│ mobileNumber String  │  │    │ hospitalName String  │   │
│ dob         DateTime │  │    └──────────────────────┘   │
│ passwordHash String  │  │                               │
│ role        Enum     │  ├───────────────────────────────┘
│ medicalId   UUID UK  │  │
│ createdAt   DateTime │  │    ┌──────────────────────┐
│ updatedAt   DateTime │  │    │   PharmacyProfile     │
└──────────────────────┘  │    ├──────────────────────┤
         │                │    │ id            UUID PK│
         │                └───►│ userId        UUID FK│
         │                     │ pharmacyName  String │
         │                     │ licenseNumber String UK│
         ▼                     │ pharmacyAddress String│
┌──────────────────────┐       └──────────────────────┘
│    Prescription      │
├──────────────────────┤
│ id         UUID PK   │
│ patientId  UUID FK   │◄── User (patient)
│ doctorId   UUID FK   │◄── User (doctor)
│ dateIssued DateTime  │
│ diagnosis  String    │
│ status     Enum      │  NOT_DISPENSED | PARTIALLY_DISPENSED | FULLY_DISPENSED
└──────────┬───────────┘
           │
           ▼ (1:many)
┌──────────────────────┐
│  PrescriptionItem    │
├──────────────────────┤
│ id             UUID PK│
│ prescriptionId UUID FK│
│ drugName       String │
│ dosage         String │
│ frequency      String │
│ duration       String │
│ instructions   String │
│ dispensed      Boolean│
│ dispensedAt    DateTime?│
│ dispensedById  UUID FK?│◄── User (pharmacist)
└──────────────────────┘
```

---

## 4. Directory Structure

```
AyuLink/
├── prisma/
│   ├── schema.prisma              # Database schema (5 models, 2 enums)
│   ├── seed.ts                    # Demo data seed script
│   └── migrations/                # 4 migration files
│
├── public/
│   ├── logo.png                   # Brand logo (PNG)
│   ├── logo.svg                   # Brand logo (SVG)
│   └── logo-white.jpg             # White variant for dark backgrounds
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
│   │       ├── patients/[medicalId]/route.ts  # GET patient lookup
│   │       ├── prescriptions/route.ts         # GET list / POST create
│   │       ├── prescriptions/[id]/route.ts    # GET / PATCH / PUT
│   │       ├── pharmacy/profile/route.ts      # GET pharmacy profile
│   │       └── seed/route.ts                  # GET seed (dev only)
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
│   │   ├── auth.ts                # NextAuth config (credentials, JWT, callbacks)
│   │   ├── prisma.ts              # Prisma client singleton
│   │   └── utils.ts               # cn() utility (clsx + tailwind-merge)
│   │
│   └── types/
│       └── next-auth.d.ts         # NextAuth type augmentations
│
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
| **PostgreSQL** | 14+ | `psql --version` |
| **Git** | Any | `git --version` |

### Install PostgreSQL (macOS)

```bash
# Using Homebrew
brew install postgresql@16
brew services start postgresql@16

# Create the database
createdb ayulink_db
```

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

> This automatically runs `prisma generate` via the `postinstall` script.

### Step 3: Configure Environment

Create a `.env` file in the project root:

```env
# PostgreSQL connection string
DATABASE_URL="postgresql://YOUR_USERNAME@localhost:5432/ayulink_db"

# NextAuth.js configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-strong-random-secret-here"
```

> **Generate a secret:** `openssl rand -base64 32`

### Step 4: Run Database Migrations

```bash
npx prisma migrate dev
```

### Step 5: Seed Demo Data

```bash
npx prisma db seed
```

This creates 3 demo accounts (Patient, Doctor, Pharmacist) and 2 sample prescriptions.

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
| `postinstall` | `prisma generate` | Generate Prisma client |

---

## 8. Database Management

### Prisma Commands

```bash
# Generate the Prisma client after schema changes
npx prisma generate

# Create and apply a new migration
npx prisma migrate dev --name describe_your_change

# Apply migrations in production
npx prisma migrate deploy

# Reset database (drops all data, re-runs migrations + seed)
npx prisma migrate reset

# Open Prisma Studio (visual database browser)
npx prisma studio

# Seed demo data
npx prisma db seed
```

### Browser-Based Seeding (Dev Only)

Visit **http://localhost:3000/api/seed** to seed via browser. Blocked in production.

### Migration History

| Migration | Description |
|-----------|-------------|
| `20260224080008_init` | Initial schema: User, DoctorProfile, Prescription, PrescriptionItem |
| `20260224120054_add_item_dispensing` | Per-item dispensing fields (dispensedAt, dispensedById) |
| `20260224121851_add_pharmacy_profile` | PharmacyProfile model for pharmacist users |
| `20260224130402_make_pharmacy_fields_optional` | Make pharmacy-specific fields nullable |

---

## 9. Authentication System

### How It Works

```
1. User submits NIC + password (or License Number for pharmacists)
2. NextAuth CredentialsProvider looks up user in PostgreSQL
3. bcrypt.compare() validates the password (12 salt rounds)
4. JWT token is issued with: id, role, medicalId, firstName, lastName, nicNumber
5. Token stored as HTTP-only cookie (24-hour expiry)
6. Subsequent requests: JWT is verified, session populated from token
```

### Key Design Decisions

- **JWT Strategy** — Stateless sessions for serverless compatibility; 24-hour expiry
- **Dual Login** — NIC number (Patient/Doctor) or License Number (Pharmacist)
- **bcryptjs** — 12 salt rounds for password hashing
- **Role in Token** — Role, medicalId, firstName, lastName embedded in JWT
- **Custom Pages** — Login at `/login`, errors redirect to `/login`

### Route Protection

Each dashboard section uses a `layout.tsx` that wraps content in `<DashboardLayout allowedRole="ROLE">`:

- **Unauthenticated** → redirect to `/login`
- **Wrong role** → redirect to correct dashboard
- **Correct role** → render content with sidebar

---

## 10. API Reference

### Authentication

#### `POST /api/auth/register`

Register a new user account.

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

**Responses:** `201` Created | `400` Validation error | `409` Duplicate NIC/SLMC/License

#### `POST /api/auth/[...nextauth]`

NextAuth.js handler — manages sign-in, sign-out, and session.

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
    "medicalId": "med-patient-demo-001",
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
- **Pharmacist** → dispensed by self (or by `?patientId=` / `?medicalId=`)

#### `POST /api/prescriptions`

Create a new prescription. **Doctor only.**

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

**Responses:** `201` Created | `400` Missing fields | `403` Not a doctor | `404` Patient not found

#### `GET /api/prescriptions/[id]`

Fetch a single prescription with all items, patient, and doctor details.

#### `PATCH /api/prescriptions/[id]`

Update prescription status directly. **Pharmacist only.** (Legacy endpoint)

```json
{ "status": "FULLY_DISPENSED" }
```

#### `PUT /api/prescriptions/[id]`

Dispense or revert an individual item. **Pharmacist only.** Auto-computes the prescription's three-state status. Reverts allowed within **15-minute window** only.

```json
{
  "itemId": "item-uuid",
  "dispensed": true
}
```

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
| `/pharmacy/dashboard` | Pharmacy Home | 4 stats, quick actions, recent activity |
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
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NEXTAUTH_URL` | ✅ | Application URL (`http://localhost:3000`) |
| `NEXTAUTH_SECRET` | ✅ | Secret for JWT signing (min 32 chars) |

> ⚠️ **Never commit `.env` to version control.** It is in `.gitignore` by default.

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
- [ ] Set `DATABASE_URL` to production PostgreSQL
- [ ] Run `npx prisma migrate deploy`
- [ ] Remove `/api/seed` route or ensure `NODE_ENV=production`
- [ ] Enable HTTPS via reverse proxy (Nginx/Caddy)

---

## 14. Testing Guide

### Manual Testing Workflow

**Step 1: Seed the database**
```bash
npx prisma db seed
```

**Step 2: Test the Patient flow**
1. Login with NIC `200012345678` / `password123`
2. Verify dashboard shows stats and QR preview
3. Navigate to **My Medical ID** — verify QR code and personal info
4. Navigate to **Prescriptions** — verify filter tabs (All/Active/Dispensed)

**Step 3: Test the Doctor flow**
1. Login with NIC `199812345678` / `password123`
2. Verify dashboard stats and quick-action cards
3. Go to **Scan & Prescribe** — enter Medical ID `med-patient-demo-001`
4. Build and submit a prescription with multiple medications
5. Go to **My Prescriptions** — verify the new Rx appears

**Step 4: Test the Pharmacist flow**
1. Login with NIC `199512345678` / `password123`
2. Navigate to **Scan & Dispense** — look up a prescription ID
3. Dispense individual items — verify status updates
4. Navigate to **Records** — verify dispensing history

**Step 5: Verify end-to-end**
- Log back in as Patient → see newly issued prescription
- Log in as Pharmacist → see dispensed items with pharmacist info

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

```bash
npx prisma studio
```

---

## 15. Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in [Vercel Dashboard](https://vercel.com)
3. Set environment variables (`DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`)
4. Vercel auto-detects Next.js and runs `prisma generate` via `postinstall`
5. Run `npx prisma migrate deploy` via build command

### Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
```

### Self-Hosted (VPS)

```bash
git pull origin main
npm ci
npx prisma migrate deploy
npm run build
pm2 start npm --name ayulink -- start
```

---

## 16. Troubleshooting

| Problem | Solution |
|---------|----------|
| `PrismaClientInitializationError` | Check `DATABASE_URL`, ensure PostgreSQL is running |
| `NEXTAUTH_SECRET` warning | Set a secret: `openssl rand -base64 32` |
| Port 3000 in use | `lsof -i :3000` then `kill -9 <PID>` |
| Prisma client out of date | Run `npx prisma generate` |
| Migration drift | Run `npx prisma migrate reset` (⚠️ drops all data) |
| QR scanner not working | Requires HTTPS for camera access (or localhost) |
| Wrong dashboard after login | Clear cookies, check role in `npx prisma studio` |
| `Module not found: @prisma/client` | Run `npm install` (triggers `postinstall`) |
| Build fails with TS errors | Run `npx tsc --noEmit` to see type issues |

---

> **Last updated:** May 2026 · **Version:** 0.1.0 · **License:** Private
