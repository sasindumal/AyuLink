// ==============================================
// AyuLink Mobile - Data Access
// All reads/writes go through role-checked
// database functions (supabase.rpc).
// ==============================================

import { supabase } from "./supabase";

export class ApiError extends Error {}

function friendlyMessage(message: string): string {
    if (/Failed to fetch|Network request failed|fetch failed/i.test(message)) {
        return "Cannot reach Supabase. Check your connection and the keys in src/lib/config.ts.";
    }
    return message;
}

export async function rpc<T>(
    fn: string,
    args?: Record<string, unknown>
): Promise<T> {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
        throw new ApiError(friendlyMessage(error.message));
    }
    return data as T;
}
