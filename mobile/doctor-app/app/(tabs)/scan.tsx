// ==============================================
// AyuLink Doctor - Scan & Prescribe
// QR / manual patient lookup + prescription builder
// ==============================================

import React, { useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, spacing } from "../../src/theme";
import { Banner, Button, Card, Input, ScreenHeader } from "../../src/components/ui";
import { QRScannerModal } from "../../src/components/QRScannerModal";
import type { PatientLookup } from "../../src/types";

interface MedInput {
    drugName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
}

const emptyMed = (): MedInput => ({
    drugName: "",
    dosage: "",
    frequency: "",
    duration: "",
    instructions: "",
});

export default function Scan() {
    const { token } = useAuth();
    const [scannerOpen, setScannerOpen] = useState(false);
    const [manualId, setManualId] = useState("");
    const [lookupLoading, setLookupLoading] = useState(false);
    const [patient, setPatient] = useState<PatientLookup | null>(null);

    const [diagnosis, setDiagnosis] = useState("");
    const [meds, setMeds] = useState<MedInput[]>([emptyMed()]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const lookup = async (medicalId: string) => {
        setScannerOpen(false);
        if (!medicalId.trim()) return;
        setError(null);
        setSuccess(null);
        setLookupLoading(true);
        try {
            const data = await api<{ patient: PatientLookup }>(
                `/api/patients/${encodeURIComponent(medicalId.trim())}`,
                { token }
            );
            setPatient(data.patient);
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
            (m) => m.drugName.trim() || m.dosage.trim() || m.frequency.trim()
        );
        if (
            cleaned.length === 0 ||
            cleaned.some(
                (m) =>
                    !m.drugName.trim() ||
                    !m.dosage.trim() ||
                    !m.frequency.trim() ||
                    !m.duration.trim()
            )
        ) {
            setError(
                "Each medication needs a drug name, dosage, frequency, and duration"
            );
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            await api("/api/prescriptions", {
                method: "POST",
                token,
                body: {
                    patientId: patient.id,
                    diagnosis: diagnosis.trim(),
                    items: cleaned.map((m) => ({
                        drugName: m.drugName.trim(),
                        dosage: m.dosage.trim(),
                        frequency: m.frequency.trim(),
                        duration: m.duration.trim(),
                        instructions: m.instructions.trim(),
                    })),
                },
            });
            setSuccess(
                `Prescription issued for ${patient.firstName} ${patient.lastName}`
            );
            setPatient(null);
            setManualId("");
            setDiagnosis("");
            setMeds([emptyMed()]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to issue prescription");
        } finally {
            setSubmitting(false);
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
                        title="Scan & Prescribe"
                        subtitle="Identify the patient, then build the prescription"
                    />

                    {success && <Banner kind="success" message={success} />}
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
                                        NIC {patient.nicNumber} ·{" "}
                                        {
                                            patient.prescriptionsAsPatient.filter(
                                                (p) => p.status !== "FULLY_DISPENSED"
                                            ).length
                                        }{" "}
                                        active Rx
                                    </Text>
                                </View>
                                <Pressable
                                    onPress={() => {
                                        setPatient(null);
                                        setManualId("");
                                    }}
                                    style={styles.changeBtn}
                                >
                                    <Text style={styles.changeBtnText}>Change</Text>
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
                                                placeholder="Dosage"
                                                value={med.dosage}
                                                onChangeText={(v) =>
                                                    updateMed(i, "dosage", v)
                                                }
                                            />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Input
                                                placeholder="Frequency"
                                                value={med.frequency}
                                                onChangeText={(v) =>
                                                    updateMed(i, "frequency", v)
                                                }
                                            />
                                        </View>
                                    </View>
                                    <Input
                                        placeholder="Duration (e.g. 7 days)"
                                        value={med.duration}
                                        onChangeText={(v) => updateMed(i, "duration", v)}
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

                            <Button
                                title="Sign & Issue Prescription"
                                icon="send"
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
});
