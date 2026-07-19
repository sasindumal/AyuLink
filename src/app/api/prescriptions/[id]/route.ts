// ==============================================
// AyuLink - Single Prescription API
// GET   /api/prescriptions/[id] - Get prescription details
// PATCH /api/prescriptions/[id] - Update prescription status
// PUT   /api/prescriptions/[id] - Dispense/revert individual item
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

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

        const { data: prescription } = await supabase
            .from("Prescription")
            .select(`
                *,
                items:PrescriptionItem (*),
                patient:User!Prescription_patientId_fkey (
                    id, firstName, lastName, nicNumber, medicalId, dob, mobileNumber
                ),
                doctor:User!Prescription_doctorId_fkey (
                    id, firstName, lastName,
                    doctorProfile:DoctorProfile ( specialization, hospitalName, slmcRegNo )
                )
            `)
            .eq("id", id)
            .maybeSingle();

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

        const { data: prescription, error } = await supabase
            .from("Prescription")
            .update({ status })
            .eq("id", id)
            .select(`
                *,
                items:PrescriptionItem (*),
                patient:User!Prescription_patientId_fkey ( firstName, lastName )
            `)
            .single();

        if (error || !prescription) {
            throw error ?? new Error("Prescription not found");
        }

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
        const { data: item } = await supabase
            .from("PrescriptionItem")
            .select("*")
            .eq("id", itemId)
            .eq("prescriptionId", prescriptionId)
            .maybeSingle();

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
            if (new Date(item.dispensedAt) < fifteenMinutesAgo) {
                return NextResponse.json(
                    { error: "Cannot revert — 15-minute window has expired" },
                    { status: 400 }
                );
            }
        }

        // Update the individual item with pharmacist info
        const { data: updatedItem, error: updateError } = await supabase
            .from("PrescriptionItem")
            .update({
                dispensed,
                dispensedAt: dispensed ? new Date().toISOString() : null,
                dispensedById: dispensed ? session.user.id : null,
            })
            .eq("id", itemId)
            .select()
            .single();

        if (updateError || !updatedItem) {
            throw updateError ?? new Error("Failed to update item");
        }

        // Check if ALL items in this prescription are now dispensed
        const { data: allItems } = await supabase
            .from("PrescriptionItem")
            .select("id, dispensed")
            .eq("prescriptionId", prescriptionId);

        const allDispensed = (allItems ?? []).every((i) => i.id === itemId ? dispensed : i.dispensed);
        const anyDispensed = (allItems ?? []).some((i) => i.id === itemId ? dispensed : i.dispensed);

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
        await supabase
            .from("Prescription")
            .update({ status: newStatus })
            .eq("id", prescriptionId);

        // Return updated prescription with all items and pharmacy info
        const { data: updatedPrescription } = await supabase
            .from("Prescription")
            .select(`
                *,
                items:PrescriptionItem (
                    *,
                    dispensedBy:User!PrescriptionItem_dispensedById_fkey (
                        firstName, lastName,
                        pharmacyProfile:PharmacyProfile ( pharmacyName, licenseNumber )
                    )
                ),
                patient:User!Prescription_patientId_fkey (
                    id, firstName, lastName, nicNumber, medicalId
                ),
                doctor:User!Prescription_doctorId_fkey (
                    id, firstName, lastName,
                    doctorProfile:DoctorProfile ( specialization, hospitalName, slmcRegNo )
                )
            `)
            .eq("id", prescriptionId)
            .single();

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
