// ==============================================
// AyuLink - Credential Verification
// Passwords live in Supabase Auth (GoTrue); users
// sign in with a synthetic email derived from the
// NIC. Shared by NextAuth (web) and /api/mobile/login.
// All failures throw the same generic error to
// prevent user enumeration.
// ==============================================

import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Role } from "@/types/db";

export const INVALID_CREDENTIALS = "Invalid credentials";

/** The synthetic Supabase Auth email for an NIC. */
export function nicToEmail(nicNumber: string): string {
    return `${nicNumber.trim().toLowerCase()}@nic.ayulink.app`;
}

export interface AuthUser {
    id: string;
    nicNumber: string;
    firstName: string;
    lastName: string;
    role: Role;
    medicalId: string;
    /** Present on fresh logins; providers need approval before issuing/dispensing */
    verified?: boolean;
}

// A throwaway client per login attempt: signInWithPassword stores the
// user session on the client it runs on, which must never leak into
// the shared service-role singleton used for data access.
function authClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.SUPABASE_SERVICE_ROLE_KEY as string,
        { auth: { persistSession: false, autoRefreshToken: false } }
    );
}

export async function verifyCredentials(
    nicNumber: string | undefined,
    licenseNumber: string | undefined,
    password: string
): Promise<AuthUser> {
    let nic = nicNumber?.trim();

    if (licenseNumber) {
        // Pharmacy login: resolve license number -> owner's NIC
        const { data: pharmacyProfile } = await supabase
            .from("PharmacyProfile")
            .select("user:User(nicNumber)")
            .eq("licenseNumber", licenseNumber.trim())
            .maybeSingle();
        nic = (pharmacyProfile?.user as { nicNumber?: string } | null)?.nicNumber;
    }

    if (!nic) {
        throw new Error(INVALID_CREDENTIALS);
    }

    const { data: authData, error: authError } = await authClient().auth.signInWithPassword({
        email: nicToEmail(nic),
        password,
    });

    if (authError || !authData.user) {
        throw new Error(INVALID_CREDENTIALS);
    }

    const { data: user } = await supabase
        .from("User")
        .select("*")
        .eq("id", authData.user.id)
        .maybeSingle();

    if (!user) {
        throw new Error(INVALID_CREDENTIALS);
    }

    return {
        id: user.id,
        nicNumber: user.nicNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        medicalId: user.medicalId,
        verified: user.verified,
    };
}
