// ==============================================
// AyuLink - Seed API Route (Development Only)
// GET /api/seed - Seeds the database with demo data
// ==============================================

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { Role, PrescriptionStatus } from "@/types/db";

// Insert the user if the NIC isn't registered yet, then return the row
async function upsertUser(user: {
    nicNumber: string;
    firstName: string;
    lastName: string;
    mobileNumber: string;
    dob: string;
    passwordHash: string;
    role: Role;
    medicalId: string;
    verified: boolean;
}) {
    const { data: existing } = await supabase
        .from("User")
        .select("*")
        .eq("nicNumber", user.nicNumber)
        .maybeSingle();

    if (existing) return existing;

    const { data: created, error } = await supabase
        .from("User")
        .insert(user)
        .select()
        .single();

    if (error || !created) {
        throw error ?? new Error(`Failed to create user ${user.nicNumber}`);
    }
    return created;
}

export async function GET() {
    // Block in production
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
            { error: "Seeding is disabled in production" },
            { status: 403 }
        );
    }

    try {
        const passwordHash = await bcrypt.hash("password123", 12);

        // 1. Demo Patient
        const patient = await upsertUser({
            nicNumber: "200012345678",
            firstName: "Sasindu",
            lastName: "Malhara",
            mobileNumber: "0771234567",
            dob: new Date("2000-05-15").toISOString(),
            passwordHash,
            role: Role.PATIENT,
            medicalId: "med-patient-demo-001",
            verified: true,
        });

        // 2. Demo Doctor
        const doctor = await upsertUser({
            nicNumber: "199812345678",
            firstName: "Amal",
            lastName: "Perera",
            mobileNumber: "0779876543",
            dob: new Date("1998-03-22").toISOString(),
            passwordHash,
            role: Role.DOCTOR,
            medicalId: "med-doctor-demo-001",
            verified: true,
        });

        const { data: doctorProfile } = await supabase
            .from("DoctorProfile")
            .select("id")
            .eq("userId", doctor.id)
            .maybeSingle();

        if (!doctorProfile) {
            const { error } = await supabase.from("DoctorProfile").insert({
                userId: doctor.id,
                slmcRegNo: "SLMC-12345",
                specialization: "Cardiology",
                hospitalName: "National Hospital Colombo",
            });
            if (error) throw error;
        }

        // 3. Demo Pharmacist
        const pharmacist = await upsertUser({
            nicNumber: "199512345678",
            firstName: "Nimal",
            lastName: "Fernando",
            mobileNumber: "0765551234",
            dob: new Date("1995-11-08").toISOString(),
            passwordHash,
            role: Role.PHARMACIST,
            medicalId: "med-pharmacist-demo-001",
            verified: true,
        });

        // 4. Sample Prescriptions (skip if already exist)
        const { data: existingRx } = await supabase
            .from("Prescription")
            .select("id")
            .eq("patientId", patient.id)
            .eq("doctorId", doctor.id)
            .limit(1)
            .maybeSingle();

        let prescriptionsCreated = 0;
        if (!existingRx) {
            const { data: rx1, error: rx1Error } = await supabase
                .from("Prescription")
                .insert({
                    patientId: patient.id,
                    doctorId: doctor.id,
                    diagnosis: "Upper Respiratory Tract Infection",
                    status: PrescriptionStatus.NOT_DISPENSED,
                })
                .select()
                .single();
            if (rx1Error || !rx1) throw rx1Error ?? new Error("Failed to create prescription");

            const { error: items1Error } = await supabase.from("PrescriptionItem").insert([
                {
                    prescriptionId: rx1.id,
                    drugName: "Amoxicillin 500mg",
                    dosage: "1 capsule",
                    frequency: "Three times daily",
                    duration: "7 days",
                    instructions: "Take after meals with a full glass of water",
                },
                {
                    prescriptionId: rx1.id,
                    drugName: "Paracetamol 500mg",
                    dosage: "1–2 tablets",
                    frequency: "Every 6 hours",
                    duration: "5 days",
                    instructions: "Take as needed for fever or pain",
                },
                {
                    prescriptionId: rx1.id,
                    drugName: "Cetirizine 10mg",
                    dosage: "1 tablet",
                    frequency: "Once daily",
                    duration: "5 days",
                    instructions: "Take at bedtime. May cause drowsiness",
                },
            ]);
            if (items1Error) throw items1Error;

            const { data: rx2, error: rx2Error } = await supabase
                .from("Prescription")
                .insert({
                    patientId: patient.id,
                    doctorId: doctor.id,
                    diagnosis: "Hypertension Management",
                    status: PrescriptionStatus.FULLY_DISPENSED,
                    dateIssued: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                })
                .select()
                .single();
            if (rx2Error || !rx2) throw rx2Error ?? new Error("Failed to create prescription");

            const { error: items2Error } = await supabase.from("PrescriptionItem").insert([
                {
                    prescriptionId: rx2.id,
                    drugName: "Amlodipine 5mg",
                    dosage: "1 tablet",
                    frequency: "Once daily",
                    duration: "30 days",
                    instructions: "Take in the morning. Monitor blood pressure regularly",
                },
                {
                    prescriptionId: rx2.id,
                    drugName: "Losartan 50mg",
                    dosage: "1 tablet",
                    frequency: "Once daily",
                    duration: "30 days",
                    instructions: "Take in the evening. Avoid potassium supplements",
                },
            ]);
            if (items2Error) throw items2Error;

            prescriptionsCreated = 2;
        }

        return NextResponse.json({
            success: true,
            message: "Database seeded successfully!",
            accounts: {
                patient: { nic: "200012345678", name: `${patient.firstName} ${patient.lastName}`, medicalId: patient.medicalId },
                doctor: { nic: "199812345678", name: `Dr. ${doctor.firstName} ${doctor.lastName}`, medicalId: doctor.medicalId },
                pharmacist: { nic: "199512345678", name: `${pharmacist.firstName} ${pharmacist.lastName}`, medicalId: pharmacist.medicalId },
            },
            prescriptionsCreated,
            password: "password123",
        });
    } catch (error) {
        console.error("Seed error:", error);
        return NextResponse.json(
            { error: "Failed to seed database", details: String(error) },
            { status: 500 }
        );
    }
}
