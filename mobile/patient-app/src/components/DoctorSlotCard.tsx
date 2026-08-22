// ==============================================
// AyuLink Patient - Doctor Slot Search Result
// ==============================================

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Button, Card, formatDate } from "./ui";
import type { DoctorSlot } from "../types";

export function DoctorSlotCard({
    slot,
    onBook,
    booking = false,
}: {
    slot: DoctorSlot;
    onBook: (slot: DoctorSlot) => void;
    booking?: boolean;
}) {
    return (
        <Card style={styles.card}>
            <View style={styles.topRow}>
                <View style={{ flex: 1 }}>
                    <Text style={styles.name}>
                        Dr. {slot.doctorFirstName} {slot.doctorLastName}
                    </Text>
                    <Text style={styles.specialty}>{slot.specialty}</Text>
                </View>
                {slot.rating != null && (
                    <View style={styles.ratingPill}>
                        <Ionicons name="star" size={13} color={colors.warning} />
                        <Text style={styles.ratingText}>{slot.rating.toFixed(1)}</Text>
                    </View>
                )}
            </View>

            <View style={styles.infoRow}>
                <Ionicons name="business" size={15} color={colors.textMuted} />
                <Text style={styles.infoText}>{slot.channelingCenterName}</Text>
            </View>
            <View style={styles.infoRow}>
                <Ionicons name="location" size={15} color={colors.textMuted} />
                <Text style={styles.infoText}>
                    {slot.address}
                    {slot.district ? `  ·  ${slot.district}` : ""}
                    {slot.distanceKm != null ? `  ·  ${slot.distanceKm.toFixed(1)} km` : ""}
                </Text>
            </View>
            <View style={styles.infoRow}>
                <Ionicons name="time" size={15} color={colors.textMuted} />
                <Text style={styles.infoText}>
                    Next available: {formatDate(slot.nextAvailableDate)}, {slot.startTime.slice(0, 5)}–{slot.endTime.slice(0, 5)}
                </Text>
            </View>

            <View style={{ marginTop: spacing.sm }}>
                <Button title="Book this slot" onPress={() => onBook(slot)} loading={booking} />
            </View>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: { marginBottom: spacing.md },
    topRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.xs },
    name: { fontSize: 15.5, fontWeight: "800", color: colors.primaryDark },
    specialty: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    ratingPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: colors.warningSoft,
        borderRadius: radius.full,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    ratingText: { fontSize: 12.5, fontWeight: "700", color: "#9A6F00" },
    infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
    infoText: { fontSize: 13, color: colors.text, flex: 1 },
});
