// ==============================================
// AyuLink Doctor - Prescription Confirm Modal
// Full-detail confirmation shown right after a prescription
// is issued or edited, so the doctor can double-check exactly
// what was sent before moving on.
// ==============================================

import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Button, formatDate } from "./ui";
import type { Prescription } from "../types";

export function PrescriptionConfirmModal({
    prescription,
    edited = false,
    onClose,
}: {
    prescription: Prescription | null;
    edited?: boolean;
    onClose: () => void;
}) {
    if (!prescription) return null;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <View style={styles.headerIcon}>
                            <Ionicons name="checkmark-circle" size={26} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>
                                {edited ? "Prescription Updated" : "Prescription Issued"}
                            </Text>
                            <Text style={styles.subtitle}>
                                For {prescription.patient?.firstName} {prescription.patient?.lastName}
                                {prescription.patient?.medicalId ? ` · ${prescription.patient.medicalId}` : ""}
                            </Text>
                        </View>
                    </View>

                    <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                        <Text style={styles.diagnosisLabel}>Diagnosis</Text>
                        <Text style={styles.diagnosis}>{prescription.diagnosis}</Text>

                        {(prescription.patientAge != null || prescription.patientWeightKg != null) && (
                            <Text style={styles.ageWeight}>
                                {[
                                    prescription.patientAge != null ? `Age ${prescription.patientAge}` : null,
                                    prescription.patientWeightKg != null ? `${prescription.patientWeightKg} kg` : null,
                                ]
                                    .filter(Boolean)
                                    .join(" · ")}
                            </Text>
                        )}

                        <Text style={styles.sectionTitle}>
                            Medications ({prescription.items.length})
                        </Text>
                        {prescription.items.map((item) => (
                            <View key={item.id} style={styles.item}>
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
                                Issued {formatDate(prescription.dateIssued)}
                            </Text>
                        </View>
                        <View style={styles.metaRow}>
                            <Ionicons name="time-outline" size={15} color={colors.textMuted} />
                            <Text style={styles.metaText}>
                                {prescription.expiresAt
                                    ? `Expires ${formatDate(prescription.expiresAt)}`
                                    : "Never expires"}
                            </Text>
                        </View>
                    </ScrollView>

                    <Button title="Done" onPress={onClose} style={{ marginTop: spacing.md }} />
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
});
