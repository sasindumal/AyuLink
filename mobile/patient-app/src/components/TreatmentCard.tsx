// ==============================================
// AyuLink Patient - Treatment Card
// One AI-assisted diagnosis session: condition,
// status, and (once booked) the linked appointment.
// ==============================================

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, treatmentStatusMeta } from "../theme";
import { Card, formatDate } from "./ui";
import type { Treatment } from "../types";

export function TreatmentCard({
    treatment,
    onPress,
}: {
    treatment: Treatment;
    onPress: (treatment: Treatment) => void;
}) {
    const meta = treatmentStatusMeta[treatment.status];

    return (
        <Pressable onPress={() => onPress(treatment)}>
            <Card style={styles.card}>
                <View style={styles.topRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.disease}>{treatment.disease_name}</Text>
                        {treatment.specialty && (
                            <Text style={styles.specialty}>{treatment.specialty}</Text>
                        )}
                    </View>
                    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                </View>

                {treatment.description && (
                    <Text style={styles.description} numberOfLines={2}>
                        {treatment.description}
                    </Text>
                )}

                <View style={styles.footerRow}>
                    <Text style={styles.date}>{formatDate(treatment.created_at)}</Text>
                    {treatment.appointment && (
                        <View style={styles.apptRow}>
                            <Ionicons name="calendar" size={13} color={colors.primaryDark} />
                            <Text style={styles.apptText}>{treatment.appointment.orderNumber}</Text>
                        </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
            </Card>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: { marginBottom: spacing.md },
    topRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
    disease: { fontSize: 15, fontWeight: "800", color: colors.text },
    specialty: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { fontSize: 11.5, fontWeight: "700" },
    description: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18, marginBottom: 8 },
    footerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
    date: { fontSize: 11.5, color: colors.textMuted, flex: 1 },
    apptRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    apptText: { fontSize: 11.5, fontWeight: "700", color: colors.primaryDark, fontFamily: "monospace" },
});
