// ==============================================
// AyuLink - Database Types
// Enum values mirror the Postgres enum types
// defined in supabase/migrations
// ==============================================

export const Role = {
    PATIENT: "PATIENT",
    DOCTOR: "DOCTOR",
    PHARMACIST: "PHARMACIST",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const PrescriptionStatus = {
    NOT_DISPENSED: "NOT_DISPENSED",
    PARTIALLY_DISPENSED: "PARTIALLY_DISPENSED",
    FULLY_DISPENSED: "FULLY_DISPENSED",
} as const;

export type PrescriptionStatus =
    (typeof PrescriptionStatus)[keyof typeof PrescriptionStatus];
