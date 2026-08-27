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
    route: string;
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

// What the patient should do if the problem persists after finishing
// the course. Drives the end-of-course check-in in the patient's AI
// chat, so it is part of the prescription itself rather than a note.
export type FollowupPlan = "NONE" | "MEET_SAME_DOCTOR" | "REFER_DOCTOR";

/** A doctor the current doctor can refer a patient on to. */
export interface ReferralDoctor {
    id: string;
    firstName: string;
    lastName: string;
    specialty: string | null;
    slmcRegNo: string | null;
    rating: number | null;
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
    appointmentId: string | null;
    followupPlan: FollowupPlan;
    referredDoctor: ReferralDoctor | null;
    items: PrescriptionItem[];
    patient?: PersonRef;
    doctor?: PersonRef;
}

/** One of this doctor's own active (BOOKED) appointments with a
 *  scanned patient — returned by app_doctor_appointments_for_patient. */
export interface DoctorPatientAppointment {
    id: string;
    orderNumber: string;
    status: "BOOKED" | "COMPLETED" | "CANCELLED";
    appointmentDate: string;
    startTime: string;
    endTime: string;
    reason: string | null;
    channelingCenter: { id: string; name: string; city: string | null } | null;
    /** The AI-chat diagnosis this appointment was booked for, if any. */
    treatment: {
        id: string;
        diseaseName: string;
        specialty: string | null;
        status: string;
    } | null;
    /** Set once a prescription has already been issued at this visit. */
    prescriptionId: string | null;
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
