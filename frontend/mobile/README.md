# AyuLink Mobile Apps

Four React Native (Expo) apps that talk **directly to Supabase** — no Next.js server needed. Each app is fully standalone:

| App | Directory | For | Highlights |
|-----|-----------|-----|-----------|
| **AyuLink** | `patient-app/` | Patients | Digital Medical ID QR, prescription history, find & book appointments (by specialty/city/rating/soonest, by doctor, or by channeling center), and an AI **Assistant** tab for symptom triage, doctor search, and booking via chat |
| **AyuLink Doctor** | `doctor-app/` | Doctors | QR patient scanning, prescription builder |
| **AyuLink Pharmacy** | `pharmacy-app/` | Pharmacies | QR scanning, per-item dispensing with 15-min undo |
| **AyuLink Channeling Center** | `channeling-center-app/` | Channeling centers | Manage appointments booked at the center — confirm, reschedule, cancel, mark complete |

## How it works

- **Auth**: Supabase Auth. The NIC maps to a synthetic email (`<nic>@nic.ayulink.app`) behind the scenes — users only ever see NIC (or pharmacy license) + password. Sessions persist across app restarts.
- **Data**: every read/write calls a role-checked database function (`app_*`) via `supabase.rpc()`. All tables are locked with RLS, so the anon key shipped in the app can't touch data directly — permissions are enforced inside Postgres.
- **Push notifications** (patient app + channeling-center app): a Postgres trigger on `Appointment` calls Expo's push API directly whenever a booking is created, rescheduled, or cancelled — there's no notification server to run. Real on-device delivery needs an EAS project (`eas init`) per app and a custom dev-client build; Expo Go has not supported remote push since SDK 53.
- The Next.js web app is optional and shares the same database and accounts.

## One-time Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Run the three migrations, **in order**, in the **SQL Editor** (or `supabase db push`):
   [`20260719000000_init.sql`](../supabase/migrations/20260719000000_init.sql) →
   [`20260822000000_appointments.sql`](../supabase/migrations/20260822000000_appointments.sql) →
   [`20260822010000_city_and_browse.sql`](../supabase/migrations/20260822010000_city_and_browse.sql)
   - **Already ran an older AyuLink schema?** Reset first: paste
     [`supabase/reset.sql`](../supabase/reset.sql) into the SQL Editor and run it
     (⚠️ deletes all AyuLink data and logins), then run all three migrations.
3. **Disable email confirmation**: Dashboard → **Authentication → Sign In / Up → Email** → turn off **"Confirm email"**. (The synthetic NIC emails can't receive mail; sign-ups fail without this.)
4. From **Project Settings → API**, copy the **Project URL** and **anon public key**.
5. Seed demo data — see [Demo accounts](#demo-accounts) below.

## Per-app setup

```bash
cd frontend/mobile/patient-app       # or doctor-app / pharmacy-app / channeling-center-app
npm install --legacy-peer-deps
```

Edit `src/lib/config.ts` and paste your values:

```ts
export const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
export const SUPABASE_ANON_KEY = "eyJ...";
```

> The anon key is designed to be shipped in clients — it's not a secret the way
> the service role key is. Never put the service role key in an app.

## Run

```bash
npm start          # QR code for Expo Go
npm run ios        # iOS simulator
npm run android    # Android emulator
```

No backend to start — the apps work anywhere with internet access. **Exception:** the patient app's *Assistant* tab talks to a separate local server — see [Assistant backend](#assistant-backend-patient-app-only) below.

## Demo accounts

Seed demo data **without any server**, in order (each is idempotent — safe to re-run):

```bash
supabase db query --linked -f supabase/seed.sql                # patient, doctor, pharmacist, 2 prescriptions
supabase db query --linked -f supabase/seed_appointments.sql   # 2 channeling centers, schedules, 1 booking

# Recommended: bulk-import Dataset_ref/ for 90 real doctors + 53 real channeling centers
python3 backend/src/agent_workflow/ingestion/seed_postgres_dataset.py
supabase db query --linked -f backend/src/agent_workflow/ingestion/seed_postgres_dataset.sql
```

(No Supabase CLI? Paste each `.sql` file into the Supabase **SQL Editor** instead — same effect.) Full details, including how to wipe and start over: [docs/README.md § Database Management](../docs/README.md#8-database-management).

| App | Login | Credential | Password |
|-----|-------|-----------|----------|
| Patient | NIC | `200012345678` | `password123` |
| Doctor | NIC | `199812345678` | `password123` |
| Pharmacy | License `PL-2024-001` or NIC `199512345678` | — | `password123` |
| Channeling Center | NIC | `199012345678` (Colombo) / `199112345678` (Kandy) | `password123` |

Demo patient Medical ID (for manual lookup without a printed QR): `AYU-200012345678`

Ran the bulk import? You also get 90 real doctor logins and 53 real channeling-center logins (same password, synthetic NICs) — find one via the Supabase Table Editor (`DoctorProfile` / `ChannelingCenter` → linked `User.nicNumber`).

## Assistant backend (patient app only)

The patient app's *Assistant* tab is a chat front-door (general Q&A, symptom
triage against a Neo4j knowledge graph, doctor search, and booking) backed by
a LangGraph + FastAPI server at [`backend/`](../../backend), using either a
local [LM Studio](https://lmstudio.ai) model or Google AI Studio (Gemini) —
not Supabase directly.

Full setup, running, seeding, and troubleshooting: **[backend/README.md](../../backend/README.md)**.

## Try the full flow

**Prescriptions:**
1. **Patient app** — register or sign in; open the *Medical ID* tab: your QR code.
2. **Doctor app** — sign in, *Scan & Prescribe*, scan the patient's QR (or type the Medical ID), build a prescription, issue it.
3. **Patient app** — pull to refresh: the new prescription appears as *Active*.
4. **Pharmacy app** — sign in, *Dispense*, scan the same QR, dispense items one by one (undo available for 15 minutes).
5. **Patient app** — refresh again: items show as dispensed with the pharmacy's name.

**Appointments:**
1. **Patient app** — open the *Appointments* tab. Try any of the three discovery modes: **Quick Search** (filter by specialty/city/rating, sorted soonest/nearest/rating), **By Doctor** (search doctors, pick one, see every slot they hold over the next 14 days), or **By Center** (browse channeling centers, pick one, see every doctor available there).
2. Pick a slot and book it — you'll get back an order number (`APT-000123`).
3. **Channeling Center app** — sign in as the matching center, open *Appointments*: the new booking is there. Mark it complete or cancel it.
4. **Patient app** — under *My Appointments*, reschedule or cancel from your side too; either side's action updates instantly for the other.

## Building & releasing APKs

All 4 apps are linked to EAS projects (`@orton.com/ayulink-*`, see each
app's `eas.json` / `app.json`) and built as APKs by
[`.github/workflows/build-mobile-apps.yml`](../../.github/workflows/build-mobile-apps.yml)
— not locally. The workflow builds all 4 apps on EAS, then publishes them
to a GitHub Release with **fixed filenames**, so the download links never
change between releases:

| App | Download URL |
|---|---|
| Patient | `https://github.com/sasindumal/AyuLink/releases/latest/download/patient-app.apk` |
| Doctor | `https://github.com/sasindumal/AyuLink/releases/latest/download/doctor-app.apk` |
| Pharmacy | `https://github.com/sasindumal/AyuLink/releases/latest/download/pharmacy-app.apk` |
| Channeling Center | `https://github.com/sasindumal/AyuLink/releases/latest/download/channeling-center-app.apk` |

These are the same links the marketing website's *Get the app* section
uses ([`frontend/web/src/app/page.tsx`](../web/src/app/page.tsx)), so a
new release needs no website change — only the file behind the link
updates.

### One-time setup (already done for this repo)

- `npx eas-cli login`, then `npx eas-cli init --account orton.com` in each
  app directory — links the app to an EAS project (writes
  `extra.eas.projectId` into `app.json`).
- A GitHub repository secret **`EXPO_TOKEN`** — an Expo personal access
  token from
  [expo.dev/accounts/orton.com/settings/access-tokens](https://expo.dev/accounts/orton.com/settings/access-tokens),
  added under repo **Settings → Secrets and variables → Actions**. Without
  this the workflow runs but fails at the build step.

### Cutting a new release

The workflow triggers on **a pushed version tag** or **manual dispatch**
only — never on every push, to stay inside EAS's free-tier build minutes.

```bash
# 1. Land your changes as normal
git add -A
git commit -m "..."
git push

# 2. Note what changed — move the bullets from "Unreleased" into a new
#    version heading in CHANGELOG.md (see the template comment in that file)

# 3. Tag the release. Use an ANNOTATED tag (-a -m) — unlike a plain tag,
#    it records who tagged it, when, and why, which is what makes
#    `git tag -n99` below actually useful later.
git tag -a v1.0.1 -m "Short summary of this release"
git push origin v1.0.1
```

Pushing the tag fires the workflow — watch it under the repo's **Actions**
tab. When it finishes, all 4 APKs are attached to a new GitHub Release
(named after the tag) and immediately live at the stable URLs above.

**No version tag yet, just want to test the pipeline or ship an ad hoc
build?** Use manual dispatch instead: Actions tab → *Build Mobile Apps* →
**Run workflow**. This publishes a release tagged `manual-<run number>`
and still becomes the new "latest" — no commit or tag needed on your end.

### Keeping a record of previous versions

Three places, in order of convenience:

1. **[`CHANGELOG.md`](../../CHANGELOG.md)** at the repo root — one
   short entry per version, sitting next to the code. Fastest to read.
2. **`git tag -n99`** — lists every annotated tag with its full message,
   locally, no GitHub round-trip:
   ```bash
   git tag -n99 "v*"
   ```
3. **GitHub's [Releases page](https://github.com/sasindumal/AyuLink/releases)**
   — the permanent, authoritative record. Every past release (and its 4
   APK files) stays there forever; publishing a new one only moves which
   release is "latest," it never deletes an older one. Use this when you
   need the actual APK from an old version, not just what changed.

## Notes

- Self-registered doctors/pharmacies/channeling centers start **unverified** — a pending banner shows on their home screen, and issuing/dispensing/managing appointments is blocked until `verified = true` is set on their row in the Supabase `User` table (Table Editor). All seeded/bulk-imported demo accounts are pre-verified.
- Camera QR scanning works in Expo Go; grant camera permission when prompted.
- Supabase Auth applies its own sign-in rate limits; failed logins always show a generic "Invalid credentials".
- A doctor's bookable availability (which centers, which days/times) is a separate recurring weekly template (`DoctorSchedule`) from the dated `Appointment` bookings patients make against it. The backend RPCs for a doctor to manage their own schedule already exist (`app_get_my_schedule`, `app_upsert_schedule_slot`, `app_delete_schedule_slot`) but **no doctor-app screen calls them yet** — today, `DoctorSchedule` rows only come from the seed data / bulk `Dataset_ref/` import. This is a known gap, not a missing feature you did something wrong to hit.
