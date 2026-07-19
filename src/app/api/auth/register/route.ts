// ==============================================
// AyuLink - User Registration API
// POST /api/auth/register
// Creates a new user with hashed password.
// Doctors and pharmacists start unverified and
// must be approved before issuing/dispensing.
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { Role } from "@/types/db";
import { registerSchema, firstError } from "@/lib/validation";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Postgres unique constraint -> user-facing 409 message
const UNIQUE_VIOLATIONS: Record<string, string> = {
    User_nicNumber_key: "An account with this NIC number already exists",
    DoctorProfile_slmcRegNo_key: "This SLMC registration number is already registered",
    PharmacyProfile_licenseNumber_key: "This pharmacy license number is already registered",
};

export async function POST(req: NextRequest) {
    try {
        if (!rateLimit(`register:${clientIp(req.headers)}`, 10, 60 * 60 * 1000)) {
            return NextResponse.json(
                { error: "Too many registration attempts. Please try again later" },
                { status: 429 }
            );
        }

        const parsed = registerSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: firstError(parsed) }, { status: 400 });
        }

        const data = parsed.data;
        const passwordHash = await bcrypt.hash(data.password, 12);

        // Atomic user + profile creation (Postgres function)
        const { data: user, error } = await supabase.rpc("create_user_with_profile", {
            p_user: {
                nicNumber: data.nicNumber,
                firstName: data.firstName,
                lastName: data.lastName,
                mobileNumber: data.mobileNumber,
                dob: new Date(data.dob).toISOString(),
                passwordHash,
                role: data.role,
            },
            p_doctor:
                data.role === Role.DOCTOR
                    ? {
                          slmcRegNo: data.slmcRegNo,
                          specialization: data.specialization,
                          hospitalName: data.hospitalName,
                      }
                    : null,
            p_pharmacy:
                data.role === Role.PHARMACIST
                    ? {
                          pharmacyName: data.pharmacyName,
                          licenseNumber: data.pharmacyLicense,
                          pharmacyAddress: data.pharmacyAddress,
                      }
                    : null,
        });

        if (error) {
            // Unique violation -> 409 with a specific message
            if (error.code === "23505") {
                const constraint = Object.keys(UNIQUE_VIOLATIONS).find((name) =>
                    `${error.message} ${error.details ?? ""}`.includes(name)
                );
                return NextResponse.json(
                    { error: constraint ? UNIQUE_VIOLATIONS[constraint] : "Already registered" },
                    { status: 409 }
                );
            }
            throw error;
        }

        const isProvider = data.role === Role.DOCTOR || data.role === Role.PHARMACIST;

        return NextResponse.json(
            {
                message: isProvider
                    ? "Registration successful. Your account is pending verification — you can log in, but issuing or dispensing prescriptions is enabled once your credentials are approved."
                    : "Registration successful",
                user: {
                    id: user.id,
                    nicNumber: user.nicNumber,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    medicalId: user.medicalId,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Registration error:", error);
        return NextResponse.json(
            { error: "An error occurred during registration" },
            { status: 500 }
        );
    }
}
