// ==============================================
// AyuLink - User Registration API
// POST /api/auth/register
// Creates a new user with hashed password
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

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
        const existingUser = await prisma.user.findUnique({
            where: { nicNumber },
        });

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

            const existingDoctor = await prisma.doctorProfile.findUnique({
                where: { slmcRegNo },
            });
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

            const existingPharmacy = await prisma.pharmacyProfile.findUnique({
                where: { licenseNumber: pharmacyLicense },
            });
            if (existingPharmacy) {
                return NextResponse.json(
                    { error: "This pharmacy license number is already registered" },
                    { status: 409 }
                );
            }
        }

        // --- Create User ---
        const passwordHash = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: {
                nicNumber,
                firstName,
                lastName,
                mobileNumber,
                dob: new Date(dob),
                passwordHash,
                role: role || Role.PATIENT,
                // Create doctor profile if role is DOCTOR
                ...(role === Role.DOCTOR && {
                    doctorProfile: {
                        create: {
                            slmcRegNo,
                            specialization,
                            hospitalName,
                        },
                    },
                }),
                // Create pharmacy profile if role is PHARMACIST
                ...(role === Role.PHARMACIST && {
                    pharmacyProfile: {
                        create: {
                            pharmacyName,
                            licenseNumber: pharmacyLicense,
                            pharmacyAddress,
                        },
                    },
                }),
            },
            include: {
                doctorProfile: true,
                pharmacyProfile: true,
            },
        });

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
