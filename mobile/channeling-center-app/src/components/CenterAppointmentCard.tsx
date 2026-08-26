// ==============================================
// AyuLink Channeling Center - Appointment Card
// ==============================================

import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Button, Card, StatusBadge, formatDate } from "./ui";
import { ConfirmModal } from "./ConfirmModal";
import type { Appointment } from "../types";

export function CenterAppointmentCard({
    appointment,
    onCancel,
    onComplete,
    cancelling = false,
    completing = false,
}: {
    appointment: Appointment;
    onCancel: (id: string, reason: string) => void;
    onComplete: (id: string) => void;
    cancelling?: boolean;
    completing?: boolean;
}) {
    const [confirmCancel, setConfirmCancel] = useState(false);
    const a = appointment;

    return (
        <Card style={styles.card}>
            <View style={styles.topRow}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.order}>{a.order_number}</Text>
                    <Text style={styles.date}>
                        {formatDate(a.appointment_date)} · {a.start_time.slice(0, 5)}–{a.end_time.slice(0, 5)}
                    </Text>
                </View>
                <StatusBadge status={a.status} />
            </View>

            <View style={styles.infoRow}>
                <Ionicons name="person" size={15} color={colors.textMuted} />
                <Text style={styles.infoText}>
                    {a.patient.firstName} {a.patient.lastName}
                    {a.patient.medicalId ? `  ·  ${a.patient.medicalId}` : ""}
                </Text>
            </View>
            <View style={styles.infoRow}>
                <Ionicons name="medkit" size={15} color={colors.textMuted} />
                <Text style={styles.infoText}>
                    Dr. {a.doctor.firstName} {a.doctor.lastName}
                    {a.doctor.specialty ? `  ·  ${a.doctor.specialty}` : ""}
                </Text>
            </View>
            {a.reason && (
                <View style={styles.infoRow}>
                    <Ionicons name="chatbox-ellipses" size={15} color={colors.textMuted} />
                    <Text style={styles.infoText}>{a.reason}</Text>
                </View>
            )}

            {a.status === "BOOKED" && (
                <View style={styles.actions}>
                    <View style={{ flex: 1 }}>
                        <Button
                            title="Mark Complete"
                            variant="secondary"
                            loading={completing}
                            onPress={() => onComplete(a.id)}
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Button
                            title="Cancel"
                            variant="danger-ghost"
                            loading={cancelling}
                            onPress={() => setConfirmCancel(true)}
                        />
                    </View>
                </View>
            )}

            <ConfirmModal
                visible={confirmCancel}
                title="Cancel this appointment?"
                message={`${a.patient.firstName} ${a.patient.lastName} will be notified.`}
                confirmLabel="Cancel Appointment"
                destructive
                showReasonInput
                reasonPlaceholder="Reason (optional)"
                loading={cancelling}
                onConfirm={(reason) => {
                    setConfirmCancel(false);
                    onCancel(a.id, reason);
                }}
                onCancel={() => setConfirmCancel(false)}
            />
        </Card>
    );
}

const styles = StyleSheet.create({
    card: { marginBottom: spacing.md },
    topRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.sm },
    order: { fontSize: 15, fontWeight: "800", color: colors.primaryDark, fontFamily: "monospace" },
    date: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
    infoText: { fontSize: 13, color: colors.text, flex: 1 },
    actions: { flexDirection: "row", gap: 10, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
});
