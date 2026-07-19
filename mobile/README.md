# AyuLink Mobile Apps

Three React Native (Expo) apps that talk **directly to Supabase** — no Next.js server needed. Each app is fully standalone:

| App | Directory | For | Highlights |
|-----|-----------|-----|-----------|
| **AyuLink** | `patient-app/` | Patients | Digital Medical ID QR, prescription history |
| **AyuLink Doctor** | `doctor-app/` | Doctors | QR patient scanning, prescription builder |
| **AyuLink Pharmacy** | `pharmacy-app/` | Pharmacies | QR scanning, per-item dispensing with 15-min undo |

## How it works

- **Auth**: Supabase Auth. The NIC maps to a synthetic email (`<nic>@nic.ayulink.app`) behind the scenes — users only ever see NIC (or pharmacy license) + password. Sessions persist across app restarts.
- **Data**: every read/write calls a role-checked database function (`app_*`) via `supabase.rpc()`. All tables are locked with RLS, so the anon key shipped in the app can't touch data directly — permissions are enforced inside Postgres.
- The Next.js web app is optional and shares the same database and accounts.

## One-time Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. Run [`supabase/migrations/20260719000000_init.sql`](../supabase/migrations/20260719000000_init.sql) in the **SQL Editor** (or `supabase db push`).
3. **Disable email confirmation**: Dashboard → **Authentication → Sign In / Up → Email** → turn off **"Confirm email"**. (The synthetic NIC emails can't receive mail; sign-ups fail without this.)
4. From **Project Settings → API**, copy the **Project URL** and **anon public key**.

## Per-app setup

```bash
cd mobile/patient-app       # or doctor-app / pharmacy-app
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

No backend to start — the apps work anywhere with internet access.

## Demo accounts

Seed demo data either by visiting `/api/seed` on the web app once, or simply register fresh accounts from the apps themselves. Demo credentials after seeding:

| App | Login | Credential | Password |
|-----|-------|-----------|----------|
| Patient | NIC | `200012345678` | `password123` |
| Doctor | NIC | `199812345678` | `password123` |
| Pharmacy | NIC tab | `199512345678` | `password123` |

Demo patient Medical ID (for manual lookup without a printed QR): `AYU-200012345678`

## Try the full flow

1. **Patient app** — register or sign in; open the *Medical ID* tab: your QR code.
2. **Doctor app** — sign in, *Scan & Prescribe*, scan the patient's QR (or type the Medical ID), build a prescription, issue it.
3. **Patient app** — pull to refresh: the new prescription appears as *Active*.
4. **Pharmacy app** — sign in, *Dispense*, scan the same QR, dispense items one by one (undo available for 15 minutes).
5. **Patient app** — refresh again: items show as dispensed with the pharmacy's name.

## Notes

- Self-registered doctors/pharmacies start **unverified** — a pending banner shows on their home screen, and issuing/dispensing is blocked until `verified = true` is set on their row in the Supabase `User` table (Table Editor).
- Camera QR scanning works in Expo Go; grant camera permission when prompted.
- Supabase Auth applies its own sign-in rate limits; failed logins always show a generic "Invalid credentials".
