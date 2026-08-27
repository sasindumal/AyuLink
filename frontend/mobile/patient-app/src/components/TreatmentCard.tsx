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

// Care-level tag shown next to the specialty — derived from the same
// "General Practitioner" convention the backend's disease/doctor-finder
// agents already route on (Dataset_ref's disease catalog curates every
// common, everyday condition to that exact specialty name), so this
// never needs its own separate field or can drift out of sync with it.
const GENERAL_PRACTITIONER = "General Practitioner";

function careLevel(specialty: string | null | undefined): "Primary Care" | "Specialist Care" | null {
    if (!specialty) return null;
    return specialty === GENERAL_PRACTITIONER ? "Primary Care" : "Specialist Care";
}

export function TreatmentCard({
    treatment,
    onPress,
    onDelete,
    onTogglePin,
}: {
    treatment: Treatment;
    onPress: (treatment: Treatment) => void;
    onDelete?: (treatment: Treatment) => void;
    onTogglePin?: (treatment: Treatment) => void;
}) {
    const meta = treatmentStatusMeta[treatment.status];
    const level = careLevel(treatment.specialty);

    return (
        <Pressable onPress={() => onPress(treatment)}>
            <Card style={treatment.pinned ? [styles.card, styles.cardPinned] : styles.card}>
                <View style={styles.topRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.disease}>{treatment.disease_name}</Text>
                        {(treatment.specialty || level) && (
                            <Text style={styles.specialty} numberOfLines={1}>
                                {treatment.specialty}
                                {treatment.specialty && level ? "  ·  " : ""}
                                {level}
                            </Text>
                        )}
                    </View>
                    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    {onTogglePin && (
                        <Pressable
                            onPress={(e) => {
                                e.stopPropagation();
                                onTogglePin(treatment);
                            }}
                            hitSlop={8}
                            style={styles.pinBtn}
                        >
                            <Ionicons
                                name={treatment.pinned ? "pin" : "pin-outline"}
                                size={16}
                                color={treatment.pinned ? colors.primaryDark : colors.textMuted}
                            />
                        </Pressable>
                    )}
                    {onDelete && (
                        <Pressable
                            onPress={(e) => {
                                e.stopPropagation();
                                onDelete(treatment);
                            }}
                            hitSlop={8}
                            style={styles.deleteBtn}
                        >
                            <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </Pressable>
                    )}
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
    cardPinned: { borderWidth: 1.5, borderColor: colors.primarySoft },
    topRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
    disease: { fontSize: 15, fontWeight: "800", color: colors.text },
    specialty: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { fontSize: 11.5, fontWeight: "700" },
    pinBtn: { marginLeft: 8, padding: 4 },
    deleteBtn: { marginLeft: 4, padding: 4 },
    description: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18, marginBottom: 8 },
    footerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
    date: { fontSize: 11.5, color: colors.textMuted, flex: 1 },
    apptRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    apptText: { fontSize: 11.5, fontWeight: "700", color: colors.primaryDark, fontFamily: "monospace" },
});
