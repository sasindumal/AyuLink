// ==============================================
// AyuLink Patient - Appointment Card
// A lighter summary card — Reschedule/Cancel confirm
// and the full detail view now live in
// AppointmentDetailModal (tap the card to open it);
// the buttons here are shortcuts that go through the
// same shared confirmation flow the parent screen owns.
// ==============================================

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appointmentStatusMeta, colors, radius, spacing } from "../theme";
import { Button, Card, formatDate } from "./ui";
import type { Appointment } from "../types";

export function AppointmentCard({
    appointment,
    onReschedule,
    onRequestCancel,
    onPress,
    cancelling = false,
}: {
    appointment: Appointment;
    onReschedule: (appointment: Appointment) => void;
    onRequestCancel: (appointment: Appointment) => void;
    onPress?: (appointment: Appointment) => void;
    cancelling?: boolean;
}) {
    const a = appointment;
    const meta = appointmentStatusMeta[a.status];

    return (
        <Card style={styles.card}>
            <Pressable onPress={() => onPress?.(a)} disabled={!onPress}>
                <View style={styles.topRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.order}>{a.order_number}</Text>
                        <Text style={styles.date}>
                            {formatDate(a.appointment_date)} · {a.start_time.slice(0, 5)}–{a.end_time.slice(0, 5)}
                        </Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                </View>

                <View style={styles.infoRow}>
                    <Ionicons name="medkit" size={15} color={colors.textMuted} />
                    <Text style={styles.infoText}>
                        Dr. {a.doctor.firstName} {a.doctor.lastName}
                        {a.doctor.specialty ? `  ·  ${a.doctor.specialty}` : ""}
                    </Text>
                </View>
                <View style={styles.infoRow}>
                    <Ionicons name="business" size={15} color={colors.textMuted} />
                    <Text style={styles.infoText}>{a.channelingCenter.name}</Text>
                </View>

                {onPress && (
                    <View style={styles.detailsHint}>
                        <Text style={styles.detailsHintText}>Tap for details</Text>
                        <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
                    </View>
                )}
            </Pressable>

            {a.status === "BOOKED" && (
                <View style={styles.actions}>
                    <View style={{ flex: 1 }}>
                        <Button
                            title="Reschedule"
                            variant="secondary"
                            onPress={() => onReschedule(a)}
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Button
                            title="Cancel"
                            variant="danger-ghost"
                            loading={cancelling}
                            onPress={() => onRequestCancel(a)}
                        />
                    </View>
                </View>
            )}
        </Card>
    );
}

const styles = StyleSheet.create({
    card: { marginBottom: spacing.md },
    topRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.sm },
    order: { fontSize: 15, fontWeight: "800", color: colors.primaryDark, fontFamily: "monospace" },
    date: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { fontSize: 11.5, fontWeight: "700" },
    infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
    infoText: { fontSize: 13, color: colors.text, flex: 1 },
    detailsHint: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 8 },
    detailsHintText: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
    actions: { flexDirection: "row", gap: 10, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
});
