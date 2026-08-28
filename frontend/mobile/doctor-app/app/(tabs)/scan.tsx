// ==============================================
// AyuLink Doctor - Scan & Prescribe
// QR / manual patient lookup + prescription builder.
// Also doubles as the Edit Prescription screen — reached
// from the Issued tab with ?editId=&editPayload= params,
// prefilling the same form and calling the update RPC
// instead of create.
// ==============================================

import React, { useEffect, useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../../src/lib/api";
import { colors, radius, spacing } from "../../src/theme";
import { Banner, Button, Card, FilterChips, Input, ScreenHeader } from "../../src/components/ui";
import { QRScannerModal } from "../../src/components/QRScannerModal";
import { QuickPickField } from "../../src/components/QuickPickField";
import { SelectField } from "../../src/components/SelectField";
import {
    PrescriptionConfirmModal,
    type PrescriptionDraft,
} from "../../src/components/PrescriptionConfirmModal";
import { AppointmentPicker } from "../../src/components/AppointmentPicker";
import { ClinicalHistorySheet, type ClinicalHistory } from "../../src/components/ClinicalHistorySheet";
import { ReferralDoctorPicker } from "../../src/components/ReferralDoctorPicker";
import type {
    DoctorPatientAppointment,
    FollowupPlan,
    PatientLookup,
    Prescription,
    ReferralDoctor,
} from "../../src/types";

const FOLLOWUP_OPTIONS: { key: FollowupPlan; label: string }[] = [
    { key: "NONE", label: "Nothing specific" },
    { key: "MEET_SAME_DOCTOR", label: "Come back to me" },
    { key: "REFER_DOCTOR", label: "Refer to another doctor" },
];

const DOSAGE_UNITS = ["mg", "g", "mcg", "ml", "IU", "tablet(s)", "capsule(s)", "drop(s)", "puff(s)", "tsp"];
const FREQUENCY_PRESETS = [
    "1-0-0", "0-1-0", "0-0-1", "1-0-1", "1-1-1", "2-1-2",
    "Once daily", "Twice daily", "Three times daily", "As needed (PRN)",
];
const DURATION_PRESETS = ["3 days", "5 days", "7 days", "10 days", "14 days", "1 month", "Ongoing"];
const ROUTE_OPTIONS = [
    "Oral", "Topical", "Intravenous (IV)", "Intramuscular (IM)", "Subcutaneous",
    "Sublingual", "Inhalation", "Nasal", "Ophthalmic", "Otic", "Rectal", "Vaginal", "Transdermal",
];
const EXPIRY_PRESETS = [7, 14, 30, 60, 90];

interface MedInput {
    drugName: string;
    dosageAmount: string;
    dosageUnit: string;
    frequency: string;
    duration: string;
    route: string;
    instructions: string;
}

const emptyMed = (): MedInput => ({
    drugName: "",
    dosageAmount: "",
    dosageUnit: "mg",
    frequency: "",
    duration: "",
    route: "Oral",
    instructions: "",
});

function splitDosage(dosage: string): { amount: string; unit: string } {
    const idx = dosage.indexOf(" ");
    if (idx === -1) return { amount: dosage, unit: "" };
    return { amount: dosage.slice(0, idx), unit: dosage.slice(idx + 1) };
}

export default function Scan() {
    const params = useLocalSearchParams<{ editId?: string; editPayload?: string; medicalId?: string }>();
    const [editingId, setEditingId] = useState<string | null>(null);

    const [scannerOpen, setScannerOpen] = useState(false);
    const [manualId, setManualId] = useState("");
    const [lookupLoading, setLookupLoading] = useState(false);
    const [patient, setPatient] = useState<PatientLookup | null>(null);
    // The patient's own background (allergies, conditions, regular
    // medicines). Fetched on demand rather than with the lookup: it is a
    // second round trip that most prescriptions never need, and putting
    // it behind a tap keeps the scan-to-prescribe path fast.
    const [historyOpen, setHistoryOpen] = useState(false);
    const [history, setHistory] = useState<ClinicalHistory | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);

    const [diagnosis, setDiagnosis] = useState("");
    const [age, setAge] = useState("");
    const [weight, setWeight] = useState("");
    const [meds, setMeds] = useState<MedInput[]>([emptyMed()]);
    const [expiryDays, setExpiryDays] = useState<number | null>(30);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    // Set once the form validates — shows the review modal. Nothing is
    // sent to the server until confirmIssue() runs from that modal.
    const [reviewDraft, setReviewDraft] = useState<PrescriptionDraft | null>(null);

    // Which visit this prescription belongs to. Populated after a patient
    // lookup with only THIS doctor's own active appointments for them.
    const [appointments, setAppointments] = useState<DoctorPatientAppointment[]>([]);
    const [selectedAppointment, setSelectedAppointment] =
        useState<DoctorPatientAppointment | null>(null);

    // What the patient should do if it doesn't clear up after the course.
    const [followupPlan, setFollowupPlan] = useState<FollowupPlan>("NONE");
    const [referredDoctor, setReferredDoctor] = useState<ReferralDoctor | null>(null);
    const [referralOpen, setReferralOpen] = useState(false);

    // Prefill the form from an existing prescription when reached
    // via "Edit" on the Issued tab.
    useEffect(() => {
        if (!params.editId || !params.editPayload) return;
        try {
            const p: Prescription = JSON.parse(params.editPayload);
            setEditingId(p.id);
            // Carry the existing follow-up plan into the edit form, or a
            // save would silently reset it back to "nothing specific".
            setFollowupPlan(p.followupPlan ?? "NONE");
            setReferredDoctor(p.referredDoctor ?? null);
            setPatient({
                id: p.patient?.id ?? p.patientId,
                firstName: p.patient?.firstName ?? "",
                lastName: p.patient?.lastName ?? "",
                nicNumber: p.patient?.nicNumber ?? "",
                medicalId: p.patient?.medicalId ?? "",
                dob: "",
                mobileNumber: "",
                prescriptionsAsPatient: [],
            });
            setDiagnosis(p.diagnosis);
            setAge(p.patientAge != null ? String(p.patientAge) : "");
            setWeight(p.patientWeightKg != null ? String(p.patientWeightKg) : "");
            setMeds(
                p.items.map((item) => {
                    const { amount, unit } = splitDosage(item.dosage);
                    return {
                        drugName: item.drugName,
                        dosageAmount: amount,
                        dosageUnit: unit,
                        frequency: item.frequency,
                        duration: item.duration,
                        route: item.route || "Oral",
                        instructions: item.instructions,
                    };
                })
            );
            setExpiryDays(
                p.expiresAt
                    ? Math.max(1, Math.round((new Date(p.expiresAt).getTime() - new Date(p.dateIssued).getTime()) / 86400000))
                    : null
            );
        } catch {
            // malformed payload — just fall through to the normal scan flow
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.editId]);

    // Reached via "Start visit" on the Today clinic list — pre-loads the
    // patient so the doctor lands straight on the prescription form
    // instead of having to scan/type the Medical ID again for someone
    // already sitting in front of them.
    useEffect(() => {
        if (params.medicalId && !params.editId) {
            lookup(params.medicalId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.medicalId]);

    useEffect(() => {
        if (!successMessage) return;
        const t = setTimeout(() => setSuccessMessage(null), 4000);
        return () => clearTimeout(t);
    }, [successMessage]);

    /** Visit + follow-up state is per-patient — it must never survive
     *  into the next person's prescription. */
    const resetVisitState = () => {
        setAppointments([]);
        setSelectedAppointment(null);
        setFollowupPlan("NONE");
        setReferredDoctor(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setPatient(null);
        setDiagnosis("");
        setAge("");
        setWeight("");
        setMeds([emptyMed()]);
        setExpiryDays(30);
        resetVisitState();
        router.replace("/(tabs)/prescriptions");
    };

    const lookup = async (medicalId: string) => {
        setScannerOpen(false);
        if (!medicalId.trim()) return;
        setError(null);
        setLookupLoading(true);
        try {
            const data = await rpc<PatientLookup>("app_lookup_patient", {
                p_medical_id: medicalId.trim(),
            });
            setPatient(data);

            // Only this doctor's own active appointments with this patient —
            // never the patient's whole appointment history with everyone.
            // Best-effort: a walk-in with no booking still prescribes fine.
            try {
                const appts = await rpc<DoctorPatientAppointment[]>(
                    "app_doctor_appointments_for_patient",
                    { p_patient_id: data.id }
                );
                setAppointments(appts ?? []);
                // Exactly one visit in progress is the overwhelmingly common
                // case — pick it rather than making them tap a list of one.
                if ((appts ?? []).length === 1) {
                    void selectAppointment(appts[0]);
                }
            } catch {
                setAppointments([]);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Patient not found");
        } finally {
            setLookupLoading(false);
        }
    };

    /** Choosing the visit also marks it started, which notifies the
     *  patient and posts "your doctor has started your appointment" into
     *  their AI chat. Idempotent server-side, so re-selecting is safe. */
    const selectAppointment = async (appt: DoctorPatientAppointment) => {
        setSelectedAppointment(appt);
        // Prefill the diagnosis from what the AI chat already suspected,
        // so the doctor edits rather than retypes.
        if (appt.treatment?.diseaseName && !diagnosis.trim()) {
            setDiagnosis(appt.treatment.diseaseName);
        }
        try {
            await rpc("app_doctor_start_appointment", { p_appointment_id: appt.id });
        } catch {
            // Starting the visit is a courtesy notification, never a
            // precondition for prescribing.
        }
    };

    const updateMed = (index: number, key: keyof MedInput, value: string) =>
        setMeds((list) =>
            list.map((m, i) => (i === index ? { ...m, [key]: value } : m))
        );

    /** Validates the form and, if everything checks out, shows the review
     *  modal — nothing is sent to the server yet. This is what the "Sign &
     *  Issue Prescription" / "Save Changes" button now does; the actual
     *  RPC only fires from confirmIssue(), once the doctor taps Confirm. */
    const openReview = () => {
        if (!patient) return;
        if (!diagnosis.trim()) {
            setError("Please enter a diagnosis");
            return;
        }
        const cleaned = meds.filter(
            (m) => m.drugName.trim() || m.dosageAmount.trim() || m.frequency.trim()
        );
        if (
            cleaned.length === 0 ||
            cleaned.some(
                (m) =>
                    !m.drugName.trim() ||
                    !m.dosageAmount.trim() ||
                    !m.dosageUnit.trim() ||
                    !m.frequency.trim() ||
                    !m.duration.trim()
            )
        ) {
            setError(
                "Each medication needs a drug name, dosage amount + unit, frequency, and duration"
            );
            return;
        }
        const ageNum = age.trim() ? Number(age.trim()) : null;
        if (ageNum !== null && (Number.isNaN(ageNum) || ageNum < 0 || ageNum > 150)) {
            setError("Age must be a number between 0 and 150");
            return;
        }
        const weightNum = weight.trim() ? Number(weight.trim()) : null;
        if (weightNum !== null && (Number.isNaN(weightNum) || weightNum <= 0 || weightNum > 500)) {
            setError("Weight must be a number between 0 and 500 kg");
            return;
        }
        if (followupPlan === "REFER_DOCTOR" && !referredDoctor) {
            setError("Please choose the doctor you are referring this patient to");
            return;
        }
        setError(null);

        const items = cleaned.map((m) => ({
            drugName: m.drugName.trim(),
            dosage: `${m.dosageAmount.trim()} ${m.dosageUnit.trim()}`.trim(),
            frequency: m.frequency.trim(),
            duration: m.duration.trim(),
            route: m.route.trim() || "Oral",
            instructions: m.instructions.trim(),
        }));

        setReviewDraft({
            patientName: `${patient.firstName} ${patient.lastName}`,
            medicalId: patient.medicalId,
            diagnosis: diagnosis.trim(),
            age: ageNum,
            weight: weightNum,
            items,
            expiryDays,
            followupPlan,
            referredDoctor: followupPlan === "REFER_DOCTOR" ? referredDoctor : null,
            editing: !!editingId,
        });
    };

    /** Fires the actual RPC — only reachable via the review modal's
     *  Confirm button. */
    const confirmIssue = async () => {
        if (!patient || !reviewDraft) return;
        setSubmitting(true);
        try {
            const items = reviewDraft.items;

            const result = editingId
                ? await rpc<Prescription>("app_update_prescription", {
                      p_prescription_id: editingId,
                      p_diagnosis: reviewDraft.diagnosis,
                      p_items: items,
                      p_expiry_days: reviewDraft.expiryDays,
                      p_patient_age: reviewDraft.age,
                      p_patient_weight: reviewDraft.weight,
                      p_followup_plan: reviewDraft.followupPlan,
                      p_referred_doctor_id: reviewDraft.referredDoctor?.id ?? null,
                  })
                : await rpc<Prescription>("app_create_prescription", {
                      p_patient_id: patient.id,
                      p_diagnosis: reviewDraft.diagnosis,
                      p_items: items,
                      p_expiry_days: reviewDraft.expiryDays,
                      p_patient_age: reviewDraft.age,
                      p_patient_weight: reviewDraft.weight,
                      p_appointment_id: selectedAppointment?.id ?? null,
                      p_followup_plan: reviewDraft.followupPlan,
                      p_referred_doctor_id: reviewDraft.referredDoctor?.id ?? null,
                  });

            const wasEditing = !!editingId;
            setReviewDraft(null);
            setSuccessMessage(
                wasEditing ? "Prescription updated." : `Prescription issued for ${result.patient?.firstName ?? "the patient"}.`
            );

            if (wasEditing) {
                setEditingId(null);
                router.replace("/(tabs)/prescriptions");
                return;
            }
            setPatient(null);
            setManualId("");
            setDiagnosis("");
            setAge("");
            setWeight("");
            setMeds([emptyMed()]);
            setExpiryDays(30);
            resetVisitState();
        } catch (e) {
            // Keep the review modal open on failure — closing it would
            // discard everything the doctor just reviewed and force them
            // to re-enter it all. The error shows inside the modal's
            // parent screen; they can retry Confirm or go Back to edit.
            setError(e instanceof Error ? e.message : "Failed to save prescription");
        } finally {
            setSubmitting(false);
        }
    };

    const openClinicalHistory = async () => {
        if (!patient) return;
        setHistoryOpen(true);
        // Re-fetch each time it is opened: the patient may have edited
        // their profile between two prescriptions in the same session.
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            setHistory(
                await rpc<ClinicalHistory>("app_get_patient_health_profile", {
                    p_patient_id: patient.id,
                })
            );
        } catch (e) {
            setHistoryError(e instanceof Error ? e.message : "Couldn't load clinical history");
        } finally {
            setHistoryLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                >
                    <ScreenHeader
                        title={editingId ? "Edit Prescription" : "Scan & Prescribe"}
                        subtitle={
                            editingId
                                ? "Editable for 1 day after issuing, until anything is dispensed"
                                : "Identify the patient, then build the prescription"
                        }
                    />

                    {error && !reviewDraft && <Banner kind="error" message={error} />}
                    {successMessage && <Banner kind="success" message={successMessage} />}

                    {!patient ? (
                        <Card>
                            <Button
                                title="Scan Patient QR Code"
                                icon="scan"
                                onPress={() => setScannerOpen(true)}
                            />
                            <View style={styles.divider}>
                                <View style={styles.dividerLine} />
                                <Text style={styles.dividerText}>or enter manually</Text>
                                <View style={styles.dividerLine} />
                            </View>
                            <Input
                                placeholder="Medical ID (e.g. AYU-200012345678)"
                                value={manualId}
                                onChangeText={setManualId}
                                autoCapitalize="characters"
                                autoCorrect={false}
                                onSubmitEditing={() => lookup(manualId)}
                            />
                            <Button
                                title="Look Up Patient"
                                variant="secondary"
                                loading={lookupLoading}
                                onPress={() => lookup(manualId)}
                            />
                        </Card>
                    ) : (
                        <>
                            <Card style={styles.patientCard}>
                                <View style={styles.patientAvatar}>
                                    <Ionicons name="person" size={22} color="#fff" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.patientName}>
                                        {patient.firstName} {patient.lastName}
                                    </Text>
                                    <Text style={styles.patientMeta}>
                                        {editingId
                                            ? `NIC ${patient.nicNumber} · Editing this prescription`
                                            : `NIC ${patient.nicNumber} · ${
                                                  patient.prescriptionsAsPatient.filter(
                                                      (p) => p.status !== "FULLY_DISPENSED" && p.status !== "EXPIRED"
                                                  ).length
                                              } active Rx`}
                                    </Text>
                                </View>
                                <Pressable
                                    onPress={
                                        editingId
                                            ? cancelEdit
                                            : () => {
                                                  setPatient(null);
                                                  setManualId("");
                                                  resetVisitState();
                                              }
                                    }
                                    style={styles.changeBtn}
                                >
                                    <Text style={styles.changeBtnText}>
                                        {editingId ? "Cancel" : "Change"}
                                    </Text>
                                </Pressable>
                            </Card>

                            <Pressable style={styles.historyBtn} onPress={openClinicalHistory}>
                                <Ionicons name="clipboard-outline" size={17} color={colors.primaryDark} />
                                <Text style={styles.historyBtnText}>Clinical history</Text>
                                <Ionicons name="chevron-forward" size={16} color={colors.primaryDark} />
                            </Pressable>

                            {!editingId && appointments.length > 0 && (
                                <>
                                    <Text style={styles.sectionTitle}>This Visit</Text>
                                    <AppointmentPicker
                                        appointments={appointments}
                                        selectedId={selectedAppointment?.id ?? null}
                                        onSelect={selectAppointment}
                                    />
                                </>
                            )}

                            <Text style={styles.sectionTitle}>Diagnosis</Text>
                            <Card style={{ marginBottom: spacing.md }}>
                                <Input
                                    placeholder="e.g. Upper Respiratory Tract Infection"
                                    value={diagnosis}
                                    onChangeText={setDiagnosis}
                                    style={{ marginBottom: 0 }}
                                />
                            </Card>

                            <Text style={styles.sectionTitle}>Age &amp; Weight (optional)</Text>
                            <Card style={{ marginBottom: spacing.md }}>
                                <View style={styles.row}>
                                    <View style={{ flex: 1 }}>
                                        <Input
                                            label="Age (years)"
                                            placeholder="e.g. 34"
                                            value={age}
                                            onChangeText={setAge}
                                            keyboardType="numeric"
                                            style={{ marginBottom: 0 }}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Input
                                            label="Weight (kg)"
                                            placeholder="e.g. 68"
                                            value={weight}
                                            onChangeText={setWeight}
                                            keyboardType="numeric"
                                            style={{ marginBottom: 0 }}
                                        />
                                    </View>
                                </View>
                            </Card>

                            <Text style={styles.sectionTitle}>Medications</Text>
                            {meds.map((med, i) => (
                                <Card key={i} style={{ marginBottom: 12 }}>
                                    <View style={styles.medHeader}>
                                        <Text style={styles.medTitle}>
                                            Medication {i + 1}
                                        </Text>
                                        {meds.length > 1 && (
                                            <Pressable
                                                onPress={() =>
                                                    setMeds((list) =>
                                                        list.filter((_, j) => j !== i)
                                                    )
                                                }
                                            >
                                                <Ionicons
                                                    name="trash-outline"
                                                    size={18}
                                                    color={colors.danger}
                                                />
                                            </Pressable>
                                        )}
                                    </View>
                                    <Input
                                        placeholder="Drug name (e.g. Amoxicillin 500mg)"
                                        value={med.drugName}
                                        onChangeText={(v) => updateMed(i, "drugName", v)}
                                    />
                                    <SelectField
                                        label="Route"
                                        placeholder="Select route"
                                        value={med.route}
                                        options={ROUTE_OPTIONS}
                                        onChange={(v) => updateMed(i, "route", v)}
                                    />
                                    <View style={styles.row}>
                                        <View style={{ flex: 1 }}>
                                            <Input
                                                label="Dosage Amount"
                                                placeholder="e.g. 500"
                                                value={med.dosageAmount}
                                                onChangeText={(v) => updateMed(i, "dosageAmount", v)}
                                                keyboardType="numeric"
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <SelectField
                                                label="Unit"
                                                placeholder="Select unit"
                                                value={med.dosageUnit}
                                                options={DOSAGE_UNITS}
                                                onChange={(v) => updateMed(i, "dosageUnit", v)}
                                            />
                                        </View>
                                    </View>
                                    <QuickPickField
                                        label="Frequency"
                                        placeholder="e.g. 1-0-1"
                                        value={med.frequency}
                                        onChangeText={(v) => updateMed(i, "frequency", v)}
                                        presets={FREQUENCY_PRESETS}
                                        mode="replace"
                                    />
                                    <QuickPickField
                                        label="Duration"
                                        placeholder="e.g. 7 days"
                                        value={med.duration}
                                        onChangeText={(v) => updateMed(i, "duration", v)}
                                        presets={DURATION_PRESETS}
                                        mode="replace"
                                    />
                                    <Input
                                        placeholder="Instructions (optional)"
                                        value={med.instructions}
                                        onChangeText={(v) =>
                                            updateMed(i, "instructions", v)
                                        }
                                        style={{ marginBottom: 0 }}
                                    />
                                </Card>
                            ))}

                            <Button
                                title="Add Another Medication"
                                variant="secondary"
                                icon="add"
                                onPress={() => setMeds((list) => [...list, emptyMed()])}
                                style={{ marginBottom: spacing.md }}
                            />

                            <Text style={styles.sectionTitle}>Prescription Expiry</Text>
                            <Card style={{ marginBottom: spacing.md }}>
                                <FilterChips<string>
                                    value={expiryDays === null ? "never" : String(expiryDays)}
                                    onChange={(v) => setExpiryDays(v === "never" ? null : Number(v))}
                                    options={[
                                        ...EXPIRY_PRESETS.map((d) => ({ key: String(d), label: `${d} days` })),
                                        { key: "never", label: "Never" },
                                    ]}
                                />
                                <Text style={styles.expiryHint}>
                                    {expiryDays === null
                                        ? "This prescription will never expire, even once fully dispensed."
                                        : `Automatically archives as expired ${expiryDays} days after issue — even if fully dispensed by then.`}
                                </Text>
                            </Card>

                            <Text style={styles.sectionTitle}>If It Doesn&apos;t Clear Up</Text>
                            <Card style={{ marginBottom: spacing.md }}>
                                <Text style={styles.followupHint}>
                                    What should the patient do if the problem is still there
                                    after finishing this course? AyuLink checks in with them
                                    automatically when the course ends.
                                </Text>
                                <FilterChips<FollowupPlan>
                                    value={followupPlan}
                                    onChange={(v) => {
                                        setFollowupPlan(v);
                                        if (v !== "REFER_DOCTOR") setReferredDoctor(null);
                                    }}
                                    options={FOLLOWUP_OPTIONS}
                                />

                                {followupPlan === "REFER_DOCTOR" && (
                                    <Pressable
                                        onPress={() => setReferralOpen(true)}
                                        style={styles.referralBox}
                                    >
                                        {referredDoctor ? (
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.referralName}>
                                                    Dr. {referredDoctor.firstName}{" "}
                                                    {referredDoctor.lastName}
                                                </Text>
                                                <Text style={styles.referralMeta}>
                                                    {[
                                                        referredDoctor.specialty,
                                                        referredDoctor.slmcRegNo
                                                            ? `SLMC ${referredDoctor.slmcRegNo}`
                                                            : null,
                                                    ]
                                                        .filter(Boolean)
                                                        .join("  ·  ")}
                                                </Text>
                                            </View>
                                        ) : (
                                            <Text style={styles.referralPlaceholder}>
                                                Choose a doctor to refer to…
                                            </Text>
                                        )}
                                        <Ionicons
                                            name="chevron-forward"
                                            size={16}
                                            color={colors.textMuted}
                                        />
                                    </Pressable>
                                )}
                            </Card>

                            <Button
                                title={editingId ? "Review Changes" : "Review & Sign"}
                                icon={editingId ? "checkmark" : "send"}
                                onPress={openReview}
                            />
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            <ReferralDoctorPicker
                visible={referralOpen}
                onClose={() => setReferralOpen(false)}
                onSelect={(doc) => {
                    setReferredDoctor(doc);
                    setReferralOpen(false);
                }}
            />

            <QRScannerModal
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScanned={lookup}
                title="Scan Patient Medical ID"
            />

            <PrescriptionConfirmModal
                draft={reviewDraft}
                submitting={submitting}
                error={error}
                onBack={() => setReviewDraft(null)}
                onConfirm={confirmIssue}
            />
            <ClinicalHistorySheet
                visible={historyOpen}
                loading={historyLoading}
                error={historyError}
                data={history}
                patientName={patient ? `${patient.firstName} ${patient.lastName}` : ""}
                onClose={() => setHistoryOpen(false)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
    divider: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginVertical: spacing.md,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: { fontSize: 12, color: colors.textMuted },
    historyBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.primarySoft,
        borderRadius: radius.sm,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: spacing.md,
    },
    historyBtnText: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.primaryDark },
    patientCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: spacing.md,
        backgroundColor: colors.primarySoft,
    },
    patientAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.primaryDark,
        alignItems: "center",
        justifyContent: "center",
    },
    patientName: { fontSize: 15, fontWeight: "800", color: colors.text },
    patientMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    changeBtn: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radius.full,
        backgroundColor: colors.surface,
    },
    changeBtnText: { fontSize: 12, fontWeight: "700", color: colors.primaryDark },
    sectionTitle: {
        fontSize: 15,
        fontWeight: "800",
        color: colors.text,
        marginBottom: spacing.sm,
    },
    medHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.sm,
    },
    medTitle: { fontSize: 13, fontWeight: "800", color: colors.primaryDark },
    row: { flexDirection: "row", gap: 12 },
    expiryHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 17 },
    followupHint: {
        fontSize: 12,
        color: colors.textMuted,
        lineHeight: 17,
        marginBottom: spacing.sm,
    },
    referralBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: spacing.sm,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
    },
    referralName: { fontSize: 13.5, fontWeight: "700", color: colors.text },
    referralMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    referralPlaceholder: { flex: 1, fontSize: 13, color: colors.textMuted },
});
