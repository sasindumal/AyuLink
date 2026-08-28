// ==============================================
// AyuLink Patient - Today
// The morning question, answered: doses due, the next
// appointment, and one way into the assistant. Everything
// that used to compete for space here (the full diagnosis
// list) now lives on My Care — this screen is deliberately
// short.
// ==============================================

import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, shadow, spacing, type } from "../../src/theme";
import { Banner, Button, Card } from "../../src/components/ui";
import { openInMaps } from "../../src/lib/maps";
import type { Appointment } from "../../src/types";
import { ProfileButton } from "../../src/components/ProfileButton";
import { AyuBubble } from "../../src/components/AyuBubble";
import { ConfirmModal } from "../../src/components/ConfirmModal";
import { ayuSetEnabled, ayuSnooze, ayuStatus, type AyuStatus } from "../../src/lib/ayu";

interface DoseReminder {
    id: string;
    drugName: string;
    body: string;
    hour: number;
    minute: number;
}

function formatApptTime(dateStr: string, startTime: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    const day = sameDay(date, today)
        ? "Today"
        : sameDay(date, tomorrow)
          ? "Tomorrow"
          : date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    return `${day} · ${startTime.slice(0, 5)}`;
}

export default function Home() {
    const { user } = useAuth();
    // Ayu's own state. Kept here rather than inside the bubble so the
    // home screen can decide whether it should appear at all before
    // anything renders — a bubble that pops in after a beat reads as a
    // glitch.
    const [ayu, setAyu] = useState<AyuStatus | null>(null);
    const [ayuDismissed, setAyuDismissed] = useState(false);
    const [ayuOffOpen, setAyuOffOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [doses, setDoses] = useState<DoseReminder[]>([]);
    const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        rpc<number>("app_unread_notification_count")
            .then(setUnreadCount)
            .catch(() => {});

        try {
            const appts = await rpc<Appointment[]>("app_list_my_appointments");
            const upcoming = (appts ?? [])
                .filter((a) => a.status === "BOOKED")
                .sort((a, b) =>
                    `${a.appointment_date}${a.start_time}`.localeCompare(`${b.appointment_date}${b.start_time}`)
                );
            setNextAppointment(upcoming[0] ?? null);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load your appointments");
        }

        // Doses due today: every medication reminder is a DAILY repeating
        // local notification (see src/lib/reminders.ts), so "scheduled at
        // all" already means "due today" — no server round-trip needed.
        try {
            const scheduled = await Notifications.getAllScheduledNotificationsAsync();
            const meds = scheduled
                .filter((n) => n.content.data?.kind === "medication")
                .map((n) => {
                    // Daily reminders surface differently per platform: Android
                    // returns { type: "daily", hour, minute } directly, iOS
                    // returns { type: "calendar", dateComponents: { hour, minute } }
                    // for the same repeating schedule.
                    const trigger = n.trigger as
                        | { type?: string; hour?: number; minute?: number; dateComponents?: { hour?: number; minute?: number } }
                        | null;
                    const hour = trigger?.hour ?? trigger?.dateComponents?.hour ?? 0;
                    const minute = trigger?.minute ?? trigger?.dateComponents?.minute ?? 0;
                    return {
                        id: n.identifier,
                        drugName: (n.content.data?.drugName as string) ?? n.content.title ?? "Medication",
                        body: n.content.body ?? "",
                        hour,
                        minute,
                    };
                })
                .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
            setDoses(meds);
        } catch {
            setDoses([]);
        }

        setRefreshing(false);
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (user) load();
            // Best-effort: the assistant backend being asleep must never
            // hold up the home screen.
            ayuStatus().then(setAyu).catch(() => setAyu(null));
        }, [user, load])
    );

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            load();
                        }}
                        tintColor={colors.primaryDark}
                    />
                }
            >
                <View style={styles.headerRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.greeting}>Hi, {user?.firstName ?? "there"}</Text>
                        <Text style={styles.date}>
                            {new Date().toLocaleDateString(undefined, {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                            })}
                        </Text>
                    </View>
                    <View style={styles.headerActions}>
                        <Pressable
                            onPress={() => router.push("/notifications")}
                            style={[styles.iconButton, { backgroundColor: colors.primarySoft }]}
                        >
                            <Ionicons name="notifications-outline" size={22} color={colors.primaryDark} />
                            {unreadCount > 0 && (
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
                                </View>
                            )}
                        </Pressable>
                        <ProfileButton
                            firstName={user?.firstName}
                            lastName={user?.lastName}
                            onPress={() => router.push("/profile")}
                        />
                    </View>
                </View>

                {error && <Banner kind="error" message={error} />}

                {doses.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Today's doses</Text>
                        {doses.map((d) => (
                            <View key={d.id} style={styles.doseRow}>
                                <View style={styles.doseCheckbox} />
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.doseTitle}>
                                        {d.drugName} — {formatHour(d.hour, d.minute)}
                                    </Text>
                                    {!!d.body && (
                                        <Text style={styles.doseBody} numberOfLines={1}>
                                            {d.body}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        ))}
                    </>
                )}

                {nextAppointment && (
                    <Card style={styles.apptCard}>
                        <Text style={styles.label}>Next appointment</Text>
                        <Text style={styles.apptDoctor}>
                            Dr. {nextAppointment.doctor.firstName} {nextAppointment.doctor.lastName}
                        </Text>
                        <Text style={styles.apptMeta}>
                            {formatApptTime(nextAppointment.appointment_date, nextAppointment.start_time)}
                            {nextAppointment.channelingCenter?.name ? ` · ${nextAppointment.channelingCenter.name}` : ""}
                        </Text>
                        <View style={styles.apptActions}>
                            <Button
                                title="Directions"
                                variant="secondary"
                                icon="navigate"
                                onPress={() =>
                                    openInMaps({
                                        name: nextAppointment.channelingCenter?.name,
                                        address: nextAppointment.channelingCenter?.address ?? "",
                                        city: nextAppointment.channelingCenter?.city,
                                        latitude: nextAppointment.channelingCenter?.latitude,
                                        longitude: nextAppointment.channelingCenter?.longitude,
                                    })
                                }
                                style={{ flex: 1 }}
                            />
                            <Button
                                title="View"
                                variant="secondary"
                                onPress={() => router.push("/(tabs)/appointments")}
                                style={{ flex: 1 }}
                            />
                        </View>
                    </Card>
                )}

                <Card style={styles.diagnosisCard}>
                    <View style={styles.diagnosisIcon}>
                        <Ionicons name="pulse" size={26} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.diagnosisTitle}>Feeling unwell?</Text>
                        <Text style={styles.diagnosisSubtitle}>
                            Describe your symptoms and we'll help you find a doctor.
                        </Text>
                        <Button
                            title="Diagnosis"
                            icon="chatbubble-ellipses"
                            onPress={() => router.push("/diagnosis")}
                            style={{ marginTop: spacing.sm }}
                        />
                    </View>
                </Card>

                <Pressable onPress={() => router.push("/(tabs)/medical-id")}>
                    <Card style={styles.idCard}>
                        <View style={styles.idIcon}>
                            <Ionicons name="qr-code" size={26} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.idTitle}>My Medical ID</Text>
                            <Text style={styles.idValue}>{user?.medicalId}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.primaryDark} />
                    </Card>
                </Pressable>

                <Pressable onPress={() => router.push("/(tabs)/treatments")} style={styles.careLink}>
                    <Text style={styles.careLinkText}>See your full care history</Text>
                    <Ionicons name="arrow-forward" size={15} color={colors.primaryDark} />
                </Pressable>
            </ScrollView>

            <AyuBubble
                visible={!!ayu?.enabled}
                prompting={!!ayu?.dueForCheckin && !ayuDismissed}
                label={
                    ayu?.everCompleted
                        ? `${ayu.missingCount} thing${ayu.missingCount === 1 ? "" : "s"} still missing from your health profile.`
                        : "Let's set up your health profile so doctors know your background."
                }
                onPress={() =>
                    router.push({
                        pathname: "/ayu",
                        params: { mode: ayu?.everCompleted ? "CHECKIN" : "INTAKE" },
                    })
                }
                onDismiss={() => {
                    setAyuDismissed(true);
                    // A dismiss is a SNOOZE, not an off switch — it pushes
                    // the next nudge out a month. Turning Ayu off entirely
                    // is the long-press below, or Profile > Health.
                    ayuSnooze();
                }}
                onLongPress={() => setAyuOffOpen(true)}
            />

            <ConfirmModal
                visible={ayuOffOpen}
                title="Turn Ayu off?"
                message="The bubble disappears and Ayu stops checking in. Your health profile stays exactly as it is, and you can switch Ayu back on from your profile."
                confirmLabel="Turn off"
                destructive
                onConfirm={async () => {
                    setAyuOffOpen(false);
                    if (!ayu) return;
                    setAyu({ ...ayu, enabled: false });
                    await ayuSetEnabled(false).catch(() => setAyu(ayu));
                }}
                onCancel={() => setAyuOffOpen(false)}
            />
        </SafeAreaView>
    );
}

function formatHour(hour: number, minute: number): string {
    const h = hour % 12 === 0 ? 12 : hour % 12;
    const ampm = hour < 12 ? "AM" : "PM";
    return `${h}:${String(minute).padStart(2, "0")} ${ampm}`;
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
    headerRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.lg },
    greeting: { ...type.display, color: colors.text },
    date: { ...type.caption, color: colors.textMuted, marginTop: 2 },
    headerActions: { flexDirection: "row", gap: 8 },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: radius.sm,
        alignItems: "center",
        justifyContent: "center",
    },
    badge: {
        position: "absolute",
        top: -2,
        right: -2,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        paddingHorizontal: 3,
        backgroundColor: colors.danger,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: colors.background,
    },
    badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
    sectionTitle: { ...type.label, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.sm },
    doseRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.primarySoft,
        borderRadius: radius.md,
        padding: spacing.sm + 2,
        marginBottom: spacing.sm,
    },
    doseCheckbox: {
        width: 18,
        height: 18,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: colors.primaryDark,
    },
    doseTitle: { fontSize: 13, fontWeight: "700", color: colors.primaryDark },
    doseBody: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
    label: { ...type.label, color: colors.textMuted },
    apptCard: { marginTop: spacing.sm, marginBottom: spacing.md },
    apptDoctor: { fontSize: 15, fontWeight: "700", color: colors.text, marginTop: 4 },
    apptMeta: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    apptActions: { flexDirection: "row", gap: 8, marginTop: spacing.sm },
    diagnosisCard: {
        flexDirection: "row",
        gap: spacing.md,
        marginBottom: spacing.md,
        ...shadow.card,
    },
    diagnosisIcon: {
        width: 52,
        height: 52,
        borderRadius: radius.md,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    diagnosisTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
    diagnosisSubtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 3, lineHeight: 17 },
    idCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        marginBottom: spacing.md,
    },
    idIcon: {
        width: 52,
        height: 52,
        borderRadius: radius.md,
        backgroundColor: colors.primaryDark,
        alignItems: "center",
        justifyContent: "center",
    },
    idTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
    idValue: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, fontFamily: "monospace" },
    careLink: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: spacing.sm,
    },
    careLinkText: { color: colors.primaryDark, fontWeight: "700", fontSize: 13.5 },
});
