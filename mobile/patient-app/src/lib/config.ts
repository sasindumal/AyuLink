// ==============================================
// AyuLink Mobile - Configuration
//
// The apps talk DIRECTLY to Supabase — no Next.js
// server needed. Fill in your project's URL and
// anon (public) key from the Supabase Dashboard:
//   Project Settings -> API
//
// The anon key is safe to ship in the app: all data
// access goes through role-checked database functions
// and every table is locked down with RLS.
// ==============================================

export const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
