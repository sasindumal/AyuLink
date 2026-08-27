// ==============================================
// AyuLink Patient - Booking Confirmation Modal
// Shown before a Diagnosis-flow "Book Now" tap
// actually commits the booking.
// ==============================================

import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Button } from "./ui";
import type { DoctorCard } from "../lib/agentChat";

function Row({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
    return (
        <View style={styles.row}>
            <Ionicons name={icon} size={16} color={colors.primaryDark} />
            <Text style={styles.rowText}>{text}</Text>
        </View>
    );
}

export function BookingConfirmModal({
    doctor,
    busy = false,
    onConfirm,
    onCancel,
}: {
    doctor: DoctorCard | null;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    if (!doctor) return null;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <Text style={styles.title}>Confirm Booking</Text>

                    <Row icon="medkit" text={`Dr. ${doctor.first_name} ${doctor.last_name}${doctor.specialty ? ` · ${doctor.specialty}` : ""}`} />
                    {doctor.channeling_center_name && (
                        <Row
                            icon="business"
                            text={`${doctor.channeling_center_name}${doctor.city ? `, ${doctor.city}` : ""}`}
                        />
                    )}
                    {doctor.address && <Row icon="location" text={doctor.address} />}
                    {doctor.date && (
                        <Row icon="calendar" text={`${doctor.date} · ${doctor.start_time}–${doctor.end_time}`} />
                    )}

                    <View style={styles.actions}>
                        <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
                            <Text style={styles.cancelText}>Back</Text>
                        </Pressable>
                        <View style={{ flex: 1 }}>
                            <Button title="Confirm Booking" onPress={onConfirm} loading={busy} />
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
        maxWidth: 420,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        padding: spacing.lg,
    },
    title: { fontSize: 17, fontWeight: "800", color: colors.text, marginBottom: spacing.md },
    row: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 10 },
    rowText: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 19 },
    actions: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: spacing.sm },
    cancelBtn: { paddingVertical: 12, paddingHorizontal: 6 },
    cancelText: { color: colors.textMuted, fontWeight: "700", fontSize: 13.5 },
});
