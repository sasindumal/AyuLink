# AyuLink — Full Project Documentation

> **Scope · Vision · Aims · Functions · Requirements**

---

## 1. Project Scope

### 1.1 What AyuLink Is

AyuLink is a **production-ready digital healthcare platform** purpose-built for **Sri Lanka's healthcare ecosystem**. It replaces traditional paper-based prescriptions with a secure, QR-code-driven **Digital Medical ID** system that connects three key stakeholders — **Patients**, **Doctors**, and **Pharmacists** — through a single, unified web application.

### 1.2 Problem Statement

Sri Lanka's current healthcare system relies heavily on **paper prescriptions**, which suffer from:

| Problem | Impact |
|---------|--------|
| **Illegible handwriting** | Pharmacists misread prescriptions, risking patient safety |
| **Lost/damaged prescriptions** | Patients lose access to their medication history |
| **No centralized records** | Doctors cannot see a patient's full prescription history |
| **No dispensing verification** | No audit trail of what was actually dispensed and when |
| **Fraud risk** | Paper prescriptions can be duplicated or tampered with |
| **Inefficiency** | Manual processes slow down every step of the healthcare workflow |

### 1.3 Scope Boundaries

**In Scope (v0.1.0):**
- Digital identity (Medical ID with QR code) for patients
- Role-based registration and authentication (Patient, Doctor, Pharmacist)
- Digital prescription creation by doctors
- Per-item medication dispensing by pharmacists
- Three-state prescription tracking (Not Dispensed → Partially → Fully Dispensed)
- 15-minute revert window for dispensing errors
- Role-guarded dashboards with statistics and activity history

**Out of Scope (Future):**
- Mobile native apps (iOS/Android)
- Integration with Sri Lanka's national health information system
- Telemedicine / video consultations
- Lab results and diagnostic imaging
- Insurance and billing integration
- Multi-language support (Sinhala, Tamil)
- SMS/email notifications
- Drug interaction checking
- Prescription expiry management

---

## 2. Vision

> *"To digitize Sri Lanka's healthcare prescription workflow, creating a seamless, paperless bridge between patients, doctors, and pharmacies — making healthcare safer, faster, and more transparent."*

### 2.1 Long-Term Vision

AyuLink envisions a future where:

1. **Every Sri Lankan citizen** has a unique Digital Medical ID accessible via QR code
2. **Every prescription** is digital, structured, and instantly verifiable
3. **Every pharmacy visit** is a simple scan-and-dispense workflow with full audit trails
4. **Medical history** follows the patient across any doctor or pharmacy in the country
5. **Healthcare data** is secure, encrypted, and only accessible to authorized providers

### 2.2 Design Philosophy

- **Simplicity First** — One scan connects the entire workflow
- **Security by Design** — JWT authentication, bcrypt hashing (12 salt rounds), role-based access
- **Sri Lanka Context** — NIC-based identity, SLMC registration for doctors, pharmacy licensing
- **Modern UX** — Responsive design, micro-animations, accessible color palette
- **Serverless-Ready** — Stateless JWT sessions for cloud deployment compatibility

---

## 3. Aims & Objectives

### 3.1 Primary Aims

| # | Aim | How It's Achieved |
|---|-----|-------------------|
| 1 | **Eliminate paper prescriptions** | Doctors create structured digital prescriptions via the web app |
| 2 | **Provide universal patient identity** | Every patient gets a UUID-based QR Medical ID at registration |
| 3 | **Enable instant verification** | QR scanning allows doctors/pharmacists to look up patients in seconds |
| 4 | **Track medication dispensing** | Per-item dispensing with pharmacist identity and timestamp recording |
| 5 | **Ensure data security** | Role-based access control, password hashing, JWT tokens, HTTPS |
| 6 | **Create audit trails** | Every dispense action is logged with who, when, and what |

### 3.2 Secondary Objectives

- Provide role-specific dashboards with actionable statistics
- Support dual login methods (NIC for patients/doctors, License Number for pharmacists)
- Enable prescription history viewing for all stakeholders
- Allow 15-minute error correction window for pharmacists
- Deploy as a modern, responsive web application accessible on any device

---

## 4. User Roles & Permissions

### 4.1 Role Matrix

| Capability | Patient | Doctor | Pharmacist |
|-----------|---------|--------|------------|
| Register account | ✅ | ✅ | ✅ |
| Login (NIC) | ✅ | ✅ | ❌ |
| Login (License Number) | ❌ | ❌ | ✅ |
| View own Medical ID / QR | ✅ | ❌ | ❌ |
| Scan patient QR | ❌ | ✅ | ✅ |
| Look up patient by Medical ID | ❌ | ✅ | ✅ |
| Create prescriptions | ❌ | ✅ | ❌ |
| View own prescriptions | ✅ | ✅ (issued) | ✅ (dispensed) |
| Dispense medications | ❌ | ❌ | ✅ |
| Revert dispensing (15 min) | ❌ | ❌ | ✅ |

### 4.2 Role-Specific Registration Fields

**Patient:** NIC, Name, Mobile, DOB, Password

**Doctor:** All Patient fields + SLMC Registration Number, Specialization, Hospital Name

**Pharmacist:** All Patient fields + Pharmacy Name, Pharmacy License Number, Pharmacy Address

---

## 5. Existing Functions — Complete Inventory

### 5.1 API Route Handlers (Backend — 10 Endpoints)

#### `POST /api/auth/register`
- **File:** `src/app/api/auth/register/route.ts`
- **Purpose:** Register a new user account
- **Logic:** Validates required fields → checks duplicate NIC → validates role-specific fields (SLMC for doctors, license for pharmacists) → checks uniqueness of professional IDs → hashes password (bcrypt, 12 rounds) → creates User with nested profile → returns sanitized user
- **Responses:** `201` Created | `400` Validation | `409` Duplicate | `500` Error

#### `POST/GET /api/auth/[...nextauth]`
- **File:** `src/app/api/auth/[...nextauth]/route.ts`
- **Purpose:** NextAuth.js handler for sign-in, sign-out, session
- **Logic:** CredentialsProvider with dual login (NIC or License Number) → bcrypt.compare → JWT (24h) → custom callbacks inject id, role, medicalId, firstName, lastName, nicNumber

#### `GET /api/patients/[medicalId]`
- **File:** `src/app/api/patients/[medicalId]/route.ts`
- **Purpose:** Look up patient by Medical ID (post-QR scan)
- **Access:** Doctor/Pharmacist only (Patient → 403)
- **Returns:** Patient info + prescription history with items, doctor, and dispensing details

#### `GET /api/prescriptions`
- **File:** `src/app/api/prescriptions/route.ts`
- **Purpose:** Fetch prescriptions filtered by caller's role
- **Filtering:** Patient → own only | Doctor → own issued or by patientId | Pharmacist → own dispensed or by patientId/medicalId
- **Includes:** Items with dispensedBy, patient details, doctor with profile

#### `POST /api/prescriptions`
- **File:** `src/app/api/prescriptions/route.ts`
- **Purpose:** Create a new prescription (Doctor only)
- **Validates:** patientId, diagnosis, ≥1 item; verifies patient exists with PATIENT role
- **Creates:** Prescription + nested PrescriptionItem records

#### `GET /api/prescriptions/[id]`
- **File:** `src/app/api/prescriptions/[id]/route.ts`
- **Purpose:** Fetch single prescription with full details (items, patient, doctor)

#### `PATCH /api/prescriptions/[id]`
- **File:** `src/app/api/prescriptions/[id]/route.ts`
- **Purpose:** Update prescription status directly (legacy, Pharmacist only)
- **Validates:** Status must be valid enum value

#### `PUT /api/prescriptions/[id]`
- **File:** `src/app/api/prescriptions/[id]/route.ts`
- **Purpose:** Dispense/revert individual item (Pharmacist only)
- **Logic:** Validates itemId + dispensed boolean → verifies item belongs to prescription → **revert check:** 15-minute window enforcement → updates item (dispensed, dispensedAt, dispensedById) → **auto-computes** prescription three-state status → returns updated prescription

#### `GET /api/pharmacy/profile`
- **File:** `src/app/api/pharmacy/profile/route.ts`
- **Purpose:** Fetch pharmacist's pharmacy profile (Pharmacist only)

#### `GET /api/seed`
- **File:** `src/app/api/seed/route.ts`
- **Purpose:** Seed database with demo data (blocked in production)

---

### 5.2 Full Project Functionalities — Page-by-Page Breakdown

---

#### 5.2.1 Landing Page (`/`)

**File:** `src/app/page.tsx`

**Functionalities:**
1. **Navigation Bar** — Logo + brand name on left; "Sign In" (secondary button) and "Get Started" (primary button) on right
2. **Hero Section** — Badge ("Digital Healthcare for Sri Lanka"), main headline with gradient accent text ("one scan away"), descriptive paragraph, two CTA buttons ("Create Free Account" and "Sign In")
3. **Trust Badges** — Three inline badges: "Secure & Encrypted", "Free for Patients", "Instant Access" — each with a green checkmark icon
4. **Floating Card Mockup** — Interactive visual showing a mock Medical ID card with QR placeholder, patient name, verification badge, and two floating mini-cards ("Prescription — Just issued" and "Encrypted — AES-256 secured") with background gradient glow
5. **Features Section** — 4 feature cards in a responsive grid:
   - Digital Medical ID — QR-based cloud identity
   - Digital Prescriptions — No more paper prescriptions
   - Instant Dispensing — QR scan at pharmacy
   - Secure & Private — Encrypted medical data
   - Each card has icon, title, description, hover scale animation on icon
6. **How It Works Section** — 4-step numbered flow: Register → Get Medical ID → Visit Doctor → Collect Medicine; connecting lines between steps on desktop
7. **CTA Section** — Centered card with background glow accents, logo, headline "Ready to go digital?", description, "Get Started for Free" button
8. **Footer** — Logo, brand name, copyright with dynamic year

**Animations:** `animate-fade-in` on hero text, `animate-slide-up` on card mockup, `animate-slide-in-right` on floating cards, `animate-pulse-soft` on verification badge

---

#### 5.2.2 Login Page (`/login`)

**File:** `src/app/login/page.tsx`

**Functionalities:**
1. **Split-Screen Layout** — Left panel (hidden on mobile): branded gradient background (#25671E → #0d3a0a) with logo, headline, description, 3 feature cards with glassmorphism styling and dot grid overlay
2. **Dual Login Mode Tabs** — Toggle between "Patient / Doctor" (NIC login) and "Pharmacy" (License Number login); active tab gets green highlight
3. **NIC Login Form** — NIC Number text input + Password field
4. **Pharmacy Login Form** — License Number text input + Password field
5. **Password Toggle** — Eye/EyeOff icon button to show/hide password
6. **Form Validation** — Client-side required fields; server-side error display in red alert box with slide-up animation
7. **Loading State** — Submit button shows spinning loader, disables during request
8. **Role-Based Redirect** — After successful login, fetches session → redirects: DOCTOR → `/doctor/dashboard`, PHARMACIST → `/pharmacy/dashboard`, PATIENT → `/patient/dashboard`
9. **Mode Switch** — Switching tabs clears all fields and errors
10. **Register Link** — "Don't have an account? Create one here" link to `/register`
11. **Mobile Logo** — Shows AyuLink logo on small screens (hidden on desktop where left panel shows)

**State Management:** `mode` (nic/pharmacy), `nicNumber`, `licenseNumber`, `password`, `showPassword`, `error`, `isLoading`

---

#### 5.2.3 Registration Page (`/register`)

**File:** `src/app/register/page.tsx`

**Functionalities:**
1. **Multi-Step Wizard** — Dynamic step count: 3 steps for Patient, 4 steps for Doctor/Pharmacist
2. **Step 1 — Role Selection:**
   - Three role cards (Patient, Doctor, Pharmacist) with icon, label, description
   - Visual selection with green border + checkmark on selected role
   - Hover effects and transition animations
3. **Step 2 — Personal Details:**
   - NIC Number (text)
   - First Name + Last Name (side-by-side grid)
   - Mobile Number (tel)
   - Date of Birth (date picker)
   - All fields required with validation
4. **Step 3 — Professional Info (Doctor only):**
   - SLMC Registration Number (text)
   - Specialization (dropdown with 15 options: General Practice, Cardiology, Dermatology, ENT, Gastroenterology, Neurology, Oncology, Ophthalmology, Orthopedics, Pediatrics, Psychiatry, Radiology, Surgery, Urology, Other)
   - Hospital/Clinic Name (text)
5. **Step 3 — Pharmacy Info (Pharmacist only):**
   - Pharmacy Name, Pharmacy License Number, Pharmacy Address
6. **Step 3/4 — Password Creation:**
   - Password field with show/hide toggle
   - Confirm Password field
   - **Password Strength Meter** — 4-bar visual indicator; color changes: red (< 8 chars) → amber (8–11 chars) → green (12+ chars); labels: "Too short" / "Good" / "Strong"
   - Minimum 8 characters validation; match validation
7. **Navigation** — "Back" and "Continue"/"Create Account" buttons; step progress tracked
8. **Left Panel** — Step indicator showing numbered steps with completion checkmarks; branded gradient panel
9. **Mobile Progress Bar** — Percentage-based progress bar with "Step X of Y" label
10. **Error Handling** — Red alert banners with slide-up animation for validation errors
11. **Submit** — POST to `/api/auth/register`; on success → redirect to `/login?registered=true`; loading spinner during submission

**State:** `step`, `formData` (14 fields), `error`, `isLoading`, `showPassword`

---

#### 5.2.4 Patient Dashboard (`/patient/dashboard`)

**File:** `src/app/patient/dashboard/page.tsx`

**Functionalities:**
1. **Welcome Header** — "Welcome back, {firstName} 👋" with refresh button
2. **3 Stat Cards:**
   - Active Prescriptions (green icon) — count of NOT_DISPENSED + PARTIALLY_DISPENSED
   - Total Prescriptions (dark icon) — total count
   - Dispensed (amber icon) — count of FULLY_DISPENSED
3. **QR Medical ID Preview** — Compact QRCodeDisplay (180px) showing patient's Medical ID with copy-to-clipboard
4. **Personal Info Card** — NIC Number, Full Name, Role displayed
5. **Prescription History Timeline:**
   - **Active Section** — Green pulsing dot + "Active (N)" label; lists NOT_DISPENSED and PARTIALLY_DISPENSED prescriptions
   - **Past Section** — "Past Prescriptions (N)" label; lists FULLY_DISPENSED prescriptions
   - Each prescription rendered as expandable PrescriptionCard (click to toggle details)
6. **Loading State** — 3 skeleton cards with pulse animation
7. **Empty State** — Icon + "No prescriptions yet" message with explanation
8. **Data Fetching** — `GET /api/prescriptions` on mount; manual refresh via button

---

#### 5.2.5 Patient Medical ID (`/patient/medical-id`)

**File:** `src/app/patient/medical-id/page.tsx`

**Functionalities:**
1. **Full-Size QR Code** — QRCodeDisplay at 260px; branded green (#25671E) QR on white; decorative corner accents in green
2. **Copy to Clipboard** — Click Medical ID to copy; visual feedback: button changes to "Copied!" with checkmark icon for 2 seconds; fallback for older browsers using `document.execCommand`
3. **Personal Information Card:**
   - Full Name (with IdCard icon)
   - NIC Number (with CreditCard icon)
   - Medical ID in monospace font (with QrCode icon)
4. **How to Use Guide** — 4-step numbered guide with green accent border:
   - Step 1: Visit a Doctor — show QR for records access
   - Step 2: Receive Digital Prescription — doctor links Rx to Medical ID
   - Step 3: Visit a Pharmacy — pharmacist scans QR
   - Step 4: Collect Medication — medications dispensed and marked
5. **Security Notice** — Green-tinted card with Shield icon explaining QR code only contains identifier, no health data

**Helper Components:** `InfoRow` (icon + label + value row), `Step` (numbered step with title and description)

---

#### 5.2.6 Patient Prescriptions (`/patient/prescriptions`)

**File:** `src/app/patient/prescriptions/page.tsx`

**Functionalities:**
1. **4 Filter Tabs** with counts:
   - All (total count)
   - Not Dispensed (active count)
   - Partial (partially dispensed count)
   - Fully Dispensed (completed count)
   - Active tab gets green highlight with white count badge
2. **Search Bar** — Search by diagnosis or doctor name; real-time filtering with search icon
3. **Prescription Cards** — Each card shows: diagnosis, date, doctor name, specialization, hospital, SLMC number, medication list (always expanded), status badge, Rx ID
4. **Empty States:**
   - No prescriptions at all: "Your prescriptions will appear here after a doctor issues one"
   - No search results: "Try adjusting your search terms"
   - Filtered empty: "No {status} prescriptions"
5. **Loading State** — Centered spinning loader

---

#### 5.2.7 Doctor Dashboard (`/doctor/dashboard`)

**File:** `src/app/doctor/dashboard/page.tsx`

**Functionalities:**
1. **Time-Based Greeting** — "Good morning/afternoon/evening, Dr. {Name} 🩺" based on current hour
2. **3 Stat Cards:** Total Prescriptions, Active (not dispensed), Dispensed (fully dispensed)
3. **2 Quick Action Cards:**
   - **Scan & Prescribe** — Links to `/doctor/scan`; green background icon with arrow; hover scale animation
   - **Issued Prescriptions** — Links to `/doctor/prescriptions`; dark background icon
4. **Recent Prescriptions** — Shows latest 5 prescriptions using PrescriptionCard; "View All →" link if more than 5 exist
5. **Loading State** — Centered spinner
6. **Empty State** — "No prescriptions yet. Scan a patient to get started!"

---

#### 5.2.8 Doctor Scan & Prescribe (`/doctor/scan`)

**File:** `src/app/doctor/scan/page.tsx`

**Functionalities:**
1. **Patient Identification Section:**
   - **QR Scanner Button** — Opens modal camera scanner; "Scan Patient QR Code"
   - **Manual ID Input** — Text input + "Look Up" button; supports Enter key submission
   - **Lookup Loading** — Button shows spinner during API call
   - **Lookup Error** — Red alert with AlertCircle icon
2. **Patient Info Card** (shown after successful lookup):
   - Name, NIC, Active Prescriptions count
   - "Change Patient" button to reset
3. **Prescription Builder:**
   - **Diagnosis Input** — Text field for condition/diagnosis
   - **Dynamic Medication List:**
     - Each medication: Drug Name*, Dosage*, Frequency*, Duration* (2-column grids), Instructions (optional)
     - "Add Medication" button (+ icon) to append new empty medication
     - Trash icon to remove a medication (hidden if only 1 remains)
     - Fields validated: drugName, dosage, frequency, duration required
   - **Submit Button** — "Sign & Issue Digital Prescription" with Send icon; loading spinner during submission
   - **Error Display** — Red alert for submission errors
4. **Success Banner** — Green card: "Prescription issued successfully!" with "Scan Next" action
5. **State Reset** — After successful submission: clears patient, diagnosis, medications; shows success banner

**Key Functions:** `lookupPatient()`, `handleScan()`, `handleManualLookup()`, `addMedication()`, `removeMedication()`, `updateMedication()`, `handleSubmit()`, `resetAll()`

---

#### 5.2.9 Doctor Issued Prescriptions (`/doctor/prescriptions`)

**File:** `src/app/doctor/prescriptions/page.tsx`

**Functionalities:**
1. **3 Stat Cards:** Total Issued, Not Dispensed, Fully Dispensed
2. **4 Filter Tabs** — All Issued, Not Dispensed, Partial, Fully Dispensed; each with icon and count badge
3. **Search Bar** — Search by patient name or diagnosis; real-time filtering
4. **Prescription List** — All prescriptions always expanded (showing full medication details); each shows patient name instead of doctor name
5. **Empty State** — "No prescriptions found" / "Try adjusting your search terms" / "Prescriptions you issue will appear here"
6. **Loading State** — Centered spinner

---

#### 5.2.10 Pharmacy Dashboard (`/pharmacy/dashboard`)

**File:** `src/app/pharmacy/dashboard/page.tsx`

**Functionalities:**
1. **Pharmacy Identity Card:**
   - Pharmacy name with verified badge (BadgeCheck icon)
   - License number in monospace font with bordered badge
   - Address with 📍 emoji
   - Green left border accent
2. **3 Stat Cards:** Total Prescriptions, Dispensed (fully dispensed count), Meds Given (total medication items from fully dispensed prescriptions)
3. **2 Quick Action Cards:**
   - **Scan & Dispense** — Links to `/pharmacy/dispense`; green icon
   - **View Records** — Links to `/pharmacy/records`; dark icon
4. **Data Fetching** — Parallel fetch of prescriptions + pharmacy profile on mount

---

#### 5.2.11 Pharmacy Scan & Dispense (`/pharmacy/dispense`)

**File:** `src/app/pharmacy/dispense/page.tsx`

**Functionalities:**
1. **Patient Search Section:**
   - QR Scanner button + Manual Medical ID input with Search button
   - Enter key support for manual input
2. **Patient Info Card** — Name, NIC, Medical ID; "Search Another" to reset
3. **Active Prescriptions List** (fully dispensed prescriptions are filtered out):
   - **Expandable Prescription Headers** — Click to toggle; shows diagnosis, dispensing progress (X/Y dispensed), date, doctor name + specialization; ChevronUp/Down toggle icon
   - **Auto-expand** — All active prescriptions auto-expanded on load
4. **Per-Item Dispensing:**
   - Each medication item shows: drug name with colored dot (green=dispensed, amber=pending), dosage, frequency, duration, instructions
   - **Dispense Button** — Green "Dispense" button for each undispensed item
   - **Done State** — Green checkmark "Done" label with dispensed time and pharmacy info (name + license number)
   - **Undo Button** — Appears only for items dispensed in current session AND within 15-minute window; "Undo" with Undo2 icon
   - **Loading State** — Per-item spinner while dispensing/reverting
5. **Progress Bar** — Per-prescription visual progress bar; "Dispensing Progress" label with X/Y count; green fill with smooth animation
6. **Error Handling** — Error banner with auto-dismiss after 4 seconds
7. **Session Tracking** — `sessionDispensed` Set tracks items dispensed in this browser session for revert eligibility

**Key Functions:** `lookupPatient()`, `dispenseItem()`, `canRevert()`, `toggleExpand()`, `resetAll()`, `formatDate()`, `formatTime()`

---

#### 5.2.12 Pharmacy Dispensing Records (`/pharmacy/records`)

**File:** `src/app/pharmacy/records/page.tsx`

**Functionalities:**
1. **3 Stat Cards:**
   - Prescriptions — Count of prescriptions with items dispensed by THIS pharmacist
   - Meds Dispensed — Total medication items dispensed by this pharmacist
   - Patients Served — Unique patient count (calculated using Set)
2. **Search Bar** — Search by patient name, diagnosis, or prescription ID
3. **Records List** — Only shows items dispensed by the current pharmacist (filtered by `dispensedBy.id === currentUserId`):
   - Each record card: diagnosis, issue date, doctor name + specialization + hospital + SLMC, patient name
   - "Dispensed by Your Pharmacy (N)" section with each item showing: drug name, dosage, frequency, duration, instructions, dispensed timestamp, pharmacy name + license
   - Green left border and green-tinted item backgrounds
   - Prescription ID in monospace (Rx #XXXXXXXX)
4. **Empty State** — "No records found" / "Prescriptions you dispense will appear here"

---

### 5.3 Reusable Component Functionalities (6)

#### AuthProvider (`src/components/AuthProvider.tsx`)
- Wraps entire application with NextAuth `SessionProvider`
- Enables `useSession()` hook access in all client components
- Required at root layout level

#### DashboardLayout (`src/components/DashboardLayout.tsx`)
- **Role Guard Logic:**
  - `status === "unauthenticated"` → redirect to `/login`
  - `status === "authenticated"` but wrong role → redirect to correct role's dashboard
  - `status === "loading"` → shows centered spinner with "Loading your dashboard..." text
  - Correct role → renders Sidebar + main content area
- **Layout:** Fixed sidebar (72rem width) + main content with 8rem padding and left margin

#### Sidebar (`src/components/Sidebar.tsx`)
- **Logo Area** — AyuLink logo + brand name + "Digital Healthcare" subtitle
- **Role-Based Navigation:**
  - PATIENT: Dashboard, My Medical ID, Prescriptions
  - DOCTOR: Dashboard, Scan Patient, Issued Prescriptions
  - PHARMACIST: Dashboard, Scan & Dispense, Records
- **Active State** — Green highlight + green dot indicator for current route
- **User Card** — Avatar icon (User or Building2 for pharmacy), display name (pharmacy name for pharmacists via API fetch), role label
- **Logout Button** — Red text, triggers `signOut()` with redirect to `/login`
- **Pharmacy Name Fetch** — Calls `GET /api/pharmacy/profile` on mount for pharmacist users

#### PrescriptionCard (`src/components/PrescriptionCard.tsx`)
- **Color-Coded Left Border:** Green (NOT_DISPENSED), Amber (PARTIALLY_DISPENSED), Gray (FULLY_DISPENSED)
- **Status Badge** — Pill-shaped badge with matching background color
- **Header** — Diagnosis title, date (formatted), doctor name OR patient name
- **Doctor Info Row** — Specialization, hospital, SLMC number (conditional)
- **Expanded View** — Medication list with: drug name, dosage, frequency (with clock icon), duration, instructions (italic)
- **Collapsed View** — "{N} medication(s) prescribed" summary
- **Rx ID Footer** — Monospace truncated UUID (first 8 chars, uppercase)
- **Click Handler** — Optional onClick for expand/collapse toggle
- **Animation** — `animate-slide-up` on mount

#### QRCodeDisplay (`src/components/QRCodeDisplay.tsx`)
- **QR Code Rendering** — SVG-based QR using `qrcode.react`; foreground color #25671E (brand green); error correction level "H" (high); configurable size (default 200px)
- **Decorative Corners** — 4 green corner accent borders around QR container
- **Copy to Clipboard** — Click Medical ID button → copies to clipboard → "Copied!" feedback for 2 seconds; fallback for legacy browsers using `document.execCommand`
- **Verification Badge** — Pulsing green dot + "Verified by AyuLink" text

#### QRScanner (`src/components/QRScanner.tsx`)
- **Modal Overlay** — Full-screen dark backdrop with blur; centered card
- **Camera Access** — Uses `html5-qrcode` library; requests rear camera (`facingMode: "environment"`); 10fps scanning; 250×250px scan area
- **Scanning Animation** — Pulsing scan line overlay inside bordered region
- **Auto-Stop** — Scanner stops automatically after first successful decode
- **Error Handling** — "Unable to access camera. Please grant camera permissions." alert
- **Close Button** — X icon to dismiss modal; cleans up scanner instance
- **Cleanup** — Scanner properly stopped on unmount via useEffect cleanup
- **Tips** — "Hold steady for best results • Ensure good lighting" footer text

---

### 5.4 Library Modules (3)

| Module | Export | Purpose |
|--------|--------|---------|
| **auth.ts** | `authOptions` | NextAuth config: CredentialsProvider, JWT (24h), custom callbacks |
| **prisma.ts** | `prisma` | Singleton PrismaClient via globalThis caching |
| **utils.ts** | `cn()` | clsx + tailwind-merge for conflict-free class composition |

---

### 5.5 Database Schema

**2 Enums:** `Role` (PATIENT, DOCTOR, PHARMACIST) · `PrescriptionStatus` (NOT_DISPENSED, PARTIALLY_DISPENSED, FULLY_DISPENSED)

**5 Models:**

| Model | Key Fields | Relations |
|-------|-----------|-----------|
| **User** | id, nicNumber (UK), firstName, lastName, mobile, dob, passwordHash, role, medicalId (UK) | doctorProfile?, pharmacyProfile?, prescriptionsAsPatient[], prescriptionsAsDoctor[], dispensedItems[] |
| **DoctorProfile** | id, userId (UK FK), slmcRegNo (UK), specialization, hospitalName | user (cascade delete) |
| **PharmacyProfile** | id, userId (UK FK), pharmacyName, licenseNumber (UK), pharmacyAddress | user (cascade delete) |
| **Prescription** | id, patientId (FK), doctorId (FK), dateIssued, diagnosis, status | patient, doctor, items[] |
| **PrescriptionItem** | id, prescriptionId (FK), drugName, dosage, frequency, duration, instructions, dispensed, dispensedAt?, dispensedById? (FK) | prescription (cascade), dispensedBy? |

---

### 5.6 Design System

**Colors:** Background (#F7F0F0), Primary Dark (#25671E), Primary Action (#48A111), Warning (#F2B50B), Surface (#FFFFFF), Border (#E5DFD6)

**Components:** `.btn-primary`, `.btn-secondary`, `.card`, `.input-field`, `.badge-active`, `.badge-dispensed`, `.badge-warning`

**Animations:** `animate-fade-in`, `animate-slide-up`, `animate-slide-in-right`, `animate-pulse-soft`

**Font:** Plus Jakarta Sans (weights 300–800)

---

## 6. Requirements

### 6.1 System Requirements

| Requirement | Version |
|-------------|---------|
| Node.js | 18.17+ |
| npm | 9+ |
| PostgreSQL | 14+ |

### 6.2 Tech Stack

Next.js 15.1+ · React 19 · TypeScript 5.7+ · Tailwind CSS v4 · PostgreSQL 14+ · Prisma 6.3 · NextAuth 4.24 · bcryptjs · qrcode.react · html5-qrcode · lucide-react · Turbopack

### 6.3 Security Requirements

- Passwords: bcrypt with 12 salt rounds
- Sessions: JWT, 24-hour expiry, HTTP-only cookies
- Access control: Role-based guards on every API endpoint and dashboard layout
- Unique constraints: NIC, SLMC, License Number
- Seed endpoint: blocked in production
- Camera access: requires HTTPS (except localhost)

---

## 7. Key Workflows

### 7.1 Prescription Lifecycle

```
Patient registers → Gets Digital Medical ID (QR)
  → Patient visits Doctor → Shows QR code
  → Doctor scans QR → Patient info loaded
  → Doctor creates Rx → Status: NOT_DISPENSED
  → Patient sees Rx in dashboard
  → Patient visits Pharmacy → Shows QR
  → Pharmacist scans QR → Active prescriptions listed
  → Pharmacist dispenses items one by one
    → Status auto-computes: NOT_DISPENSED → PARTIALLY → FULLY_DISPENSED
    → 15-minute revert window for errors
```

### 7.2 Authentication Flow

```
Credentials submitted → NextAuth CredentialsProvider
  → NIC mode: User.findUnique(nicNumber)
  → Pharmacy mode: PharmacyProfile.findUnique(licenseNumber) → User
  → bcrypt.compare(password, passwordHash)
  → JWT issued (id, role, medicalId, firstName, lastName, nicNumber)
  → Cookie set (24h) → Redirect to role dashboard
```

---

## 8. Demo Credentials

| Role | Login Method | Credential | Password |
|------|-------------|------------|----------|
| 👤 Patient | NIC | `200012345678` | `password123` |
| 🩺 Doctor | NIC | `199812345678` | `password123` |
| 💊 Pharmacist | NIC | `199512345678` | `password123` |

---

> **Version:** 0.1.0 · **Last Updated:** May 2026 · **License:** Private
