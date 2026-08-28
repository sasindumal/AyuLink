// ==============================================
// AyuLink Doctor - Today
// A doctor's first question is "who's next?" — this is that
// screen, not a generic dashboard. Stats at a glance, then the
// day's list with the next patient surfaced first.
// ==============================================

import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, spacing, type } from "../../src/theme";
import { Banner, Button, Card } from "../../src/components/ui";
import type { DoctorClinicAppointment } from "../../src/types";
import { ProfileButton } from "../../src/components/ProfileButton";

function greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
}

export default function Home() {
    const { user } = useAuth();
    const [list, setList] = useState<DoctorClinicAppointment[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        rpc<number>("app_unread_notification_count").then(setUnreadCount).catch(() => {});
        try {
            const data = await rpc<DoctorClinicAppointment[]>("app_doctor_today_appointments");
            setList(data ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load today's list");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (user) load();
        }, [user, load])
    );

    const seen = list.filter((a) => a.doctorStartedAt).length;
    const pendingRx = list.filter((a) => a.doctorStartedAt && !a.prescriptionId).length;
    const waiting = list.filter((a) => !a.doctorStartedAt);
    const upNext = waiting[0] ?? null;
    const rest = waiting.slice(1);

    const startVisit = (appt: DoctorClinicAppointment) => {
        router.push({
            pathname: "/(tabs)/scan",
            params: { medicalId: appt.patient.medicalId },
        });
    };

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
                        <Text style={styles.greeting}>
                            {greeting()}, Dr. {user?.lastName ?? ""}
                        </Text>
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

                {user?.verified === false && (
                    <Banner
                        kind="info"
                        message="Your SLMC credentials are still being verified — you can use the app as normal in the meantime."
                    />
                )}
                {error && <Banner kind="error" message={error} />}

                <View style={styles.stats}>
                    <View style={styles.stat}>
                        <Text style={styles.statNum}>{list.length}</Text>
                        <Text style={styles.statLabel}>Booked</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={styles.statNum}>{seen}</Text>
                        <Text style={styles.statLabel}>Seen</Text>
                    </View>
                    <View style={styles.stat}>
                        <Text style={styles.statNum}>{pendingRx}</Text>
                        <Text style={styles.statLabel}>Pending Rx</Text>
                    </View>
                </View>

                {upNext && (
                    <>
                        <Text style={styles.sectionTitle}>Up next</Text>
                        <Card style={styles.upNextCard}>
                            <View style={styles.row}>
                                <Text style={styles.time}>{upNext.startTime.slice(0, 5)}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.patientName}>
                                        {upNext.patient.firstName} {upNext.patient.lastName}
                                    </Text>
                                    <Text style={styles.meta}>
                                        {upNext.treatment
                                            ? `AI triage: ${upNext.treatment.diseaseName}`
                                            : upNext.channelingCenter?.name ?? ""}
                                    </Text>
                                </View>
                                <View style={styles.pill}>
                                    <Text style={styles.pillText}>Waiting</Text>
                                </View>
                            </View>
                            <Button
                                title="Start visit"
                                icon="medkit"
                                onPress={() => startVisit(upNext)}
                                style={{ marginTop: spacing.sm }}
                            />
                        </Card>
                    </>
                )}

                {rest.length > 0 && (
                    <>
                        <Text style={styles.sectionTitle}>Later today</Text>
                        {rest.map((a) => (
                            <Card key={a.id} style={styles.row}>
                                <Text style={styles.time}>{a.startTime.slice(0, 5)}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.patientName}>
                                        {a.patient.firstName} {a.patient.lastName}
                                    </Text>
                                    <Text style={styles.meta}>
                                        {a.treatment ? `AI triage: ${a.treatment.diseaseName}` : "New patient"}
                                    </Text>
                                </View>
                            </Card>
                        ))}
                    </>
                )}

                {!loading && list.length === 0 && !error && (
                    <Card style={{ alignItems: "center", paddingVertical: spacing.lg }}>
                        <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
                        <Text style={styles.meta}>Nothing booked for today.</Text>
                    </Card>
                )}

                <Pressable onPress={() => router.push("/(tabs)/scan")}>
                    <Card style={styles.scanCard}>
                        <View style={styles.scanIcon}>
                            <Ionicons name="scan" size={22} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.scanTitle}>Scan a patient</Text>
                            <Text style={styles.meta}>For a walk-in, or someone not on today's list</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.primaryDark} />
                    </Card>
                </Pressable>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
    headerRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.lg },
    greeting: { ...type.title, color: colors.text },
    date: { ...type.caption, color: colors.textMuted, marginTop: 2 },
    headerActions: { flexDirection: "row", gap: 8 },
    iconButton: { width: 40, height: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
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
    stats: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
    stat: {
        flex: 1,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: spacing.sm + 2,
    },
    statNum: { fontSize: 22, fontWeight: "800", color: colors.primary },
    statLabel: { ...type.label, color: colors.textMuted, marginTop: 2 },
    sectionTitle: { ...type.label, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.sm },
    upNextCard: { marginBottom: spacing.md, borderWidth: 1.5, borderColor: colors.primaryDark },
    row: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm },
    time: { fontSize: 13, fontWeight: "800", color: colors.primaryDark, width: 46 },
    patientName: { fontSize: 14, fontWeight: "700", color: colors.text },
    meta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    pill: { backgroundColor: colors.warningSoft, borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 4 },
    pillText: { fontSize: 10.5, fontWeight: "700", color: colors.warningInk },
    scanCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        marginTop: spacing.sm,
    },
    scanIcon: {
        width: 44,
        height: 44,
        borderRadius: radius.sm,
        backgroundColor: colors.primaryDark,
        alignItems: "center",
        justifyContent: "center",
    },
    scanTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
});
