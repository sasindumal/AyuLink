// ==============================================
// AyuLink - Prescription API Routes
// GET  /api/prescriptions - Fetch prescriptions
// POST /api/prescriptions - Create new prescription
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuthUser } from "@/lib/api-auth";
import { createPrescriptionSchema, firstError } from "@/lib/validation";

// Nested select shared by prescription queries.
// FK hints (User!Prescription_patientId_fkey) disambiguate the two
// Prescription -> User relations.
const PRESCRIPTION_SELECT = `
    *,
    items:PrescriptionItem (
        *,
        dispensedBy:User!PrescriptionItem_dispensedById_fkey (
            id, firstName, lastName,
            pharmacyProfile:PharmacyProfile ( pharmacyName, licenseNumber )
        )
    ),
    patient:User!Prescription_patientId_fkey ( id, firstName, lastName, nicNumber, medicalId ),
    doctor:User!Prescription_doctorId_fkey (
        id, firstName, lastName,
        doctorProfile:DoctorProfile ( specialization, hospitalName, slmcRegNo )
    )
`;

// GET: Fetch prescriptions (filtered by role)
export async function GET(req: NextRequest) {
    try {
        const user = await getAuthUser(req);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const patientId = searchParams.get("patientId");
        const medicalId = searchParams.get("medicalId");

        let query = supabase
            .from("Prescription")
            .select(PRESCRIPTION_SELECT)
            .order("dateIssued", { ascending: false });

        // Role-based filtering
        if (user.role === "PATIENT") {
            query = query.eq("patientId", user.id);
        } else if (user.role === "DOCTOR") {
            // Doctors can see their own prescriptions or search by patient
            if (patientId) {
                query = query.eq("patientId", patientId);
            } else {
                query = query.eq("doctorId", user.id);
            }
        } else if (user.role === "PHARMACIST") {
            // Pharmacists can look up any prescription by patient
            if (patientId) {
                query = query.eq("patientId", patientId);
            } else if (medicalId) {
                // Find patient by medical ID first
                const { data: patient } = await supabase
                    .from("User")
                    .select("id")
                    .eq("medicalId", medicalId)
                    .maybeSingle();
                if (!patient) {
                    // Unknown medical ID must not fall through to an
                    // unfiltered query returning every prescription
                    return NextResponse.json({ prescriptions: [] });
                }
                query = query.eq("patientId", patient.id);
            } else {
                // Default: only show prescriptions where this pharmacist dispensed items
                const { data: dispensedItems } = await supabase
                    .from("PrescriptionItem")
                    .select("prescriptionId")
                    .eq("dispensedById", user.id);

                const prescriptionIds = [
                    ...new Set((dispensedItems ?? []).map((i) => i.prescriptionId)),
                ];

                if (prescriptionIds.length === 0) {
                    return NextResponse.json({ prescriptions: [] });
                }

                query = query.in("id", prescriptionIds);
            }
        }

        const { data: prescriptions, error } = await query;
        if (error) throw error;

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
        const user = await getAuthUser(req);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (user.role !== "DOCTOR") {
            return NextResponse.json(
                { error: "Only doctors can issue prescriptions" },
                { status: 403 }
            );
        }

        const parsed = createPrescriptionSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: firstError(parsed) }, { status: 400 });
        }
        const { patientId, diagnosis, items } = parsed.data;

        // Unverified doctors cannot issue prescriptions
        const { data: doctor, error: doctorError } = await supabase
            .from("User")
            .select("verified")
            .eq("id", user.id)
            .single();
        if (doctorError) throw doctorError;
        if (!doctor.verified) {
            return NextResponse.json(
                { error: "Your account is pending verification. You cannot issue prescriptions yet" },
                { status: 403 }
            );
        }

        // Verify patient exists
        const { data: patient } = await supabase
            .from("User")
            .select("id, role")
            .eq("id", patientId)
            .maybeSingle();

        if (!patient || patient.role !== "PATIENT") {
            return NextResponse.json(
                { error: "Patient not found" },
                { status: 404 }
            );
        }

        // Atomic prescription + items creation (Postgres function)
        const { data: prescriptionId, error: createError } = await supabase.rpc(
            "create_prescription_with_items",
            {
                p_patient_id: patientId,
                p_doctor_id: user.id,
                p_diagnosis: diagnosis,
                p_items: items,
            }
        );

        if (createError || !prescriptionId) {
            throw createError ?? new Error("Failed to create prescription");
        }

        const { data: prescription, error: fetchError } = await supabase
            .from("Prescription")
            .select(`
                *,
                items:PrescriptionItem (*),
                patient:User!Prescription_patientId_fkey ( firstName, lastName, nicNumber, medicalId )
            `)
            .eq("id", prescriptionId)
            .single();
        if (fetchError) throw fetchError;

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
