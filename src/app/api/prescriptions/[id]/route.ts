// ==============================================
// AyuLink - Single Prescription API
// GET   /api/prescriptions/[id] - Get prescription details
// PATCH /api/prescriptions/[id] - Update prescription status
// PUT   /api/prescriptions/[id] - Dispense/revert individual item
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

// PATCH: Update full prescription status (legacy — keep for compatibility)
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

        if (!status || !["NOT_DISPENSED", "PARTIALLY_DISPENSED", "FULLY_DISPENSED"].includes(status)) {
            return NextResponse.json(
                { error: "Invalid status. Must be NOT_DISPENSED, PARTIALLY_DISPENSED, or FULLY_DISPENSED" },
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

// PUT: Dispense or revert an individual prescription item
export async function PUT(
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
                { error: "Only pharmacists can dispense medications" },
                { status: 403 }
            );
        }

        const { id: prescriptionId } = await params;
        const body = await req.json();
        const { itemId, dispensed } = body;

        if (!itemId || typeof dispensed !== "boolean") {
            return NextResponse.json(
                { error: "itemId and dispensed (boolean) are required" },
                { status: 400 }
            );
        }

        // Verify the item belongs to this prescription
        const item = await prisma.prescriptionItem.findFirst({
            where: { id: itemId, prescriptionId },
        });

        if (!item) {
            return NextResponse.json(
                { error: "Item not found in this prescription" },
                { status: 404 }
            );
        }

        // If reverting (dispensed = false), check 15-minute window
        if (!dispensed) {
            if (!item.dispensed || !item.dispensedAt) {
                return NextResponse.json(
                    { error: "This item has not been dispensed yet" },
                    { status: 400 }
                );
            }

            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
            if (item.dispensedAt < fifteenMinutesAgo) {
                return NextResponse.json(
                    { error: "Cannot revert — 15-minute window has expired" },
                    { status: 400 }
                );
            }
        }

        // Update the individual item with pharmacist info
        const updatedItem = await prisma.prescriptionItem.update({
            where: { id: itemId },
            data: {
                dispensed,
                dispensedAt: dispensed ? new Date() : null,
                dispensedById: dispensed ? (session.user as any).id : null,
            },
        });

        // Check if ALL items in this prescription are now dispensed
        const allItems = await prisma.prescriptionItem.findMany({
            where: { prescriptionId },
        });

        const allDispensed = allItems.every((i) => i.id === itemId ? dispensed : i.dispensed);
        const anyDispensed = allItems.some((i) => i.id === itemId ? dispensed : i.dispensed);

        // Compute three-state status
        let newStatus: "NOT_DISPENSED" | "PARTIALLY_DISPENSED" | "FULLY_DISPENSED";
        if (allDispensed) {
            newStatus = "FULLY_DISPENSED";
        } else if (anyDispensed) {
            newStatus = "PARTIALLY_DISPENSED";
        } else {
            newStatus = "NOT_DISPENSED";
        }

        // Auto-update prescription status
        await prisma.prescription.update({
            where: { id: prescriptionId },
            data: {
                status: newStatus,
            },
        });

        // Return updated prescription with all items and pharmacy info
        const updatedPrescription = await prisma.prescription.findUnique({
            where: { id: prescriptionId },
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
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        nicNumber: true,
                        medicalId: true,
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

        return NextResponse.json({
            message: dispensed
                ? `${updatedItem.drugName} dispensed`
                : `${updatedItem.drugName} reverted`,
            prescription: updatedPrescription,
            allDispensed,
        });
    } catch (error) {
        console.error("Dispense item error:", error);
        return NextResponse.json(
            { error: "Failed to update item" },
            { status: 500 }
        );
    }
}
