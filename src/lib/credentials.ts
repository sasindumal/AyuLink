// ==============================================
// AyuLink - Credential Verification
// Shared by NextAuth (web) and /api/mobile/login
// (mobile apps). All failures throw the same
// generic error to prevent user enumeration.
// ==============================================

import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { Role } from "@/types/db";

export const INVALID_CREDENTIALS = "Invalid credentials";

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

export async function verifyCredentials(
    nicNumber: string | undefined,
    licenseNumber: string | undefined,
    password: string
): Promise<AuthUser> {
    let user;

    if (licenseNumber) {
        // Pharmacy login via license number
        const { data: pharmacyProfile } = await supabase
            .from("PharmacyProfile")
            .select("*, user:User(*)")
            .eq("licenseNumber", licenseNumber)
            .maybeSingle();

        if (!pharmacyProfile?.user) {
            throw new Error(INVALID_CREDENTIALS);
        }
        user = pharmacyProfile.user;
    } else {
        // Patient / Doctor login via NIC
        const { data } = await supabase
            .from("User")
            .select("*")
            .eq("nicNumber", nicNumber)
            .maybeSingle();

        if (!data) {
            throw new Error(INVALID_CREDENTIALS);
        }
        user = data;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
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
