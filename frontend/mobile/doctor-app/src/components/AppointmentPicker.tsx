// ==============================================
// AyuLink Doctor - Appointment Picker
// After scanning a patient, pick which of YOUR OWN active
// appointments with them this consultation is for. Selecting
// one marks the visit started (the patient gets notified and
// it appears in their AI chat) and ties the prescription to
// that visit.
// ==============================================

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Card } from "./ui";
import type { DoctorPatientAppointment } from "../types";

function formatWhen(dateIso: string, startTime: string): string {
    const date = new Date(dateIso);
    const today = new Date();
    const sameDay =
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate();

    const day = sameDay
        ? "Today"
        : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return `${day} · ${startTime.slice(0, 5)}`;
}

export function AppointmentPicker({
    appointments,
    selectedId,
    onSelect,
}: {
    appointments: DoctorPatientAppointment[];
    selectedId: string | null;
    onSelect: (appointment: DoctorPatientAppointment) => void;
}) {
    return (
        <View style={{ marginBottom: spacing.md }}>
            {appointments.map((appt) => {
                const active = appt.id === selectedId;
                const alreadyPrescribed = !!appt.prescriptionId;
                return (
                    <Pressable key={appt.id} onPress={() => onSelect(appt)}>
                        <Card style={active ? [styles.card, styles.cardActive] : styles.card}>
                            <View style={styles.row}>
                                <View
                                    style={[
                                        styles.radio,
                                        active ? styles.radioActive : undefined,
                                    ]}
                                >
                                    {active && (
                                        <Ionicons name="checkmark" size={12} color="#fff" />
                                    )}
                                </View>

                                <View style={{ flex: 1 }}>
                                    <Text style={styles.when}>
                                        {formatWhen(appt.appointmentDate, appt.startTime)}
                                    </Text>
                                    {!!appt.channelingCenter && (
                                        <Text style={styles.center} numberOfLines={1}>
                                            {appt.channelingCenter.name}
                                            {appt.channelingCenter.city
                                                ? ` · ${appt.channelingCenter.city}`
                                                : ""}
                                        </Text>
                                    )}
                                    {!!appt.treatment && (
                                        <View style={styles.aiRow}>
                                            <Ionicons
                                                name="sparkles"
                                                size={12}
                                                color={colors.primaryDark}
                                            />
                                            <Text style={styles.aiText} numberOfLines={1}>
                                                AI triage: {appt.treatment.diseaseName}
                                            </Text>
                                        </View>
                                    )}
                                    {alreadyPrescribed && (
                                        <Text style={styles.warn}>
                                            A prescription was already issued for this visit
                                        </Text>
                                    )}
                                </View>

                                <Text style={styles.order}>{appt.orderNumber}</Text>
                            </View>
                        </Card>
                    </Pressable>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    card: { marginBottom: 10 },
    cardActive: { borderWidth: 1.5, borderColor: colors.primary },
    row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    radio: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 1,
    },
    radioActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    when: { fontSize: 14, fontWeight: "800", color: colors.text },
    center: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    aiRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
    aiText: { fontSize: 12, color: colors.primaryDark, fontWeight: "600", flexShrink: 1 },
    warn: { fontSize: 11.5, color: colors.warning, marginTop: 4, fontWeight: "600" },
    order: {
        fontSize: 11,
        color: colors.textMuted,
        fontFamily: "monospace",
        marginLeft: 6,
    },
});
