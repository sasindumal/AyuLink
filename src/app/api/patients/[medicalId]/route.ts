// ==============================================
// AyuLink - Patient Lookup API
// GET /api/patients/[medicalId]
// Look up a patient by their Medical ID (used after QR scan)
// ==============================================

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuthUser } from "@/lib/api-auth";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ medicalId: string }> }
) {
    try {
        const user = await getAuthUser(req);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Only doctors and pharmacists can look up patients
        if (user.role === "PATIENT") {
            return NextResponse.json(
                { error: "Patients cannot look up other patients" },
                { status: 403 }
            );
        }

        const { medicalId } = await params;

        const { data: patient, error } = await supabase
            .from("User")
            .select(`
                id, firstName, lastName, nicNumber, medicalId, dob, mobileNumber, role,
                prescriptionsAsPatient:Prescription!Prescription_patientId_fkey (
                    *,
                    items:PrescriptionItem (
                        *,
                        dispensedBy:User!PrescriptionItem_dispensedById_fkey (
                            firstName, lastName,
                            pharmacyProfile:PharmacyProfile ( pharmacyName, licenseNumber )
                        )
                    ),
                    doctor:User!Prescription_doctorId_fkey (
                        firstName, lastName,
                        doctorProfile:DoctorProfile ( specialization, hospitalName, slmcRegNo )
                    )
                )
            `)
            .eq("medicalId", medicalId)
            .order("dateIssued", {
                ascending: false,
                referencedTable: "prescriptionsAsPatient",
            })
            .maybeSingle();
        if (error) throw error;

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
