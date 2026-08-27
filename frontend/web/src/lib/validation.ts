// ==============================================
// AyuLink - Request Validation Schemas (zod)
// Server-side validation for all mutating routes
// ==============================================

import { z } from "zod";
import { Role } from "@/types/db";

const trimmedString = (max: number) => z.string().trim().min(1).max(max);

export const registerSchema = z
    .object({
        nicNumber: z
            .string()
            .trim()
            .regex(/^([0-9]{9}[vVxX]|[0-9]{12})$/, "Invalid NIC number format"),
        firstName: trimmedString(100),
        lastName: trimmedString(100),
        mobileNumber: z
            .string()
            .trim()
            .regex(/^\+?[0-9]{9,15}$/, "Invalid mobile number"),
        dob: z
            .string()
            .refine((value) => {
                const date = new Date(value);
                return !isNaN(date.getTime()) && date < new Date();
            }, "Date of birth must be a valid date in the past"),
        password: z.string().min(8, "Password must be at least 8 characters").max(100),
        role: z.nativeEnum(Role).default(Role.PATIENT),
        // Doctor-specific fields
        slmcRegNo: trimmedString(50).optional(),
        specialization: trimmedString(100).optional(),
        // Pharmacist-specific fields
        pharmacyName: trimmedString(150).optional(),
        pharmacyLicense: trimmedString(50).optional(),
        pharmacyLatitude: trimmedString(20).optional(),
        pharmacyLongitude: trimmedString(20).optional(),
    })
    .superRefine((data, ctx) => {
        if (data.role === Role.DOCTOR) {
            if (!data.slmcRegNo || !data.specialization) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Doctor registration requires SLMC number and specialization",
                });
            }
        }
        if (data.role === Role.PHARMACIST) {
            if (!data.pharmacyName || !data.pharmacyLicense
                || !data.pharmacyLatitude || !data.pharmacyLongitude) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message:
                        "Pharmacist registration requires pharmacy name, license number, and location",
                });
            }
        }
    });

export const createPrescriptionSchema = z.object({
    patientId: z.string().uuid("Invalid patient id"),
    diagnosis: trimmedString(500),
    items: z
        .array(
            z.object({
                drugName: trimmedString(200),
                dosage: trimmedString(100),
                frequency: trimmedString(100),
                duration: trimmedString(100),
                instructions: z.string().trim().max(500).optional().default(""),
            })
        )
        .min(1, "At least one prescription item is required")
        .max(50),
});

export const dispenseItemSchema = z.object({
    itemId: z.string().uuid("Invalid item id"),
    dispensed: z.boolean(),
});

/** First human-readable message from a failed parse. */
export function firstError(result: { error: z.ZodError }): string {
    return result.error.issues[0]?.message ?? "Invalid request";
}
