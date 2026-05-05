# Graph Report - AyuLink  (2026-05-05)

## Corpus Check
- 41 files · ~27,645 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 148 nodes · 122 edges · 48 communities (36 shown, 12 thin omitted)
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f1194421`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Pharmacy Dispensing UI|Pharmacy Dispensing UI]]
- [[_COMMUNITY_API Routes & Auth Core|API Routes & Auth Core]]
- [[_COMMUNITY_Shared UI Utilities|Shared UI Utilities]]
- [[_COMMUNITY_Database Schema & Migrations|Database Schema & Migrations]]
- [[_COMMUNITY_Registration Flow|Registration Flow]]
- [[_COMMUNITY_Brand Identity & Logo|Brand Identity & Logo]]
- [[_COMMUNITY_QR Code & Medical ID|QR Code & Medical ID]]
- [[_COMMUNITY_Dashboard Shell & Navigation|Dashboard Shell & Navigation]]
- [[_COMMUNITY_Role-Based Access Control|Role-Based Access Control]]
- [[_COMMUNITY_Pharmacy Feature Pages|Pharmacy Feature Pages]]
- [[_COMMUNITY_Doctor Feature Pages|Doctor Feature Pages]]
- [[_COMMUNITY_Prescription Status|Prescription Status]]
- [[_COMMUNITY_Pharmacy Schema Update|Pharmacy Schema Update]]
- [[_COMMUNITY_CSS Class Utilities|CSS Class Utilities]]
- [[_COMMUNITY_Pharmacy Records Page|Pharmacy Records Page]]
- [[_COMMUNITY_Doctor Scan Page|Doctor Scan Page]]
- [[_COMMUNITY_Landing Page Component|Landing Page Component]]
- [[_COMMUNITY_Root Layout|Root Layout]]
- [[_COMMUNITY_Seed Endpoint|Seed Endpoint]]
- [[_COMMUNITY_Auth Provider|Auth Provider]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 9 edges
2. `NextAuth Configuration` - 8 edges
3. `Prisma Client Singleton` - 7 edges
4. `AyuLink Brand Logo` - 6 edges
5. `lookupPatient()` - 5 edges
6. `Prescriptions API (List/Create)` - 5 edges
7. `validateStep()` - 4 edges
8. `Initial Database Schema Migration` - 4 edges
9. `User Table` - 4 edges
10. `Prescription Table` - 3 edges

## Surprising Connections (you probably didn't know these)
- `QRCodeDisplay Component` --implements--> `Digital Medical ID Concept`  [INFERRED]
  src/components/QRCodeDisplay.tsx → docs/walkthrough.md
- `QRScanner Component` --implements--> `Digital Medical ID Concept`  [INFERRED]
  src/components/QRScanner.tsx → docs/walkthrough.md
- `License Number Login Strategy` --shares_data_with--> `PharmacyProfile Table`  [INFERRED]
  src/lib/auth.ts → prisma/migrations/20260224121851_add_pharmacy_profile/migration.sql
- `Database Seed Script` --calls--> `Prisma Client Singleton`  [EXTRACTED]
  prisma/seed.ts → src/lib/prisma.ts
- `Patient Medical ID Page` --semantically_similar_to--> `Patient Dashboard Page`  [INFERRED] [semantically similar]
  src/app/patient/medical-id/page.tsx → src/app/patient/dashboard/page.tsx

## Hyperedges (group relationships)
- **Database Schema Evolution** — migration_init_schema, migration_add_item_dispensing, migration_add_pharmacy_profile, migration_make_pharmacy_optional [EXTRACTED 1.00]
- **Pharmacy Feature Pages** — page_pharmacy_dashboard, page_pharmacy_dispense, page_pharmacy_records, layout_pharmacy [INFERRED 0.85]
- **Doctor Feature Pages** — page_doctor_dashboard, page_doctor_scan, page_doctor_prescriptions, layout_doctor [INFERRED 0.85]
- **Patient Feature Pages** — layout_patient, page_patient_dashboard, page_patient_medical_id, page_patient_prescriptions [INFERRED 0.85]
- **Authentication Flow** — page_login, api_auth_nextauth, api_auth_register, auth_authoptions, authprovider [EXTRACTED 1.00]
- **Prescription CRUD Pipeline** — api_prescriptions, api_prescriptions_id, prescriptioncard, page_patient_prescriptions [INFERRED 0.85]

## Communities (48 total, 12 thin omitted)

### Community 0 - "Pharmacy Dispensing UI"
Cohesion: 0.13
Nodes (5): handleManualSearch(), handleScan(), handleManualLookup(), handleScan(), lookupPatient()

### Community 1 - "API Routes & Auth Core"
Cohesion: 0.17
Nodes (16): NextAuth Route Handler, Registration API, Patient Lookup API, Prescriptions API (List/Create), Prescription Detail API (Get/Dispense), NextAuth Configuration, NIC-Based Login Strategy, Role Enum (PATIENT, DOCTOR, PHARMACIST) (+8 more)

### Community 3 - "Database Schema & Migrations"
Cohesion: 0.31
Nodes (9): License Number Login Strategy, Add Item Dispensing Migration, Add PharmacyProfile Migration, DoctorProfile Table, Initial Database Schema Migration, PharmacyProfile Table, Prescription Table, PrescriptionItem Table (+1 more)

### Community 4 - "Registration Flow"
Cohesion: 0.43
Nodes (4): handleSubmit(), nextStep(), validatePassword(), validateStep()

### Community 5 - "Brand Identity & Logo"
Cohesion: 0.29
Nodes (7): AyuLink Brand Logo, Medical Cross Element, EKG Heartbeat Line, Connectivity Link Elements, AyuLink Brand Logo (Vector), AyuLink Typography, AyuLink Brand Logo (White)

### Community 6 - "QR Code & Medical ID"
Cohesion: 0.4
Nodes (6): Digital Medical ID Concept, Patient Medical ID Page, QR Code Prescription Flow, QRCodeDisplay Component, QRScanner Component, AyuLink Walkthrough Documentation

### Community 10 - "Dashboard Shell & Navigation"
Cohesion: 0.5
Nodes (4): Pharmacy Profile API, DashboardLayout Component, Patient Route Layout, Sidebar Navigation Component

### Community 13 - "Role-Based Access Control"
Cohesion: 0.67
Nodes (3): Doctor Route Layout, Pharmacy Route Layout, Role-Based Access Control Pattern

## Knowledge Gaps
- **31 isolated node(s):** `PrescriptionStatus Enum`, `Add Item Dispensing Migration`, `Add PharmacyProfile Migration`, `Make Pharmacy Fields Optional`, `NIC-Based Login Strategy` (+26 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Shared UI Utilities` to `Pharmacy Dispensing UI`, `Registration Flow`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `NextAuth Configuration` connect `API Routes & Auth Core` to `Database Schema & Migrations`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `AyuLink Brand Logo` (e.g. with `AyuLink Brand Logo (White)` and `AyuLink Brand Logo (Vector)`) actually correct?**
  _`AyuLink Brand Logo` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `lookupPatient()` (e.g. with `handleScan()` and `handleManualSearch()`) actually correct?**
  _`lookupPatient()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `PrescriptionStatus Enum`, `Add Item Dispensing Migration`, `Add PharmacyProfile Migration` to the rest of the system?**
  _31 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Pharmacy Dispensing UI` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._