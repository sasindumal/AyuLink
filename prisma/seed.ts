// ==============================================
// AyuLink - Database Seed Script
// Creates demo accounts and sample prescriptions
// Run: npx prisma db seed
// ==============================================

import { PrismaClient, Role, PrescriptionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Seeding AyuLink database...\n");

    const passwordHash = await bcrypt.hash("password123", 12);

    // ───────────────────────────────────────────────
    // 1. Demo Patient - Sasindu Malhara
    // ───────────────────────────────────────────────
    const patient = await prisma.user.upsert({
        where: { nicNumber: "200012345678" },
        update: {},
        create: {
            nicNumber: "200012345678",
            firstName: "Sasindu",
            lastName: "Malhara",
            mobileNumber: "0771234567",
            dob: new Date("2000-05-15"),
            passwordHash,
            role: Role.PATIENT,
            medicalId: "med-patient-demo-001",
        },
    });
    console.log(`✅ Patient created: ${patient.firstName} ${patient.lastName} (NIC: ${patient.nicNumber})`);

    // ───────────────────────────────────────────────
    // 2. Demo Doctor - Dr. Amal Perera
    // ───────────────────────────────────────────────
    const doctor = await prisma.user.upsert({
        where: { nicNumber: "199812345678" },
        update: {},
        create: {
            nicNumber: "199812345678",
            firstName: "Amal",
            lastName: "Perera",
            mobileNumber: "0779876543",
            dob: new Date("1998-03-22"),
            passwordHash,
            role: Role.DOCTOR,
            medicalId: "med-doctor-demo-001",
            doctorProfile: {
                create: {
                    slmcRegNo: "SLMC-12345",
                    specialization: "Cardiology",
                    hospitalName: "National Hospital Colombo",
                },
            },
        },
        include: { doctorProfile: true },
    });
    console.log(`✅ Doctor created: Dr. ${doctor.firstName} ${doctor.lastName} (NIC: ${doctor.nicNumber})`);

    // ───────────────────────────────────────────────
    // 3. Demo Pharmacist - Nimal Fernando
    // ───────────────────────────────────────────────
    const pharmacist = await prisma.user.upsert({
        where: { nicNumber: "199512345678" },
        update: {},
        create: {
            nicNumber: "199512345678",
            firstName: "Nimal",
            lastName: "Fernando",
            mobileNumber: "0765551234",
            dob: new Date("1995-11-08"),
            passwordHash,
            role: Role.PHARMACIST,
            medicalId: "med-pharmacist-demo-001",
            pharmacyProfile: {
                create: {
                    pharmacyName: "MediCare Pharmacy",
                    licenseNumber: "PL-2024-001234",
                    pharmacyAddress: "45 Galle Road, Colombo 03",
                },
            },
        },
        include: { pharmacyProfile: true },
    });
    console.log(`✅ Pharmacist created: ${pharmacist.firstName} ${pharmacist.lastName} — ${(pharmacist as any).pharmacyProfile?.pharmacyName} (NIC: ${pharmacist.nicNumber})`);

    // ───────────────────────────────────────────────
    // 4. Sample Prescriptions
    // ───────────────────────────────────────────────
    const existingRx = await prisma.prescription.findFirst({
        where: { patientId: patient.id, doctorId: doctor.id },
    });

    if (!existingRx) {
        // Prescription 1: Active - Upper Respiratory Tract Infection
        const rx1 = await prisma.prescription.create({
            data: {
                patientId: patient.id,
                doctorId: doctor.id,
                diagnosis: "Upper Respiratory Tract Infection",
                status: PrescriptionStatus.ACTIVE,
                dateIssued: new Date(),
                items: {
                    create: [
                        {
                            drugName: "Amoxicillin 500mg",
                            dosage: "1 capsule",
                            frequency: "Three times daily",
                            duration: "7 days",
                            instructions: "Take after meals with a full glass of water",
                        },
                        {
                            drugName: "Paracetamol 500mg",
                            dosage: "1–2 tablets",
                            frequency: "Every 6 hours",
                            duration: "5 days",
                            instructions: "Take as needed for fever or pain. Do not exceed 8 tablets/day",
                        },
                        {
                            drugName: "Cetirizine 10mg",
                            dosage: "1 tablet",
                            frequency: "Once daily",
                            duration: "5 days",
                            instructions: "Take at bedtime. May cause drowsiness",
                        },
                    ],
                },
            },
        });
        console.log(`✅ Prescription 1 (ACTIVE) created: ${rx1.diagnosis} — Rx #${rx1.id.slice(0, 8).toUpperCase()}`);

        // Prescription 2: Dispensed - Hypertension Management
        const rx2 = await prisma.prescription.create({
            data: {
                patientId: patient.id,
                doctorId: doctor.id,
                diagnosis: "Hypertension Management",
                status: PrescriptionStatus.DISPENSED,
                dateIssued: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                items: {
                    create: [
                        {
                            drugName: "Amlodipine 5mg",
                            dosage: "1 tablet",
                            frequency: "Once daily",
                            duration: "30 days",
                            instructions: "Take in the morning. Monitor blood pressure regularly",
                            dispensed: true,
                            dispensedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
                            dispensedById: pharmacist.id,
                        },
                        {
                            drugName: "Losartan 50mg",
                            dosage: "1 tablet",
                            frequency: "Once daily",
                            duration: "30 days",
                            instructions: "Take in the evening. Avoid potassium supplements",
                            dispensed: true,
                            dispensedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
                            dispensedById: pharmacist.id,
                        },
                    ],
                },
            },
        });
        console.log(`✅ Prescription 2 (DISPENSED) created: ${rx2.diagnosis} — Rx #${rx2.id.slice(0, 8).toUpperCase()}`);
    } else {
        console.log("⏭️  Sample prescriptions already exist — skipping");
    }

    console.log("\n────────────────────────────────────────────");
    console.log("🎉 Seed complete! Demo login credentials:\n");
    console.log("  👤 Patient:    NIC 200012345678  /  password123");
    console.log("  🩺 Doctor:     NIC 199812345678  /  password123");
    console.log("  💊 Pharmacist: NIC 199512345678  /  password123");
    console.log("────────────────────────────────────────────\n");
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
