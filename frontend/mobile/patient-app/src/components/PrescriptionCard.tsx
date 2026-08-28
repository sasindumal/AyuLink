// ==============================================
// AyuLink Mobile - Prescription Card
// Expandable card used in every prescription list
// ==============================================

import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { colors, radius, shadow, spacing, statusMeta } from "../theme";
import type { Prescription } from "../types";
import { Button, StatusBadge, formatDateTime } from "./ui";

export function PrescriptionCard({
    prescription,
    perspective,
    initiallyExpanded = false,
    statusOverride,
    footer,
    dimmed = false,
    showQrAction = false,
}: {
    prescription: Prescription;
    /** Which counterpart to show in the header */
    perspective: "patient" | "doctor" | "pharmacy";
    initiallyExpanded?: boolean;
    /** Replaces the raw status badge with a label that means something in
     *  the caller's context ("Ready", "1 of 2 left", "Done") — the stored
     *  status is a database state, not the answer to "what do I do now?". */
    statusOverride?: { label: string; color: string; bg: string };
    /** Rendered inside the card, under the summary line — expiry
     *  countdowns and next-dose rows belong to the card, not floating
     *  underneath it. */
    footer?: React.ReactNode;
    /** Visually retires a prescription whose collection window closed. */
    dimmed?: boolean;
    /** Surfaces the pharmacy QR without needing to expand the card first. */
    showQrAction?: boolean;
}) {
    const [expanded, setExpanded] = useState(initiallyExpanded);
    const [qrOpen, setQrOpen] = useState(false);
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
            style={[styles.card, { borderLeftColor: meta.color }, dimmed && styles.cardDimmed]}
        >
            <View style={styles.topRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.diagnosis, dimmed && styles.diagnosisDimmed]}>
                        {prescription.diagnosis}
                    </Text>
                    <Text style={styles.subline}>
                        {formatDateTime(prescription.dateIssued)}
                        {counterpart ? `  ·  ${counterpart}` : ""}
                    </Text>
                    {perspective === "patient" && doctorProfile && (
                        <Text style={styles.subline}>{doctorProfile.specialization}</Text>
                    )}
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                    {statusOverride ? (
                        <View style={[styles.overrideBadge, { backgroundColor: statusOverride.bg }]}>
                            <Text style={[styles.overrideBadgeText, { color: statusOverride.color }]}>
                                {statusOverride.label}
                            </Text>
                        </View>
                    ) : (
                        <StatusBadge status={prescription.status} />
                    )}
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

            {footer}

            {showQrAction && !expanded && (
                <Button
                    title="Show QR at pharmacy"
                    variant="secondary"
                    icon="qr-code"
                    onPress={() => setQrOpen(true)}
                    style={{ marginTop: spacing.sm }}
                />
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
                    {perspective === "patient" && (
                        <Text style={styles.expiryNote}>
                            {prescription.expiresAt
                                ? `Expires ${formatDateTime(prescription.expiresAt)}`
                                : "Never expires"}
                        </Text>
                    )}

                    {perspective === "patient" && (
                        prescription.status === "FULLY_DISPENSED" ? (
                            <Text style={styles.doneNote}>
                                Fully dispensed — no QR code needed
                            </Text>
                        ) : prescription.status === "EXPIRED" ? (
                            <Text style={styles.doneNote}>
                                Expired — this prescription can no longer be dispensed
                            </Text>
                        ) : (
                            <Button
                                title="Show QR to Pharmacy"
                                variant="secondary"
                                icon="qr-code"
                                onPress={() => setQrOpen(true)}
                                style={{ marginTop: spacing.sm }}
                            />
                        )
                    )}
                </View>
            )}

            {perspective === "patient" && (
                <Modal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
                    <Pressable style={styles.backdrop} onPress={() => setQrOpen(false)}>
                        <Pressable style={styles.qrCard} onPress={() => {}}>
                            <Text style={styles.qrTitle}>{prescription.diagnosis}</Text>
                            <Text style={styles.qrSubtitle}>
                                {counterpart ? `${counterpart} · ` : ""}
                                {formatDateTime(prescription.dateIssued)}
                            </Text>
                            <View style={styles.qrFrame}>
                                <QRCode
                                    value={prescription.id}
                                    size={210}
                                    color={colors.primaryDark}
                                    backgroundColor="#FFFFFF"
                                />
                            </View>
                            <Text style={styles.qrNote}>
                                Show this to the pharmacy for this prescription only —
                                it will not reveal your other prescriptions.
                            </Text>
                            <Pressable style={styles.qrClose} onPress={() => setQrOpen(false)}>
                                <Text style={styles.qrCloseText}>Close</Text>
                            </Pressable>
                        </Pressable>
                    </Pressable>
                </Modal>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    cardDimmed: { opacity: 0.62 },
    diagnosisDimmed: { textDecorationLine: "line-through", color: colors.textMuted },
    overrideBadge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
    overrideBadgeText: { fontSize: 11, fontWeight: "700" },
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
    expiryNote: {
        fontSize: 11,
        color: colors.textMuted,
        marginTop: 3,
    },
    doneNote: {
        fontSize: 12,
        color: colors.textMuted,
        fontStyle: "italic",
        marginTop: spacing.sm,
    },
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(28, 43, 26, 0.45)",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.lg,
    },
    qrCard: {
        width: "100%",
        maxWidth: 360,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.lg,
        alignItems: "center",
    },
    qrTitle: { fontSize: 16, fontWeight: "800", color: colors.text, textAlign: "center" },
    qrSubtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md, textAlign: "center" },
    qrFrame: {
        padding: 14,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: colors.primarySoft,
        backgroundColor: "#fff",
        marginBottom: spacing.md,
    },
    qrNote: {
        fontSize: 12,
        color: colors.textMuted,
        textAlign: "center",
        lineHeight: 17,
        marginBottom: spacing.md,
    },
    qrClose: { paddingVertical: 10, paddingHorizontal: spacing.lg },
    qrCloseText: { color: colors.textMuted, fontWeight: "700", fontSize: 13.5 },
});
