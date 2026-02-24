// ==============================================
// AyuLink - Single Prescription API
// GET   /api/prescriptions/[id] - Get prescription details
// PATCH /api/prescriptions/[id] - Update prescription status
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Fetch a specific prescription by ID
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        const prescription = await prisma.prescription.findUnique({
            where: { id },
            include: {
                items: true,
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        nicNumber: true,
                        medicalId: true,
                        dob: true,
                        mobileNumber: true,
                    },
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
        });

        if (!prescription) {
            return NextResponse.json(
                { error: "Prescription not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ prescription });
    } catch (error) {
        console.error("Fetch prescription error:", error);
        return NextResponse.json(
            { error: "Failed to fetch prescription" },
            { status: 500 }
        );
    }
}

// PATCH: Update prescription status (Pharmacist marks as dispensed)
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (session.user.role !== "PHARMACIST") {
            return NextResponse.json(
                { error: "Only pharmacists can update prescription status" },
                { status: 403 }
            );
        }

        const { id } = await params;
        const body = await req.json();
        const { status } = body;

        if (!status || !["ACTIVE", "DISPENSED"].includes(status)) {
            return NextResponse.json(
                { error: "Invalid status. Must be ACTIVE or DISPENSED" },
                { status: 400 }
            );
        }

        const prescription = await prisma.prescription.update({
            where: { id },
            data: { status },
            include: {
                items: true,
                patient: {
                    select: { firstName: true, lastName: true },
                },
            },
        });

        return NextResponse.json({
            message: `Prescription marked as ${status.toLowerCase()}`,
            prescription,
        });
    } catch (error) {
        console.error("Update prescription error:", error);
        return NextResponse.json(
            { error: "Failed to update prescription" },
            { status: 500 }
        );
    }
}
