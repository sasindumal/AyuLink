// ==============================================
// AyuLink - Single Prescription API
// GET /api/prescriptions/[id] - Get prescription details
// PUT /api/prescriptions/[id] - Dispense/revert individual item
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { dispenseItemSchema, firstError } from "@/lib/validation";

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

        const { data: prescription, error } = await supabase
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
        if (error) throw error;

        // Ownership: patients may only view their own prescriptions,
        // doctors those they issued; pharmacists may view any (needed
        // to dispense scanned prescriptions). 404 (not 403) so the
        // response doesn't confirm the prescription exists.
        const role = session.user.role;
        const allowed =
            prescription &&
            (role === "PHARMACIST" ||
                (role === "PATIENT" && prescription.patientId === session.user.id) ||
                (role === "DOCTOR" && prescription.doctorId === session.user.id));

        if (!allowed) {
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

// Errors raised by the dispense_prescription_item Postgres function
const DISPENSE_ERRORS: Record<string, { message: string; status: number }> = {
    PRESCRIPTION_NOT_FOUND: { message: "Prescription not found", status: 404 },
    ITEM_NOT_FOUND: { message: "Item not found in this prescription", status: 404 },
    NOT_DISPENSED: { message: "This item has not been dispensed yet", status: 400 },
    REVERT_WINDOW_EXPIRED: { message: "Cannot revert — 15-minute window has expired", status: 400 },
};

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

        const parsed = dispenseItemSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: firstError(parsed) }, { status: 400 });
        }
        const { itemId, dispensed } = parsed.data;

        // Unverified pharmacists cannot dispense
        const { data: pharmacist, error: pharmacistError } = await supabase
            .from("User")
            .select("verified")
            .eq("id", session.user.id)
            .single();
        if (pharmacistError) throw pharmacistError;
        if (!pharmacist.verified) {
            return NextResponse.json(
                { error: "Your account is pending verification. You cannot dispense medications yet" },
                { status: 403 }
            );
        }

        // Atomic dispense/revert + status recompute (Postgres function
        // locks the prescription row, so concurrent dispenses serialize)
        const { data: result, error: dispenseError } = await supabase.rpc(
            "dispense_prescription_item",
            {
                p_prescription_id: prescriptionId,
                p_item_id: itemId,
                p_dispensed: dispensed,
                p_pharmacist_id: session.user.id,
            }
        );

        if (dispenseError) {
            const known = DISPENSE_ERRORS[dispenseError.message];
            if (known) {
                return NextResponse.json({ error: known.message }, { status: known.status });
            }
            throw dispenseError;
        }

        // Return updated prescription with all items and pharmacy info
        const { data: prescription, error: fetchError } = await supabase
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
        if (fetchError) throw fetchError;

        return NextResponse.json({
            message: dispensed
                ? `${result.drugName} dispensed`
                : `${result.drugName} reverted`,
            prescription,
            allDispensed: result.allDispensed,
        });
    } catch (error) {
        console.error("Dispense item error:", error);
        return NextResponse.json(
            { error: "Failed to update item" },
            { status: 500 }
        );
    }
}
