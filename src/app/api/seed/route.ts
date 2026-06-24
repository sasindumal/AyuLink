// ==============================================
// AyuLink - Seed API Route (Development Only)
// GET /api/seed - Seeds the database with demo data
// ==============================================

import { NextResponse } from "next/server";
import { PrismaClient, Role, PrescriptionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

export async function GET() {
    // Block in production
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
            { error: "Seeding is disabled in production" },
            { status: 403 }
        );
    }

    const prisma = new PrismaClient();

    try {
        const passwordHash = await bcrypt.hash("password123", 12);

        // 1. Demo Patient
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

        // 2. Demo Doctor
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

        // 3. Demo Pharmacist
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
            },
        });

        // 4. Sample Prescriptions (skip if already exist)
        const existingRx = await prisma.prescription.findFirst({
            where: { patientId: patient.id, doctorId: doctor.id },
        });

        let prescriptionsCreated = 0;
        if (!existingRx) {
            await prisma.prescription.create({
                data: {
                    patientId: patient.id,
                    doctorId: doctor.id,
                    diagnosis: "Upper Respiratory Tract Infection",
                    status: PrescriptionStatus.NOT_DISPENSED,
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
                                instructions: "Take as needed for fever or pain",
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

            await prisma.prescription.create({
                data: {
                    patientId: patient.id,
                    doctorId: doctor.id,
                    diagnosis: "Hypertension Management",
                    status: PrescriptionStatus.FULLY_DISPENSED,
                    dateIssued: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    items: {
                        create: [
                            {
                                drugName: "Amlodipine 5mg",
                                dosage: "1 tablet",
                                frequency: "Once daily",
                                duration: "30 days",
                                instructions: "Take in the morning. Monitor blood pressure regularly",
                            },
                            {
                                drugName: "Losartan 50mg",
                                dosage: "1 tablet",
                                frequency: "Once daily",
                                duration: "30 days",
                                instructions: "Take in the evening. Avoid potassium supplements",
                            },
                        ],
                    },
                },
            });
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
    } finally {
        await prisma.$disconnect();
    }
}
