// ==============================================
// AyuLink Mobile - Agent Chat Configuration
//
// The doctor-channeling agent backend (FastAPI +
// LangGraph, see agents_system/doctor_channeling)
// is a SEPARATE server from Supabase. During dev,
// point this at your machine's LAN IP (not
// "localhost" — the simulator/device can't reach
// your laptop's loopback address).
//
// Set EXPO_PUBLIC_AGENT_API_URL in mobile/patient-app/.env
// (see .env.example) — Expo inlines any EXPO_PUBLIC_*
// var into the JS bundle at build/start time, no extra
// config needed. Falls back to the value below if unset.
// ==============================================

export const AGENT_API_URL =
    process.env.EXPO_PUBLIC_AGENT_API_URL ?? "http://172.20.10.4:8000";
