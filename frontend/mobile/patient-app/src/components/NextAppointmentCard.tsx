// ==============================================
// AyuLink Patient - Next Appointment
// The soonest upcoming visit, given its own card above the list.
// Carries the address in full, because the common reason to open
// this tab is standing somewhere trying to work out where to go.
// ==============================================

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing, type } from "../theme";
import { Button } from "./ui";
import { openInMaps } from "../lib/maps";
import type { Appointment } from "../types";

/** "Today" / "Tomorrow" / "In 4 days" / "Mon 14 Sep" */
function relativeDay(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(date) - startOfDay(today)) / 86_400_000);

    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days > 1 && days <= 6) return `In ${days} days`;
    return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(startTime: string): string {
    const [h, m] = startTime.split(":").map(Number);
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function NextAppointmentCard({
    appointment,
    onPress,
    onReschedule,
}: {
    appointment: Appointment;
    onPress: (a: Appointment) => void;
    onReschedule: (a: Appointment) => void;
}) {
    const a = appointment;
    const center = a.channelingCenter;
    const soon = relativeDay(a.appointment_date);
    const isImminent = soon === "Today" || soon === "Tomorrow";

    return (
        <Pressable onPress={() => onPress(a)}>
            <View style={styles.card}>
                <View style={styles.topRow}>
                    <Text style={styles.label}>Next appointment</Text>
                    <View style={[styles.whenPill, isImminent && styles.whenPillSoon]}>
                        <Text style={[styles.whenPillText, isImminent && styles.whenPillTextSoon]}>
                            {soon}
                        </Text>
                    </View>
                </View>

                <Text style={styles.time}>{formatTime(a.start_time)}</Text>

                <Text style={styles.doctor}>
                    Dr. {a.doctor.firstName} {a.doctor.lastName}
                </Text>
                {!!a.doctor.specialty && <Text style={styles.meta}>{a.doctor.specialty}</Text>}

                {!!center && (
                    <View style={styles.addressRow}>
                        <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                        <Text style={styles.address}>
                            {center.name}
                            {center.address ? `\n${center.address}` : ""}
                            {center.city ? `, ${center.city}` : ""}
                        </Text>
                    </View>
                )}

                <View style={styles.actions}>
                    <View style={{ flex: 1 }}>
                        <Button
                            title="Directions"
                            variant="secondary"
                            icon="navigate"
                            onPress={() =>
                                openInMaps({
                                    name: center?.name,
                                    address: center?.address ?? "",
                                    city: center?.city,
                                    latitude: center?.latitude,
                                    longitude: center?.longitude,
                                })
                            }
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Button title="Reschedule" variant="secondary" onPress={() => onReschedule(a)} />
                    </View>
                </View>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1.5,
        borderColor: colors.primaryDark,
        padding: spacing.md,
        marginBottom: spacing.md,
        ...shadow.card,
    },
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    label: { ...type.label, color: colors.textMuted },
    whenPill: {
        backgroundColor: colors.primarySoft,
        borderRadius: radius.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    whenPillSoon: { backgroundColor: colors.warningSoft },
    whenPillText: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
    whenPillTextSoon: { color: colors.warningInk },
    time: {
        fontSize: 30,
        fontWeight: "800",
        color: colors.primaryDark,
        letterSpacing: -0.5,
        marginTop: 6,
    },
    doctor: { fontSize: 15.5, fontWeight: "700", color: colors.text, marginTop: 4 },
    meta: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
    addressRow: { flexDirection: "row", gap: 6, marginTop: spacing.sm, alignItems: "flex-start" },
    address: { flex: 1, fontSize: 12.5, color: colors.textMuted, lineHeight: 17 },
    actions: { flexDirection: "row", gap: 8, marginTop: spacing.md },
});
