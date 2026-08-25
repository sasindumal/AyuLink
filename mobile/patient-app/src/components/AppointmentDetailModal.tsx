// ==============================================
// AyuLink Patient - Appointment Detail Modal
// Full booking detail + "Open in Maps" for the
// channeling center's address.
// ==============================================

import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appointmentStatusMeta, colors, radius, spacing } from "../theme";
import { Button, formatDate } from "./ui";
import { openInMaps } from "../lib/maps";
import type { Appointment } from "../types";

function DetailRow({
    icon,
    label,
    value,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
}) {
    return (
        <View style={styles.detailRow}>
            <Ionicons name={icon} size={17} color={colors.primaryDark} style={{ marginTop: 1 }} />
            <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
            </View>
        </View>
    );
}

export function AppointmentDetailModal({
    appointment,
    onClose,
}: {
    appointment: Appointment | null;
    onClose: () => void;
}) {
    if (!appointment) return null;
    const a = appointment;
    const meta = appointmentStatusMeta[a.status];

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <View style={styles.header}>
                        <Text style={styles.order}>{a.order_number}</Text>
                        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                    </View>

                    <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                        <DetailRow
                            icon="medkit"
                            label="Doctor"
                            value={`Dr. ${a.doctor.firstName} ${a.doctor.lastName}${
                                a.doctor.specialty ? ` · ${a.doctor.specialty}` : ""
                            }`}
                        />
                        <DetailRow
                            icon="calendar"
                            label="Date & Time"
                            value={`${formatDate(a.appointment_date)} · ${a.start_time.slice(
                                0,
                                5
                            )}–${a.end_time.slice(0, 5)}`}
                        />
                        <DetailRow icon="business" label="Channeling Center" value={a.channelingCenter.name} />
                        <DetailRow
                            icon="location"
                            label="Address"
                            value={
                                a.channelingCenter.city
                                    ? `${a.channelingCenter.address}, ${a.channelingCenter.city}`
                                    : a.channelingCenter.address
                            }
                        />
                        <DetailRow icon="call" label="Contact" value={a.channelingCenter.contactNumber} />
                        {a.reason && <DetailRow icon="document-text" label="Reason" value={a.reason} />}
                        {a.status === "CANCELLED" && a.cancelled_reason && (
                            <DetailRow icon="close-circle" label="Cancellation Reason" value={a.cancelled_reason} />
                        )}
                    </ScrollView>

                    <View style={styles.actions}>
                        <Button
                            title="Open in Maps"
                            variant="secondary"
                            icon="navigate"
                            onPress={() =>
                                openInMaps({
                                    name: a.channelingCenter.name,
                                    address: a.channelingCenter.address,
                                    city: a.channelingCenter.city,
                                })
                            }
                            style={{ flex: 1 }}
                        />
                    </View>

                    <Pressable style={styles.closeBtn} onPress={onClose}>
                        <Text style={styles.closeText}>Close</Text>
                    </Pressable>
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
    header: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
    order: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.primaryDark, fontFamily: "monospace" },
    badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { fontSize: 11.5, fontWeight: "700" },
    detailRow: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
    detailLabel: { fontSize: 11.5, color: colors.textMuted, fontWeight: "600" },
    detailValue: { fontSize: 13.5, color: colors.text, marginTop: 2, lineHeight: 18 },
    actions: { flexDirection: "row", gap: 10, marginTop: spacing.sm },
    closeBtn: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
    closeText: { color: colors.textMuted, fontWeight: "700", fontSize: 13.5 },
});
