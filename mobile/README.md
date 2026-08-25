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
cd mobile/patient-app       # or doctor-app / pharmacy-app / channeling-center-app
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
python3 knowledge-graph/seed_postgres_dataset.py
supabase db query --linked -f knowledge-graph/seed_postgres_dataset.sql
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
a LangGraph + FastAPI server at [`agents_system/doctor_channeling`](../agents_system/doctor_channeling),
using a local [LM Studio](https://lmstudio.ai) model — not Supabase directly.

**One-time setup:**

1. Root `.env` needs `SUPABASE_ANON_KEY`, `AGENTS_CHECKPOINT_DATABASE_URL` (a
   Supabase **session pooler** connection string — Dashboard → your project →
   Settings → Database → Connection string → "Session pooler", *not*
   "Transaction pooler"), and `NEO4J_*` — see
   [`agents_system/doctor_channeling/.env.example`](../agents_system/doctor_channeling/.env.example)
   for the full list and where each value comes from.
2. Create the venv and install deps:
   ```bash
   cd agents_system/doctor_channeling
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. Open [LM Studio](https://lmstudio.ai), load a model, and start its local
   server (default `http://localhost:1234/v1`). Set `LM_STUDIO_MODEL` in root
   `.env` to that model's exact name (`curl http://localhost:1234/v1/models`
   lists what's loaded). A vision-capable model is optional — without one,
   image-only PDF report pages degrade to "please describe your symptoms"
   instead of failing.

**Run:**

```bash
cd agents_system/doctor_channeling
source .venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

`--host 0.0.0.0` is required, not optional — a physical phone or the iOS
Simulator can't reach a server bound only to `127.0.0.1`. Check it's up with
`curl http://localhost:8000/health` → `{"status":"ok"}`.

Then in `patient-app/src/lib/agentConfig.ts`, set `AGENT_API_URL` to this
machine's **LAN IP** (find it with `ipconfig getifaddr en0` on macOS), not
`localhost` — e.g. `http://192.168.1.23:8000`. Your phone/simulator and this
machine must be on the same Wi-Fi network.

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

## Notes

- Self-registered doctors/pharmacies/channeling centers start **unverified** — a pending banner shows on their home screen, and issuing/dispensing/managing appointments is blocked until `verified = true` is set on their row in the Supabase `User` table (Table Editor). All seeded/bulk-imported demo accounts are pre-verified.
- Camera QR scanning works in Expo Go; grant camera permission when prompted.
- Supabase Auth applies its own sign-in rate limits; failed logins always show a generic "Invalid credentials".
- A doctor's bookable availability (which centers, which days/times) is a separate recurring weekly template (`DoctorSchedule`) from the dated `Appointment` bookings patients make against it. The backend RPCs for a doctor to manage their own schedule already exist (`app_get_my_schedule`, `app_upsert_schedule_slot`, `app_delete_schedule_slot`) but **no doctor-app screen calls them yet** — today, `DoctorSchedule` rows only come from the seed data / bulk `Dataset_ref/` import. This is a known gap, not a missing feature you did something wrong to hit.
