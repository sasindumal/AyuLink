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

export const SUPABASE_URL = "https://yaowhbuafvgjoiovmxuk.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_OvMU-zsPusBLku_yHyPw3g_LBcrks5Y";
