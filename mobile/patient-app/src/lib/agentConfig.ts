// ==============================================
// AyuLink Mobile - Agent Chat Configuration
//
// The doctor-channeling agent backend (FastAPI +
// LangGraph, see agents_system/doctor_channeling)
// is a SEPARATE server from Supabase. During dev,
// point this at your machine's LAN IP (not
// "localhost" — the simulator/device can't reach
// your laptop's loopback address).
// ==============================================

export const AGENT_API_URL = "http://192.168.8.194:8000";
