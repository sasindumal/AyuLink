// ==============================================
// AyuLink - Patient Lookup API
// GET /api/patients/[medicalId]
// Look up a patient by their Medical ID (used after QR scan)
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ medicalId: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Only doctors and pharmacists can look up patients
        if (session.user.role === "PATIENT") {
            return NextResponse.json(
                { error: "Patients cannot look up other patients" },
                { status: 403 }
            );
        }

        const { medicalId } = await params;

        const patient = await prisma.user.findUnique({
            where: { medicalId },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                nicNumber: true,
                medicalId: true,
                dob: true,
                mobileNumber: true,
                role: true,
                prescriptionsAsPatient: {
                    include: {
                        items: {
                            include: {
                                dispensedBy: {
                                    select: {
                                        firstName: true,
                                        lastName: true,
                                        pharmacyProfile: {
                                            select: { pharmacyName: true, licenseNumber: true },
                                        },
                                    },
                                },
                            },
                        },
                        doctor: {
                            select: {
                                firstName: true,
                                lastName: true,
                                doctorProfile: {
                                    select: { specialization: true, hospitalName: true, slmcRegNo: true },
                                },
                            },
                        },
                    },
                    orderBy: { dateIssued: "desc" },
                },
            },
        });

        if (!patient || patient.role !== "PATIENT") {
            return NextResponse.json(
                { error: "Patient not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ patient });
    } catch (error) {
        console.error("Patient lookup error:", error);
        return NextResponse.json(
            { error: "Failed to look up patient" },
            { status: 500 }
        );
    }
}
