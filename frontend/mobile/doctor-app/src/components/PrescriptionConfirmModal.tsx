// ==============================================
// AyuLink Doctor - Prescription Review Modal
// Shown BEFORE a prescription is sent — everything about to be
// issued, with Back (keep editing) or Confirm & Issue (actually
// calls the RPC). Nothing is written to the database until the
// doctor taps Confirm.
// ==============================================

import React from "react";
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Banner, Button, formatDate } from "./ui";
import type { FollowupPlan, ReferralDoctor } from "../types";

export interface PrescriptionDraftItem {
    drugName: string;
    dosage: string;
    frequency: string;
    duration: string;
    route: string;
    instructions: string;
}

export interface PrescriptionDraft {
    patientName: string;
    medicalId?: string;
    diagnosis: string;
    age: number | null;
    weight: number | null;
    items: PrescriptionDraftItem[];
    expiryDays: number | null;
    followupPlan: FollowupPlan;
    referredDoctor: ReferralDoctor | null;
    /** Present when editing an existing prescription rather than issuing a new one. */
    editing?: boolean;
}

const FOLLOWUP_LABEL: Record<FollowupPlan, string> = {
    NONE: "Nothing specific if it doesn't clear up",
    MEET_SAME_DOCTOR: "Come back to you if it doesn't clear up",
    REFER_DOCTOR: "Refer onward if it doesn't clear up",
};

export function PrescriptionConfirmModal({
    draft,
    submitting = false,
    error,
    onBack,
    onConfirm,
}: {
    draft: PrescriptionDraft | null;
    submitting?: boolean;
    /** Shown inside the modal when a Confirm attempt failed — the modal
     *  stays open on failure so the doctor doesn't lose what they
     *  reviewed, and this is the only place they'd actually see it (the
     *  screen behind sits under the backdrop). */
    error?: string | null;
    onBack: () => void;
    onConfirm: () => void;
}) {
    if (!draft) return null;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onBack}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <View style={styles.headerIcon}>
                            <Ionicons name="document-text" size={24} color={colors.primaryDark} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>
                                {draft.editing ? "Confirm Changes" : "Confirm Prescription"}
                            </Text>
                            <Text style={styles.subtitle}>
                                For {draft.patientName}
                                {draft.medicalId ? ` · ${draft.medicalId}` : ""}
                            </Text>
                        </View>
                    </View>

                    <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                        <Text style={styles.diagnosisLabel}>Diagnosis</Text>
                        <Text style={styles.diagnosis}>{draft.diagnosis}</Text>

                        {(draft.age != null || draft.weight != null) && (
                            <Text style={styles.ageWeight}>
                                {[
                                    draft.age != null ? `Age ${draft.age}` : null,
                                    draft.weight != null ? `${draft.weight} kg` : null,
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </Text>
                        )}

                        <Text style={styles.sectionTitle}>Medications ({draft.items.length})</Text>
                        {draft.items.map((item, i) => (
                            <View key={i} style={styles.item}>
                                <Text style={styles.itemName}>{item.drugName}</Text>
                                <Text style={styles.itemDetail}>
                                    {item.route ? `${item.route} · ` : ""}
                                    {item.dosage} · {item.frequency} · {item.duration}
                                </Text>
                                {!!item.instructions && (
                                    <Text style={styles.itemInstructions}>{item.instructions}</Text>
                                )}
                            </View>
                        ))}

                        <View style={styles.divider} />

                        <View style={styles.metaRow}>
                            <Ionicons name="calendar-outline" size={15} color={colors.textMuted} />
                            <Text style={styles.metaText}>
                                {draft.expiryDays == null
                                    ? "Never expires"
                                    : `Expires ${formatDate(
                                          new Date(Date.now() + draft.expiryDays * 86400000).toISOString()
                                      )}`}
                            </Text>
                        </View>
                        <View style={styles.metaRow}>
                            <Ionicons name="return-up-forward-outline" size={15} color={colors.textMuted} />
                            <Text style={styles.metaText}>{FOLLOWUP_LABEL[draft.followupPlan]}</Text>
                        </View>
                        {draft.followupPlan === "REFER_DOCTOR" && draft.referredDoctor && (
                            <View style={[styles.metaRow, { marginLeft: 21 }]}>
                                <Text style={styles.metaTextStrong}>
                                    Dr. {draft.referredDoctor.firstName} {draft.referredDoctor.lastName}
                                    {draft.referredDoctor.specialty ? ` · ${draft.referredDoctor.specialty}` : ""}
                                </Text>
                            </View>
                        )}
                    </ScrollView>

                    {error && (
                        <View style={{ marginTop: spacing.sm }}>
                            <Banner kind="error" message={error} />
                        </View>
                    )}

                    <View style={styles.actions}>
                        <View style={{ flex: 1 }}>
                            <Button title="Back" variant="secondary" onPress={onBack} disabled={submitting} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Button
                                title={draft.editing ? "Confirm & Save" : "Confirm & Issue"}
                                icon="checkmark"
                                loading={submitting}
                                onPress={onConfirm}
                            />
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(28, 43, 26, 0.45)",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
    },
    card: {
        width: "100%",
        maxWidth: 440,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.lg,
    },
    header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: spacing.md },
    headerIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
    },
    title: { fontSize: 16, fontWeight: "800", color: colors.text },
    subtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    diagnosisLabel: { fontSize: 11.5, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
    diagnosis: { fontSize: 14.5, fontWeight: "700", color: colors.text, marginTop: 2, marginBottom: spacing.sm },
    ageWeight: { fontSize: 12, color: colors.textMuted, marginTop: -4, marginBottom: spacing.md },
    sectionTitle: { fontSize: 12.5, fontWeight: "800", color: colors.primaryDark, marginBottom: spacing.sm },
    item: {
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingVertical: 8,
    },
    itemName: { fontSize: 13.5, fontWeight: "700", color: colors.text },
    itemDetail: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    itemInstructions: { fontSize: 11.5, color: colors.textMuted, fontStyle: "italic", marginTop: 2 },
    divider: { height: 1, backgroundColor: colors.border, marginTop: spacing.sm, marginBottom: spacing.sm },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
    metaText: { fontSize: 12, color: colors.textMuted },
    metaTextStrong: { fontSize: 12, color: colors.text, fontWeight: "600" },
    actions: { flexDirection: "row", gap: 10, marginTop: spacing.md },
});
