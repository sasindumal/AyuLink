// ==============================================
// AyuLink Mobile - Shared API Types
// Shapes match the Next.js API responses
// ==============================================

export type Role = "PATIENT" | "DOCTOR" | "PHARMACIST" | "CHANNELING_CENTER";

export type PrescriptionStatus =
    | "NOT_DISPENSED"
    | "PARTIALLY_DISPENSED"
    | "FULLY_DISPENSED"
    | "EXPIRED";

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

// ----- Appointment booking -----

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
    city: string | null;
    contactNumber: string;
    latitude: number | null;
    longitude: number | null;
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

// Shape returned by app_search_doctor_slots() — quick "soonest
// slot" search.
export interface DoctorSlot {
    doctorScheduleId: string;
    doctorId: string;
    doctorFirstName: string;
    doctorLastName: string;
    specialty: string;
    rating: number | null;
    channelingCenterId: string;
    channelingCenterName: string;
    address: string;
    city: string | null;
    contactNumber: string;
    nextAvailableDate: string;
    startTime: string;
    endTime: string;
    distanceKm: number | null;
}

// Shape returned by app_search_doctors()
export interface DoctorSummary {
    doctorId: string;
    doctorFirstName: string;
    doctorLastName: string;
    specialty: string;
    rating: number | null;
}

// Shape returned by app_get_doctor_availability() — every upcoming
// slot for one doctor, across all their centers.
export interface DoctorAvailabilitySlot {
    doctorScheduleId: string;
    channelingCenterId: string;
    channelingCenterName: string;
    address: string;
    city: string | null;
    contactNumber: string;
    date: string;
    startTime: string;
    endTime: string;
    distanceKm: number | null;
}

// Shape returned by app_get_center_availability() — every upcoming
// slot at one center, across all doctors there.
export interface CenterAvailabilitySlot {
    doctorScheduleId: string;
    doctorId: string;
    doctorFirstName: string;
    doctorLastName: string;
    specialty: string;
    rating: number | null;
    date: string;
    startTime: string;
    endTime: string;
}

// Shape returned by app_list_channeling_centers()
export interface ChannelingCenterSummary {
    id: string;
    name: string;
    address: string;
    city: string | null;
    contact_number: string;
    location: string;
}

// ----- Treatments (AI diagnosis sessions) -----

export type TreatmentStatus = "DIAGNOSED" | "BOOKED" | "COMPLETED";

export interface TreatmentAppointmentRef {
    id: string;
    orderNumber: string;
    status: AppointmentStatus;
    appointmentDate: string;
    startTime: string;
}

// Shape returned by app_list_my_treatments() / app_create_treatment() /
// app_link_treatment_appointment() (via treatment_json()).
export interface Treatment {
    id: string;
    patient_id: string;
    thread_id: string;
    disease_name: string;
    specialty: string | null;
    description: string | null;
    status: TreatmentStatus;
    appointment_id: string | null;
    created_at: string;
    updated_at: string;
    appointment: TreatmentAppointmentRef | null;
}

// ----- Notifications -----

export type NotificationType =
    | "APPOINTMENT_BOOKED"
    | "APPOINTMENT_RESCHEDULED"
    | "APPOINTMENT_CANCELLED"
    | "APPOINTMENT_COMPLETED";

// Shape returned by app_list_notifications()
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
