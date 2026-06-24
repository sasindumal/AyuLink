# AyuLink – Digital Healthcare Platform – Walkthrough

## What Was Built

A complete, production-ready Next.js 14+ web application that replaces paper prescriptions with a secure Digital Medical ID and digital prescription system. Includes full authentication, role-based dashboards (Patient, Doctor, Pharmacist) with **9 fully functional pages**, QR-code Medical IDs, digital prescription builder, and pharmacy dispensing.

---

## Demo Account Credentials

| Role | NIC Number | Password | Name |
|------|-----------|----------|------|
| 👤 **Patient** | `200012345678` | `password123` | Sasindu Malhara |
| 🩺 **Doctor** | `199812345678` | `password123` | Dr. Amal Perera (Cardiology) |
| 💊 **Pharmacist** | `199512345678` | `password123` | Nimal Fernando |

> [!TIP]
> Run `npx prisma db seed` to reset demo data, or visit `http://localhost:3000/api/seed` in development.

---

## All Pages – Screenshots

### Patient Experience

````carousel
![Patient Dashboard – Welcome greeting, stats (Active/Total/Dispensed), QR Medical ID, prescription timeline](/Users/sasindumalhara/.gemini/antigravity/brain/febdc7dd-2f79-43e4-8e63-f857a5084317/patient_dashboard.png)
<!-- slide -->
![My Medical ID – Full QR code, personal info (name, NIC, Medical ID), 4-step usage guide, security notice](/Users/sasindumalhara/.gemini/antigravity/brain/febdc7dd-2f79-43e4-8e63-f857a5084317/patient_medical_id_1771922395074.png)
<!-- slide -->
![My Prescriptions – Filter tabs (All 2/Active 1/Dispensed 1), search bar, expanded medication cards with dosage details](/Users/sasindumalhara/.gemini/antigravity/brain/febdc7dd-2f79-43e4-8e63-f857a5084317/patient_prescriptions_1771922438979.png)
````

### Doctor Experience

````carousel
![Doctor Dashboard – Greeting, stats (2 Total/1 Active/1 Dispensed), quick-action cards (Scan & Prescribe, My Prescriptions), recent prescriptions list](/Users/sasindumalhara/.gemini/antigravity/brain/febdc7dd-2f79-43e4-8e63-f857a5084317/doctor_dashboard_1771922571830.png)
<!-- slide -->
![Scan & Prescribe – QR scanner button, manual Medical ID input, patient lookup, prescription builder (hidden until patient found)](/Users/sasindumalhara/.gemini/antigravity/brain/febdc7dd-2f79-43e4-8e63-f857a5084317/doctor_scan_patient_1771922628433.png)
<!-- slide -->
![My Prescriptions – Stats (2 Issued/1 Active/1 Dispensed), filter tabs, search by patient/diagnosis, expanded prescription cards showing patient names](/Users/sasindumalhara/.gemini/antigravity/brain/febdc7dd-2f79-43e4-8e63-f857a5084317/doctor_prescriptions_1771922708364.png)
````

### Pharmacy Experience

````carousel
![Pharmacy Dashboard – 4 stats (2 Total/1 Pending/1 Dispensed/2 Meds Given), quick-action cards (Scan & Dispense, View Records), recent activity](/Users/sasindumalhara/.gemini/antigravity/brain/febdc7dd-2f79-43e4-8e63-f857a5084317/pharmacy_dashboard_1771922919646.png)
<!-- slide -->
![Scan & Dispense – QR scanner + prescription ID search, prescription detail view with medications, Mark as Dispensed button](/Users/sasindumalhara/.gemini/antigravity/brain/febdc7dd-2f79-43e4-8e63-f857a5084317/pharmacy_records_1771923155215.png)
<!-- slide -->
![Records – 4 stats, filter tabs (All Records/Pending/Dispensed), search by patient/diagnosis/ID, expanded prescription cards](/Users/sasindumalhara/.gemini/antigravity/brain/febdc7dd-2f79-43e4-8e63-f857a5084317/pharmacy_records_final_1771923275070.png)
````

### Landing & Auth

````carousel
![Landing Page – Hero with branded messaging, feature highlights, CTA buttons](/Users/sasindumalhara/.gemini/antigravity/brain/c14f64cb-e2fb-4bc4-aef3-12b3d87d31b2/landing_page_1771918197932.png)
<!-- slide -->
![Login Page – Split-screen with branded gradient panel and NIC/password form](/Users/sasindumalhara/.gemini/antigravity/brain/c14f64cb-e2fb-4bc4-aef3-12b3d87d31b2/login_page_1771918210029.png)
<!-- slide -->
![Register Page – Multi-step form with role selection (Patient/Doctor/Pharmacist)](/Users/sasindumalhara/.gemini/antigravity/brain/c14f64cb-e2fb-4bc4-aef3-12b3d87d31b2/register_page_1771918222515.png)
````

---

## Demo Flow Recording

![Full browser recording showing login, navigation across all tabs for Patient, Doctor, and Pharmacist roles](/Users/sasindumalhara/.gemini/antigravity/brain/febdc7dd-2f79-43e4-8e63-f857a5084317/all_tabs_testing_1771922310426.webp)

---

## Architecture

```mermaid
graph TD
    A["Landing Page /"] --> B["Login /login"]
    A --> C["Register /register"]
    B --> D{Role?}
    
    D -->|Patient| E["Dashboard /patient/dashboard"]
    E --> E1["My Medical ID /patient/medical-id"]
    E --> E2["Prescriptions /patient/prescriptions"]
    
    D -->|Doctor| F["Dashboard /doctor/dashboard"]
    F --> F1["Scan & Prescribe /doctor/scan"]
    F --> F2["My Prescriptions /doctor/prescriptions"]
    
    D -->|Pharmacist| G["Dashboard /pharmacy/dashboard"]
    G --> G1["Scan & Dispense /pharmacy/dispense"]
    G --> G2["Records /pharmacy/records"]
    
    F1 -->|"Scan QR / Enter ID"| H["Patient Lookup API"]
    F1 -->|"Issue Rx"| I["Prescription API"]
    G1 -->|"Scan QR / Enter ID"| H
    G1 -->|"Dispense"| J["Update Rx Status"]
    E2 -->|"View Rx"| I
```

---

## Complete File List

### New Pages (This Update)
| File | Purpose |
|------|---------|
| [medical-id/page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/patient/medical-id/page.tsx) | **[NEW]** QR code, personal info, 4-step usage guide, security notice |
| [prescriptions/page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/patient/prescriptions/page.tsx) | **[NEW]** Filterable prescription list (All/Active/Dispensed) with search |
| [scan/page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/doctor/scan/page.tsx) | **[NEW]** QR scanner + manual ID input + full prescription builder |
| [prescriptions/page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/doctor/prescriptions/page.tsx) | **[NEW]** Doctor's issued prescriptions with stats and filters |
| [dispense/page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/pharmacy/dispense/page.tsx) | **[NEW]** QR scan + prescription ID search + Mark as Dispensed |
| [records/page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/pharmacy/records/page.tsx) | **[NEW]** Dispensing history with 4 stats + filters + search |

### Enhanced Dashboards (This Update)
| File | Changes |
|------|---------|
| [doctor/dashboard/page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/doctor/dashboard/page.tsx) | Added stats overview + quick-action cards + recent prescriptions |
| [pharmacy/dashboard/page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/pharmacy/dashboard/page.tsx) | Added 4 stats + quick-action cards + recent activity |
| [Sidebar.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/components/Sidebar.tsx) | Updated routes to distinct pages + fixed isActive highlighting |

### Previously Built Files
| File | Purpose |
|------|---------|
| [schema.prisma](file:///Users/sasindumalhara/Workspace/AyuLink/prisma/schema.prisma) | User, DoctorProfile, Prescription, PrescriptionItem models |
| [seed.ts](file:///Users/sasindumalhara/Workspace/AyuLink/prisma/seed.ts) | Demo accounts + sample prescriptions seed script |
| [auth.ts](file:///Users/sasindumalhara/Workspace/AyuLink/src/lib/auth.ts) | NextAuth config (Credentials, JWT, role-based) |
| [register/route.ts](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/api/auth/register/route.ts) | User registration endpoint |
| [prescriptions/route.ts](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/api/prescriptions/route.ts) | Rx list & create |
| [prescriptions/[id]/route.ts](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/api/prescriptions/%5Bid%5D/route.ts) | Rx detail & dispense |
| [patients/[medicalId]/route.ts](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/api/patients/%5BmedicalId%5D/route.ts) | Patient lookup by Medical ID |
| [seed/route.ts](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/api/seed/route.ts) | Browser-triggered seeding (dev only) |
| [page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/page.tsx) | Landing page |
| [login/page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/login/page.tsx) | Login page |
| [register/page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/register/page.tsx) | Multi-step registration |
| [patient/dashboard/page.tsx](file:///Users/sasindumalhara/Workspace/AyuLink/src/app/patient/dashboard/page.tsx) | Patient dashboard |
| All shared components | QRCodeDisplay, QRScanner, Sidebar, PrescriptionCard, DashboardLayout, AuthProvider |

---

## Verification Results

- ✅ **Build**: `npm run build` — 19 routes (13 pages + 6 API), 0 TypeScript errors
- ✅ **All 9 dashboard pages** functional with real data from seeded database
- ✅ **Sidebar navigation** — All tabs navigate to distinct pages with correct active highlighting
- ✅ **Patient tabs**: Dashboard (stats + QR + timeline) → Medical ID (QR + info + guide) → Prescriptions (filters + search)
- ✅ **Doctor tabs**: Dashboard (stats + quick actions + recent) → Scan & Prescribe (QR + builder) → My Prescriptions (filters + stats)  
- ✅ **Pharmacy tabs**: Dashboard (4 stats + quick actions + recent) → Scan & Dispense (QR + detail + dispense) → Records (4 stats + filters)
- ✅ **Registration**: Enhanced multi-step form with Pharmacist-specific fields
- ✅ **Prescription flow**: Doctor issues → Patient views → Pharmacist dispenses (full end-to-end)
