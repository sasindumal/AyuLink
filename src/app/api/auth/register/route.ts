// ==============================================
// AyuLink - User Registration API
// POST /api/auth/register
// Creates a new user with hashed password
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { Role } from "@/types/db";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            nicNumber,
            firstName,
            lastName,
            mobileNumber,
            dob,
            password,
            role,
            // Doctor-specific fields
            slmcRegNo,
            specialization,
            hospitalName,
            // Pharmacist-specific fields
            pharmacyName,
            pharmacyLicense,
            pharmacyAddress,
        } = body;

        // --- Validation ---
        if (!nicNumber || !firstName || !lastName || !mobileNumber || !dob || !password) {
            return NextResponse.json(
                { error: "All required fields must be provided" },
                { status: 400 }
            );
        }

        // Check if NIC already registered
        const { data: existingUser } = await supabase
            .from("User")
            .select("id")
            .eq("nicNumber", nicNumber)
            .maybeSingle();

        if (existingUser) {
            return NextResponse.json(
                { error: "An account with this NIC number already exists" },
                { status: 409 }
            );
        }

        // Validate doctor-specific fields
        if (role === Role.DOCTOR) {
            if (!slmcRegNo || !specialization || !hospitalName) {
                return NextResponse.json(
                    { error: "Doctor registration requires SLMC number, specialization, and hospital name" },
                    { status: 400 }
                );
            }

            const { data: existingDoctor } = await supabase
                .from("DoctorProfile")
                .select("id")
                .eq("slmcRegNo", slmcRegNo)
                .maybeSingle();
            if (existingDoctor) {
                return NextResponse.json(
                    { error: "This SLMC registration number is already registered" },
                    { status: 409 }
                );
            }
        }

        // Validate pharmacist-specific fields
        if (role === Role.PHARMACIST) {
            if (!pharmacyName || !pharmacyLicense || !pharmacyAddress) {
                return NextResponse.json(
                    { error: "Pharmacist registration requires pharmacy name, license number, and address" },
                    { status: 400 }
                );
            }

            const { data: existingPharmacy } = await supabase
                .from("PharmacyProfile")
                .select("id")
                .eq("licenseNumber", pharmacyLicense)
                .maybeSingle();
            if (existingPharmacy) {
                return NextResponse.json(
                    { error: "This pharmacy license number is already registered" },
                    { status: 409 }
                );
            }
        }

        // --- Create User ---
        const passwordHash = await bcrypt.hash(password, 12);

        const { data: user, error: userError } = await supabase
            .from("User")
            .insert({
                nicNumber,
                firstName,
                lastName,
                mobileNumber,
                dob: new Date(dob).toISOString(),
                passwordHash,
                role: role || Role.PATIENT,
            })
            .select()
            .single();

        if (userError || !user) {
            throw userError ?? new Error("Failed to create user");
        }

        // Create role-specific profile; roll back the user if it fails
        if (role === Role.DOCTOR) {
            const { error: profileError } = await supabase
                .from("DoctorProfile")
                .insert({
                    userId: user.id,
                    slmcRegNo,
                    specialization,
                    hospitalName,
                });

            if (profileError) {
                await supabase.from("User").delete().eq("id", user.id);
                throw profileError;
            }
        } else if (role === Role.PHARMACIST) {
            const { error: profileError } = await supabase
                .from("PharmacyProfile")
                .insert({
                    userId: user.id,
                    pharmacyName,
                    licenseNumber: pharmacyLicense,
                    pharmacyAddress,
                });

            if (profileError) {
                await supabase.from("User").delete().eq("id", user.id);
                throw profileError;
            }
        }

        // Return user without sensitive data
        return NextResponse.json(
            {
                message: "Registration successful",
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
