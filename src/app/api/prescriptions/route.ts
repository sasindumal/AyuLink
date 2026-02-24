// ==============================================
// AyuLink - Prescription API Routes
// GET  /api/prescriptions - Fetch prescriptions
// POST /api/prescriptions - Create new prescription
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Fetch prescriptions (filtered by role)
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const patientId = searchParams.get("patientId");
        const medicalId = searchParams.get("medicalId");

        let whereClause: any = {};

        // Role-based filtering
        if (session.user.role === "PATIENT") {
            whereClause.patientId = session.user.id;
        } else if (session.user.role === "DOCTOR") {
            // Doctors can see their own prescriptions or search by patient
            if (patientId) {
                whereClause.patientId = patientId;
            } else {
                whereClause.doctorId = session.user.id;
            }
        } else if (session.user.role === "PHARMACIST") {
            // Pharmacists can look up any prescription by patient
            if (patientId) {
                whereClause.patientId = patientId;
            } else if (medicalId) {
                // Find patient by medical ID first
                const patient = await prisma.user.findUnique({
                    where: { medicalId },
                });
                if (patient) {
                    whereClause.patientId = patient.id;
                }
            } else {
                // Default: only show prescriptions where this pharmacist dispensed items
                whereClause.items = {
                    some: {
                        dispensedById: session.user.id,
                    },
                };
            }
        }

        const prescriptions = await prisma.prescription.findMany({
            where: whereClause,
            include: {
                items: {
                    include: {
                        dispensedBy: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                pharmacyProfile: {
                                    select: { pharmacyName: true, licenseNumber: true },
                                },
                            },
                        },
                    },
                },
                patient: {
                    select: { id: true, firstName: true, lastName: true, nicNumber: true, medicalId: true },
                },
                doctor: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        doctorProfile: {
                            select: { specialization: true, hospitalName: true, slmcRegNo: true },
                        },
                    },
                },
            },
            orderBy: { dateIssued: "desc" },
        });

        return NextResponse.json({ prescriptions });
    } catch (error) {
        console.error("Fetch prescriptions error:", error);
        return NextResponse.json(
            { error: "Failed to fetch prescriptions" },
            { status: 500 }
        );
    }
}

// POST: Create a new prescription (Doctor only)
export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (session.user.role !== "DOCTOR") {
            return NextResponse.json(
                { error: "Only doctors can issue prescriptions" },
                { status: 403 }
            );
        }

        const body = await req.json();
        const { patientId, diagnosis, items } = body;

        // Validation
        if (!patientId || !diagnosis || !items || items.length === 0) {
            return NextResponse.json(
                { error: "Patient, diagnosis, and at least one prescription item are required" },
                { status: 400 }
            );
        }

        // Verify patient exists
        const patient = await prisma.user.findUnique({
            where: { id: patientId },
        });

        if (!patient || patient.role !== "PATIENT") {
            return NextResponse.json(
                { error: "Patient not found" },
                { status: 404 }
            );
        }

        // Create prescription with items
        const prescription = await prisma.prescription.create({
            data: {
                patientId,
                doctorId: session.user.id,
                diagnosis,
                items: {
                    create: items.map((item: any) => ({
                        drugName: item.drugName,
                        dosage: item.dosage,
                        frequency: item.frequency,
                        duration: item.duration,
                        instructions: item.instructions || "",
                    })),
                },
            },
            include: {
                items: true,
                patient: {
                    select: { firstName: true, lastName: true, nicNumber: true, medicalId: true },
                },
            },
        });

        return NextResponse.json(
            { message: "Prescription issued successfully", prescription },
            { status: 201 }
        );
    } catch (error) {
        console.error("Create prescription error:", error);
        return NextResponse.json(
            { error: "Failed to create prescription" },
            { status: 500 }
        );
    }
}
