// ==============================================
// AyuLink Patient - Slot Card
// One shared card for every "book this slot" list in
// Appointments: Quick Search, By Doctor, and By Center.
// Only the fields relevant to context are shown — e.g.
// By Doctor's detail view already tells you who the
// doctor is, so the card just shows the center; Quick
// Search shows both since nothing is fixed yet.
// ==============================================

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Button, Card, formatDate } from "./ui";

export function SlotCard({
    doctorName,
    specialty,
    rating,
    centerName,
    address,
    city,
    distanceKm,
    date,
    startTime,
    endTime,
    onBook,
    booking = false,
    onViewOtherTimes,
}: {
    doctorName?: string;
    specialty?: string | null;
    rating?: number | null;
    centerName?: string;
    address?: string;
    city?: string | null;
    distanceKm?: number | null;
    date: string;
    startTime: string;
    endTime: string;
    onBook: () => void;
    booking?: boolean;
    onViewOtherTimes?: () => void;
}) {
    return (
        <Card style={styles.card}>
            {(doctorName || specialty) && (
                <View style={styles.topRow}>
                    <View style={{ flex: 1 }}>
                        {doctorName && <Text style={styles.name}>{doctorName}</Text>}
                        {specialty && <Text style={styles.specialty}>{specialty}</Text>}
                    </View>
                    {rating != null && (
                        <View style={styles.ratingPill}>
                            <Ionicons name="star" size={13} color={colors.warning} />
                            <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
                        </View>
                    )}
                </View>
            )}

            {centerName && (
                <View style={styles.infoRow}>
                    <Ionicons name="business" size={15} color={colors.textMuted} />
                    <Text style={styles.infoText}>{centerName}</Text>
                </View>
            )}
            {/* Own row, not buried after a possibly-long address — city
                matters for deciding whether this appointment is even
                reachable, so it gets a dedicated, bolder line. */}
            {city && (
                <View style={styles.infoRow}>
                    <Ionicons name="location-outline" size={15} color={colors.textMuted} />
                    <Text style={styles.cityText}>{city}</Text>
                </View>
            )}
            {address && (
                <View style={styles.infoRow}>
                    <Ionicons name="location" size={15} color={colors.textMuted} />
                    <Text style={styles.infoText}>
                        {address}
                        {distanceKm != null ? `  ·  ${distanceKm.toFixed(1)} km` : ""}
                    </Text>
                </View>
            )}
            <View style={styles.infoRow}>
                <Ionicons name="time" size={15} color={colors.textMuted} />
                <Text style={styles.infoText}>
                    {formatDate(date)}, {startTime.slice(0, 5)}–{endTime.slice(0, 5)}
                </Text>
            </View>

            <View style={styles.actionsRow}>
                {onViewOtherTimes && (
                    <Pressable
                        onPress={onViewOtherTimes}
                        hitSlop={8}
                        style={({ pressed }) => [styles.otherTimesBtn, pressed && { opacity: 0.6 }]}
                    >
                        <Text style={styles.otherTimes}>See other times with this doctor</Text>
                        <Ionicons name="chevron-forward" size={13} color={colors.primary} />
                    </Pressable>
                )}
                <View style={{ flex: 1 }}>
                    <Button title="Book" onPress={onBook} loading={booking} />
                </View>
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
    ratingText: { fontSize: 12.5, fontWeight: "700", color: colors.warningInk },
    infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
    infoText: { fontSize: 13, color: colors.text, flex: 1 },
    cityText: { fontSize: 13, fontWeight: "700", color: colors.primaryDark, flex: 1 },
    actionsRow: { marginTop: spacing.sm, gap: 10 },
    otherTimesBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        paddingVertical: 10,
        borderRadius: radius.sm,
        backgroundColor: colors.primarySoft,
    },
    otherTimes: { fontSize: 12.5, fontWeight: "700", color: colors.primary },
});
