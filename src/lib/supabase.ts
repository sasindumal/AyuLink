// ==============================================
// AyuLink - Supabase Client Singleton
// Server-side client using the service role key.
// Never import this from client components.
// ==============================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const globalForSupabase = globalThis as unknown as {
    supabase: SupabaseClient | undefined;
};

function createSupabaseClient(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
        throw new Error(
            "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
        );
    }

    return createClient(url, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}

export const supabase = globalForSupabase.supabase ?? createSupabaseClient();

if (process.env.NODE_ENV !== "production") {
    globalForSupabase.supabase = supabase;
}
