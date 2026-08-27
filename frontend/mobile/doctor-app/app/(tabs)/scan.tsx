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
import { PrescriptionConfirmModal } from "../../src/components/PrescriptionConfirmModal";
import type { PatientLookup, Prescription } from "../../src/types";

const DOSAGE_UNITS = ["mg", "g", "mcg", "ml", "IU", "tablet(s)", "capsule(s)", "drop(s)", "puff(s)", "tsp"];
const FREQUENCY_PRESETS = [
    "1-0-0", "0-1-0", "0-0-1", "1-0-1", "1-1-1", "2-1-2",
    "Once daily", "Twice daily", "Three times daily", "As needed (PRN)",
];
const DURATION_PRESETS = ["3 days", "5 days", "7 days", "10 days", "14 days", "1 month", "Ongoing"];
const EXPIRY_PRESETS = [7, 14, 30, 60, 90];

interface MedInput {
    drugName: string;
    dosageAmount: string;
    dosageUnit: string;
    frequency: string;
    duration: string;
    instructions: string;
}

const emptyMed = (): MedInput => ({
    drugName: "",
    dosageAmount: "",
    dosageUnit: "",
    frequency: "",
    duration: "",
    instructions: "",
});

function splitDosage(dosage: string): { amount: string; unit: string } {
    const idx = dosage.indexOf(" ");
    if (idx === -1) return { amount: dosage, unit: "" };
    return { amount: dosage.slice(0, idx), unit: dosage.slice(idx + 1) };
}

export default function Scan() {
    const params = useLocalSearchParams<{ editId?: string; editPayload?: string }>();
    const [editingId, setEditingId] = useState<string | null>(null);

    const [scannerOpen, setScannerOpen] = useState(false);
    const [manualId, setManualId] = useState("");
    const [lookupLoading, setLookupLoading] = useState(false);
    const [patient, setPatient] = useState<PatientLookup | null>(null);

    const [diagnosis, setDiagnosis] = useState("");
    const [meds, setMeds] = useState<MedInput[]>([emptyMed()]);
    const [expiryDays, setExpiryDays] = useState<number | null>(30);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmResult, setConfirmResult] = useState<Prescription | null>(null);
    const [wasEdit, setWasEdit] = useState(false);

    // Prefill the form from an existing prescription when reached
    // via "Edit" on the Issued tab.
    useEffect(() => {
        if (!params.editId || !params.editPayload) return;
        try {
            const p: Prescription = JSON.parse(params.editPayload);
            setEditingId(p.id);
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
            setMeds(
                p.items.map((item) => {
                    const { amount, unit } = splitDosage(item.dosage);
                    return {
                        drugName: item.drugName,
                        dosageAmount: amount,
                        dosageUnit: unit,
                        frequency: item.frequency,
                        duration: item.duration,
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

    const cancelEdit = () => {
        setEditingId(null);
        setPatient(null);
        setDiagnosis("");
        setMeds([emptyMed()]);
        setExpiryDays(30);
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
        } catch (e) {
            setError(e instanceof Error ? e.message : "Patient not found");
        } finally {
            setLookupLoading(false);
        }
    };

    const updateMed = (index: number, key: keyof MedInput, value: string) =>
        setMeds((list) =>
            list.map((m, i) => (i === index ? { ...m, [key]: value } : m))
        );

    const submit = async () => {
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
        setError(null);
        setSubmitting(true);
        try {
            const items = cleaned.map((m) => ({
                drugName: m.drugName.trim(),
                dosage: `${m.dosageAmount.trim()} ${m.dosageUnit.trim()}`.trim(),
                frequency: m.frequency.trim(),
                duration: m.duration.trim(),
                instructions: m.instructions.trim(),
            }));

            const result = editingId
                ? await rpc<Prescription>("app_update_prescription", {
                      p_prescription_id: editingId,
                      p_diagnosis: diagnosis.trim(),
                      p_items: items,
                      p_expiry_days: expiryDays,
                  })
                : await rpc<Prescription>("app_create_prescription", {
                      p_patient_id: patient.id,
                      p_diagnosis: diagnosis.trim(),
                      p_items: items,
                      p_expiry_days: expiryDays,
                  });

            setWasEdit(!!editingId);
            setConfirmResult(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save prescription");
        } finally {
            setSubmitting(false);
        }
    };

    const closeConfirm = () => {
        setConfirmResult(null);
        if (editingId) {
            setEditingId(null);
            router.replace("/(tabs)/prescriptions");
            return;
        }
        setPatient(null);
        setManualId("");
        setDiagnosis("");
        setMeds([emptyMed()]);
        setExpiryDays(30);
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

                    {error && <Banner kind="error" message={error} />}

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
                                              }
                                    }
                                    style={styles.changeBtn}
                                >
                                    <Text style={styles.changeBtnText}>
                                        {editingId ? "Cancel" : "Change"}
                                    </Text>
                                </Pressable>
                            </Card>

                            <Text style={styles.sectionTitle}>Diagnosis</Text>
                            <Card style={{ marginBottom: spacing.md }}>
                                <Input
                                    placeholder="e.g. Upper Respiratory Tract Infection"
                                    value={diagnosis}
                                    onChangeText={setDiagnosis}
                                    style={{ marginBottom: 0 }}
                                />
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

                            <Button
                                title={editingId ? "Save Changes" : "Sign & Issue Prescription"}
                                icon={editingId ? "checkmark" : "send"}
                                loading={submitting}
                                onPress={submit}
                            />
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            <QRScannerModal
                visible={scannerOpen}
                onClose={() => setScannerOpen(false)}
                onScanned={lookup}
                title="Scan Patient Medical ID"
            />

            <PrescriptionConfirmModal
                prescription={confirmResult}
                edited={wasEdit}
                onClose={closeConfirm}
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
});
