// ==============================================
// AyuLink Patient - Health Profile
//
// The Tier 1/2/3 background a doctor reads when they scan a Medical ID:
// allergies, chronic conditions, regular medications, past surgeries and
// family history, plus lifestyle and emergency-contact details.
//
// The vocabularies here are the client half of the CHECK constraints in
// 20260915000000_patient_health_profile.sql — keep them in step.
// ==============================================

import { rpc } from "./api";

/** Whether a section has actually been answered.
 *
 *  UNKNOWN and NONE are deliberately different values, not an empty list
 *  in both cases: "no known drug allergies" is a clinical statement, and
 *  "nobody has asked yet" is the absence of one. A doctor reading an
 *  empty allergy list must be able to tell which they are looking at. */
export type SectionStatus = "UNKNOWN" | "NONE" | "LISTED";

export type AllergyKind = "DRUG" | "FOOD" | "ENVIRONMENTAL" | "OTHER";
export type AllergySeverity = "UNKNOWN" | "MILD" | "MODERATE" | "SEVERE" | "ANAPHYLAXIS";
export type HistoryKind = "SURGERY" | "HOSPITALISATION" | "IMMUNISATION" | "FAMILY_HISTORY" | "IMPLANT";
export type EntrySource = "PATIENT" | "DOCTOR";

export interface Allergy {
    id?: string;
    allergen: string;
    kind: AllergyKind;
    reaction?: string | null;
    severity: AllergySeverity;
    source?: EntrySource;
}

export interface Condition {
    id?: string;
    condition: string;
    since?: string | null;
    status: "ACTIVE" | "RESOLVED";
    notes?: string | null;
    source?: EntrySource;
}

export interface Medication {
    id?: string;
    drug_name?: string;
    drugName?: string;
    dosage?: string | null;
    frequency?: string | null;
    since?: string | null;
    ongoing?: boolean;
    notes?: string | null;
    source?: EntrySource;
}

export interface HistoryEvent {
    id?: string;
    kind: HistoryKind;
    label: string;
    occurred_year?: number | null;
    occurredYear?: number | null;
    relationship?: string | null;
    notes?: string | null;
    source?: EntrySource;
}

export interface HealthProfileCore {
    blood_group?: string | null;
    height_cm?: number | null;
    weight_kg?: number | null;
    pregnancy_status?: string;
    pregnancy_due_date?: string | null;
    smoking?: string;
    alcohol?: string;
    betel?: string;
    disabilities?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_relationship?: string | null;
    emergency_contact_phone?: string | null;
    preferred_language?: string;
    insurance_provider?: string | null;
    insurance_number?: string | null;
    organ_donor?: boolean | null;
    regular_doctor_name?: string | null;
    allergies_status?: SectionStatus;
    conditions_status?: SectionStatus;
    medications_status?: SectionStatus;
    surgeries_status?: SectionStatus;
    family_history_status?: SectionStatus;
    immunisations_status?: SectionStatus;
    implants_status?: SectionStatus;
    ayu_enabled?: boolean;
    ayu_last_prompted_at?: string | null;
    profile_completed_at?: string | null;
}

export interface HealthProfile {
    patientId: string;
    profile: HealthProfileCore;
    allergies: Allergy[];
    conditions: Condition[];
    medications: Medication[];
    history: HistoryEvent[];
    /** Present on the clinician-facing read only. */
    scope?: "FULL" | "DISPENSING";
}

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const SEVERITIES: AllergySeverity[] = ["UNKNOWN", "MILD", "MODERATE", "SEVERE", "ANAPHYLAXIS"];
export const ALLERGY_KINDS: AllergyKind[] = ["DRUG", "FOOD", "ENVIRONMENTAL", "OTHER"];

export const HISTORY_KIND_LABEL: Record<HistoryKind, string> = {
    SURGERY: "Surgery",
    HOSPITALISATION: "Hospital stay",
    IMMUNISATION: "Vaccination",
    FAMILY_HISTORY: "Family history",
    IMPLANT: "Implant / device",
};

export async function getMyHealthProfile(): Promise<HealthProfile> {
    return rpc<HealthProfile>("app_get_my_health_profile");
}

/** Camel-cases the arrays the way app_save_my_health_profile expects.
 *  Reads come back as raw column names (snake_case); writes go in as
 *  JSON keys the function parses — this is the one place that gap is
 *  bridged, rather than every caller remembering which is which. */
export async function saveMyHealthProfile(payload: {
    profile?: Record<string, unknown>;
    allergies?: Allergy[];
    conditions?: Condition[];
    medications?: Medication[];
    history?: HistoryEvent[];
}): Promise<HealthProfile> {
    const body: Record<string, unknown> = {};
    if (payload.profile) body.profile = payload.profile;
    if (payload.allergies) body.allergies = payload.allergies;
    if (payload.conditions) body.conditions = payload.conditions;
    if (payload.medications) {
        body.medications = payload.medications.map((m) => ({
            drugName: m.drugName ?? m.drug_name,
            dosage: m.dosage,
            frequency: m.frequency,
            since: m.since,
            ongoing: m.ongoing ?? true,
            notes: m.notes,
        }));
    }
    if (payload.history) {
        body.history = payload.history.map((h) => ({
            kind: h.kind,
            label: h.label,
            occurredYear: h.occurredYear ?? h.occurred_year,
            relationship: h.relationship,
            notes: h.notes,
        }));
    }
    return rpc<HealthProfile>("app_save_my_health_profile", { p_payload: body });
}

// The ten things Ayu asks about, in the same order as the interview
// (backend/src/agent_workflow/ayu/questions.py). Kept in step with that
// list on purpose: the profile screen saying "7 of 9 answered" while Ayu
// says "1 question left" would be two different truths about one thing.
const LIST_SECTIONS: (keyof HealthProfileCore)[] = [
    "allergies_status",
    "conditions_status",
    "medications_status",
    "surgeries_status",
    "family_history_status",
    "immunisations_status",
    "implants_status",
];

// The three scalar questions. Each counts as answered once ANY of its
// fields is filled — "O+, no idea about my height" is still an answer.
const SCALAR_GROUPS: (keyof HealthProfileCore)[][] = [
    ["blood_group", "height_cm", "weight_kg"],
    ["smoking", "alcohol", "betel"],
    ["emergency_contact_name", "emergency_contact_relationship", "emergency_contact_phone"],
];

function scalarAnswered(c: HealthProfileCore, fields: (keyof HealthProfileCore)[]): boolean {
    return fields.some((f) => {
        const v = c[f];
        return v !== null && v !== undefined && v !== "" && v !== "UNKNOWN";
    });
}

/** How much of the profile is filled in. A section explicitly marked
 *  NONE counts as answered; UNKNOWN does not — that distinction is the
 *  whole point of the *_status columns. */
export function completeness(p: HealthProfile): { answered: number; total: number } {
    const c = p.profile ?? {};
    const lists = LIST_SECTIONS.filter((k) => {
        const v = c[k] as SectionStatus | undefined;
        return v === "NONE" || v === "LISTED";
    }).length;
    const scalars = SCALAR_GROUPS.filter((g) => scalarAnswered(c, g)).length;
    return {
        answered: lists + scalars,
        total: LIST_SECTIONS.length + SCALAR_GROUPS.length,
    };
}

/** How many of Ayu's questions still have no answer at all. Mirrors
 *  `pending_indexes` in questions.py. */
export function missingCount(p: HealthProfile): number {
    const { answered, total } = completeness(p);
    return total - answered;
}
