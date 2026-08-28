// ==============================================
// AyuLink Mobile - Prescription Card
// Expandable card used in every prescription list
// ==============================================

import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing, statusMeta } from "../theme";
import type { Prescription } from "../types";
import { Button, StatusBadge, formatDateTime } from "./ui";

export function PrescriptionCard({
    prescription,
    perspective,
    initiallyExpanded = false,
    canModify = false,
    modifying = false,
    onEdit,
    onDelete,
}: {
    prescription: Prescription;
    /** Which counterpart to show in the header */
    perspective: "patient" | "doctor" | "pharmacy";
    initiallyExpanded?: boolean;
    /** Doctor perspective only — within the 1-day edit window and nothing dispensed yet */
    canModify?: boolean;
    modifying?: boolean;
    onEdit?: () => void;
    onDelete?: () => void;
}) {
    const [expanded, setExpanded] = useState(initiallyExpanded);
    const meta = statusMeta[prescription.status];

    const counterpart =
        perspective === "patient"
            ? prescription.doctor
                ? `Dr. ${prescription.doctor.firstName} ${prescription.doctor.lastName}`
                : undefined
            : prescription.patient
              ? `${prescription.patient.firstName} ${prescription.patient.lastName}`
              : undefined;

    const doctorProfile = prescription.doctor?.doctorProfile;

    return (
        <Pressable
            onPress={() => setExpanded((v) => !v)}
            style={[styles.card, { borderLeftColor: meta.color }]}
        >
            <View style={styles.topRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.diagnosis}>{prescription.diagnosis}</Text>
                    <Text style={styles.subline}>
                        {formatDateTime(prescription.dateIssued)}
                        {counterpart ? `  ·  ${counterpart}` : ""}
                    </Text>
                    {perspective === "patient" && doctorProfile && (
                        <Text style={styles.subline}>{doctorProfile.specialization}</Text>
                    )}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <StatusBadge status={prescription.status} />
                    <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={colors.textMuted}
                    />
                </View>
            </View>

            {!expanded && (
                <Text style={styles.collapsedNote}>
                    {prescription.items.length} medication
                    {prescription.items.length === 1 ? "" : "s"} — tap for details
                </Text>
            )}

            {expanded && (
                <View style={styles.itemsWrap}>
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
                    {prescription.items.map((item) => (
                        <View key={item.id} style={styles.item}>
                            <View style={styles.itemHeader}>
                                <View
                                    style={[
                                        styles.dot,
                                        {
                                            backgroundColor: item.dispensed
                                                ? colors.primary
                                                : colors.warning,
                                        },
                                    ]}
                                />
                                <Text style={styles.itemName}>{item.drugName}</Text>
                                {item.dispensed && (
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={16}
                                        color={colors.primary}
                                    />
                                )}
                            </View>
                            <Text style={styles.itemDetail}>
                                {item.route ? `${item.route} · ` : ""}
                                {item.dosage} · {item.frequency} · {item.duration}
                            </Text>
                            {!!item.instructions && (
                                <Text style={styles.itemInstructions}>
                                    {item.instructions}
                                </Text>
                            )}
                            {item.dispensed && item.dispensedBy && (
                                <Text style={styles.itemDispensedBy}>
                                    Dispensed
                                    {item.dispensedBy.pharmacyProfile
                                        ? ` by ${item.dispensedBy.pharmacyProfile.pharmacyName}`
                                        : ` by ${item.dispensedBy.firstName} ${item.dispensedBy.lastName}`}
                                    {item.dispensedAt
                                        ? ` · ${formatDateTime(item.dispensedAt)}`
                                        : ""}
                                </Text>
                            )}
                        </View>
                    ))}
                    <Text style={styles.rxId}>
                        Rx #{prescription.id.slice(0, 8).toUpperCase()}
                    </Text>

                    {perspective === "doctor" && canModify && (onEdit || onDelete) && (
                        <View style={styles.actionsRow}>
                            {onEdit && (
                                <View style={{ flex: 1 }}>
                                    <Button
                                        title="Edit"
                                        variant="secondary"
                                        icon="create-outline"
                                        onPress={onEdit}
                                        disabled={modifying}
                                    />
                                </View>
                            )}
                            {onDelete && (
                                <View style={{ flex: 1 }}>
                                    <Button
                                        title="Delete"
                                        variant="danger-ghost"
                                        icon="trash-outline"
                                        onPress={onDelete}
                                        loading={modifying}
                                    />
                                </View>
                            )}
                        </View>
                    )}
                </View>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderLeftWidth: 4,
        padding: spacing.md,
        marginBottom: 12,
        ...shadow.card,
    },
    topRow: {
        flexDirection: "row",
        alignItems: "flex-start",
    },
    diagnosis: {
        fontSize: 15.5,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 3,
    },
    subline: {
        fontSize: 12.5,
        color: colors.textMuted,
        marginBottom: 1,
    },
    collapsedNote: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 8,
    },
    itemsWrap: {
        marginTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: spacing.sm,
    },
    ageWeight: {
        fontSize: 12,
        fontWeight: "600",
        color: colors.textMuted,
        marginBottom: spacing.sm,
    },
    item: {
        paddingVertical: 8,
    },
    itemHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 2,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    itemName: {
        fontSize: 14,
        fontWeight: "700",
        color: colors.text,
        flexShrink: 1,
    },
    itemDetail: {
        fontSize: 12.5,
        color: colors.textMuted,
        marginLeft: 16,
    },
    itemInstructions: {
        fontSize: 12,
        color: colors.textMuted,
        fontStyle: "italic",
        marginLeft: 16,
        marginTop: 2,
    },
    itemDispensedBy: {
        fontSize: 11.5,
        color: colors.primaryDark,
        marginLeft: 16,
        marginTop: 3,
        fontWeight: "600",
    },
    rxId: {
        fontSize: 11,
        color: colors.textMuted,
        fontFamily: Platform.select({ ios: "Courier", default: "monospace" }),
        marginTop: 8,
    },
    actionsRow: { flexDirection: "row", gap: 10, marginTop: spacing.sm },
});
