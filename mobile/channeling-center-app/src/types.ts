// ==============================================
// AyuLink Channeling Center - Shared API Types
// Shapes match the Supabase RPC responses
// ==============================================

export type Role = "PATIENT" | "DOCTOR" | "PHARMACIST" | "CHANNELING_CENTER";

export type AppointmentStatus = "BOOKED" | "COMPLETED" | "CANCELLED";

export interface User {
    id: string;
    nicNumber: string;
    firstName: string;
    lastName: string;
    role: Role;
    medicalId: string;
    verified?: boolean;
}

export interface ChannelingCenterProfile {
    id: string;
    user_id: string;
    name: string;
    address: string;
    district: string | null;
    contact_number: string;
    location: string;
}

export interface AppointmentPerson {
    id: string;
    firstName: string;
    lastName: string;
    mobileNumber?: string;
    medicalId?: string;
    specialty?: string;
    rating?: number | null;
}

export interface AppointmentCenter {
    id: string;
    name: string;
    address: string;
    district: string | null;
    contactNumber: string;
}

// Raw shape returned by appointment_json() — top-level keys are the
// literal Appointment column names (snake_case); nested objects are
// hand-built (camelCase) by the same function.
export interface Appointment {
    id: string;
    order_number: string;
    patient_id: string;
    doctor_id: string;
    channeling_center_id: string;
    doctor_schedule_id: string;
    appointment_date: string;
    start_time: string;
    end_time: string;
    status: AppointmentStatus;
    reason: string | null;
    cancelled_by: string | null;
    cancelled_reason: string | null;
    cancelled_at: string | null;
    created_at: string;
    updated_at: string;
    patient: AppointmentPerson;
    doctor: AppointmentPerson;
    channelingCenter: AppointmentCenter;
}
