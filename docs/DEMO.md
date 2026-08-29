# AyuLink — Hands-on demo

Get all four apps onto a phone from one web page, no build required.
The hub is at **`https://ayulink-web.onrender.com/demo/`** — four cards,
each with a QR that opens the real app.

```
frontend/web/public/demo/
├── index.html          the hub (self-contained; static export copies it verbatim)
├── config.json         source of truth — apps, APK URLs, EAS project ids, sample logins
├── qr/                 generated PNGs: eas-<app>.png (primary), apk-<app>.png (fallback)
├── vendor/qrcode.min.js  client-side QR encoder (MIT) — only used in live-tunnel mode
└── links.json          runtime, gitignored — written by scripts/demo-tunnel.js
scripts/
├── gen-demo-qr.js          regenerate qr/*.png from config.json
├── publish-demo-updates.sh publish all four as EAS Updates (the always-on path)
└── demo-tunnel.js          live `expo start --tunnel` for a demo you're running now
render.yaml                  Blueprint: ayulink-api (FastAPI) + ayulink-web (static + hub)
```

---

## 1. Deploy on Render (once)

Push the repo, then in Render: **New + → Blueprint → this repo**. It reads
[`render.yaml`](../render.yaml) and creates:

| Service | What | URL |
|---|---|---|
| `ayulink-api` | FastAPI + the two LangGraph agents | `https://ayulink-api.onrender.com` |
| `ayulink-web` | marketing site **+ `/demo/` hub** | `https://ayulink-web.onrender.com` |

Create an env group **`ayulink-secrets`** (dashboard → Environment → Environment
Groups) and attach it to `ayulink-api` — the keys are listed at the bottom of
`render.yaml` (Supabase URL + keys, `AGENTS_CHECKPOINT_DATABASE_URL`, the LLM
provider, Neo4j). `healthCheckPath` is `/health`.

The four **mobile apps are not hosted on Render** — a phone can't run a Render
process. They talk to `ayulink-api` over its public URL, so they must be
built / served with:

```
EXPO_PUBLIC_AGENT_API_URL=https://ayulink-api.onrender.com
EXPO_PUBLIC_SUPABASE_URL=…
EXPO_PUBLIC_SUPABASE_ANON_KEY=…
```

---

## 2. Primary path — EAS Update, opens in Expo Go

The demo hub's big QR is `exp://u.expo.dev/<easProjectId>?channel-name=preview`.
Expo hosts it; the URL never changes; it opens the **real, full app** in
[Expo Go](https://expo.dev/go). Every dependency in all four apps is in the
Expo Go SDK 54 runtime, so no dev build is needed. (Push notifications degrade
in Expo Go; everything else works.)

**One-time setup** — per app, or just let the publish script tell you what's missing:

```bash
for app in patient-app doctor-app pharmacy-app channeling-center-app; do
  ( cd frontend/mobile/$app && npx expo install expo-updates )   # locks the SDK-correct version
done
npm i -g eas-cli && eas login                                    # your Expo account, once
```

`app.json` already carries `runtimeVersion` + `updates.url`, and each
`eas.json` `preview` profile is linked to a `preview` channel.

**Publish (and re-publish on every change):**

```bash
./scripts/publish-demo-updates.sh "what changed"
node scripts/gen-demo-qr.js            # refresh qr/*.png (URLs are stable, so only needed if config.json changes)
# redeploy ayulink-web (autoDeploy picks up the push)
```

The QR PNGs encode the *stable* `exp://u.expo.dev/…` links, so after the first
`gen-demo-qr.js` you rarely regenerate them — just re-run `publish-demo-updates.sh`
and the same QR now serves the new bundle.

---

## 3. Fallback — Android APK

Every card also shows a small APK QR → the GitHub Release build. Installs a
standalone app, works offline after install, no Expo Go. Android only; rebuild
per change (`eas build -p android --profile apk`). URLs:
`github.com/sasindumal/AyuLink/releases/latest/download/<app>-app.apk`.

---

## 4. Live mode — `expo start --tunnel` (for a demo you're running now)

Not a deployment. Four Metro bundlers + a tunnel each — fine on your laptop
during a demo, not on Render (won't fit a small instance; free tiers sleep;
the URL changes every restart).

```bash
node scripts/demo-tunnel.js                 # all four; writes public/demo/links.json
( cd frontend/web && npm run dev )          # http://localhost:3000/demo/
```

On the hub, switch **Mode → Live dev tunnel**. It reads `links.json` and draws
the current `exp://…exp.direct` QR codes client-side. Ctrl-C removes
`links.json` and the hub falls back to the hosted QRs.

---

## Sample logins

Password is **`password123`** for every seeded account.

| App | Sign in with | Who |
|---|---|---|
| Patient | NIC `200012345678` | Kasun Jayawardena · `AYU-200012345678` |
| Doctor | any seeded doctor's NIC | — |
| Pharmacy | NIC **or** licence no. | any seeded pharmacy |
| Channeling Center | the centre's NIC | any seeded centre |

Full list: `backend/src/agent_workflow/ingestion/demo_credentials.csv` (gitignored;
regenerate with `seed_postgres_dataset.py`). New patients can also self-register
with a fresh 12-digit NIC.

## A full loop to show

1. **Patient** — register (or sign in as `200012345678`), let **Ayu** fill the
   health profile, then **Diagnosis** → describe symptoms → book the doctor it finds.
2. **Doctor** — sign in, **Scan & Prescribe** `AYU-200012345678`, open **Clinical
   History**, pick that appointment, issue a prescription.
3. **Pharmacy** — scan `AYU-200012345678`, dispense an item, try the 15-minute undo.
4. **Channeling Center** — confirm the appointment, later mark the visit complete.
5. **Patient** — the care timeline now reads `DIAGNOSED → … → APPOINTMENT_COMPLETED`.
