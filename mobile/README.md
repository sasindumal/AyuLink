# AyuLink Mobile Apps

Three React Native (Expo) apps that talk to the AyuLink Next.js API:

| App | Directory | For | Highlights |
|-----|-----------|-----|-----------|
| **AyuLink** | `patient-app/` | Patients | Digital Medical ID QR, prescription history |
| **AyuLink Doctor** | `doctor-app/` | Doctors | QR patient scanning, prescription builder |
| **AyuLink Pharmacy** | `pharmacy-app/` | Pharmacies | QR scanning, per-item dispensing with 15-min undo |

All three share the same design system (brand green palette), auth flow (Bearer
JWT from `POST /api/mobile/login`, stored in SecureStore), and API client.

## Prerequisites

- Node.js 18.17+
- The AyuLink backend running (`npm run dev` in the repo root) with Supabase configured
- **Expo Go** app on your phone (or an iOS simulator / Android emulator)

## Setup (per app)

```bash
cd mobile/patient-app       # or doctor-app / pharmacy-app
npm install
```

**Point the app at your API** — edit `src/lib/config.ts`:

| Where the app runs | API_URL |
|--------------------|---------|
| iOS simulator | `http://localhost:3000` (default) |
| Android emulator | `http://10.0.2.2:3000` |
| Real device (Expo Go) | `http://<your-computer-LAN-IP>:3000` — same Wi-Fi network |

Find your LAN IP with `ipconfig getifaddr en0` (macOS).

## Run

```bash
npm start          # QR code for Expo Go
npm run ios        # iOS simulator
npm run android    # Android emulator
```

If Expo warns about dependency versions, run `npx expo install --fix` inside the app.

## Demo accounts (after seeding via http://localhost:3000/api/seed)

| App | Login | Credential | Password |
|-----|-------|-----------|----------|
| Patient | NIC | `200012345678` | `password123` |
| Doctor | NIC | `199812345678` | `password123` |
| Pharmacy | NIC tab | `199512345678` | `password123` |

Demo patient Medical ID (for manual lookup without a printed QR): `AYU-200012345678`

## Try the full flow

1. **Patient app** — sign in, open the *Medical ID* tab: your QR code.
2. **Doctor app** — sign in, *Scan & Prescribe*, scan the patient's QR (or type the Medical ID), build a prescription, issue it.
3. **Patient app** — pull to refresh: the new prescription appears as *Active*.
4. **Pharmacy app** — sign in, *Dispense*, scan the same QR, dispense items one by one (undo available for 15 minutes).
5. **Patient app** — refresh again: items show as dispensed with the pharmacy's name.

## Notes

- Camera QR scanning (doctor/pharmacy apps) works in Expo Go; grant camera permission when prompted.
- Self-registered doctors/pharmacies start **unverified** — the home screen shows a pending banner, and issuing/dispensing is blocked until `verified = true` is set on their row in the Supabase `User` table.
- The apps use the same rate-limited, validated API as the web app; a lost token simply requires signing in again (tokens last 30 days).
