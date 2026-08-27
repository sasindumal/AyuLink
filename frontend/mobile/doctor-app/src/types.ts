// ==============================================
// AyuLink Mobile - Shared API Types
// Shapes match the Next.js API responses
// ==============================================

export type Role = "PATIENT" | "DOCTOR" | "PHARMACIST";

export type PrescriptionStatus =
    | "NOT_DISPENSED"
    | "PARTIALLY_DISPENSED"
    | "FULLY_DISPENSED"
    | "EXPIRED";

export interface User {
    id: string;
    nicNumber: string;
    firstName: string;
    lastName: string;
    role: Role;
    medicalId: string;
    verified?: boolean;
}

export interface PharmacyProfile {
    pharmacyName: string;
    licenseNumber: string;
    location?: string;
}

export interface DoctorProfile {
    specialization: string;
    slmcRegNo: string;
}

export interface PrescriptionItem {
    id: string;
    prescriptionId: string;
    drugName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
    dispensed: boolean;
    dispensedAt: string | null;
    dispensedById: string | null;
    dispensedBy?: {
        id?: string;
        firstName: string;
        lastName: string;
        pharmacyProfile?: PharmacyProfile | null;
    } | null;
}

export interface PersonRef {
    id?: string;
    firstName: string;
    lastName: string;
    nicNumber?: string;
    medicalId?: string;
    doctorProfile?: DoctorProfile | null;
}

export interface Prescription {
    id: string;
    patientId: string;
    doctorId: string;
    dateIssued: string;
    diagnosis: string;
    status: PrescriptionStatus;
    expiresAt: string | null;
    patientAge: number | null;
    patientWeightKg: number | null;
    items: PrescriptionItem[];
    patient?: PersonRef;
    doctor?: PersonRef;
}

export interface PatientLookup {
    id: string;
    firstName: string;
    lastName: string;
    nicNumber: string;
    medicalId: string;
    dob: string;
    mobileNumber: string;
    prescriptionsAsPatient: Prescription[];
}

// ----- Notifications -----

export type NotificationType =
    | "APPOINTMENT_BOOKED"
    | "APPOINTMENT_RESCHEDULED"
    | "APPOINTMENT_CANCELLED"
    | "APPOINTMENT_COMPLETED";

export interface AppNotification {
    id: string;
    user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    appointment_id: string | null;
    read: boolean;
    created_at: string;
}
