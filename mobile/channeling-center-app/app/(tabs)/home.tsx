// ==============================================
// AyuLink Channeling Center - Home Dashboard
// ==============================================

import React, { useCallback, useEffect, useState } from "react";
import {
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, spacing } from "../../src/theme";
import { Banner, Card, ScreenHeader, StatCard } from "../../src/components/ui";
import type { Appointment, ChannelingCenterProfile } from "../../src/types";

export default function Home() {
    const { user, logout } = useAuth();
    const [profile, setProfile] = useState<ChannelingCenterProfile | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const [p, a] = await Promise.all([
                rpc<ChannelingCenterProfile | null>("app_get_my_channeling_center_profile"),
                rpc<Appointment[]>("app_list_center_appointments"),
            ]);
            setProfile(p);
            setAppointments(a ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load your center");
        } finally {
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (user) load();
    }, [user, load]);

    const today = new Date().toISOString().slice(0, 10);
    const todayCount = appointments.filter((a) => a.appointment_date === today && a.status === "BOOKED").length;
    const upcoming = appointments.filter((a) => a.status === "BOOKED").length;
    const completed = appointments.filter((a) => a.status === "COMPLETED").length;

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
                <ScreenHeader
                    title={profile?.name ?? "Your Center"}
                    subtitle={profile?.address}
                    right={
                        <Pressable onPress={logout} style={styles.logout}>
                            <Ionicons name="log-out-outline" size={22} color={colors.danger} />
                        </Pressable>
                    }
                />

                {user?.verified === false && (
                    <Banner
                        kind="info"
                        message="Your center is pending verification. Managing appointments is enabled once approved (sign in again once approved)."
                    />
                )}
                {error && <Banner kind="error" message={error} />}

                <View style={styles.statRow}>
                    <StatCard label="Today" value={todayCount} icon="today" tint={colors.primaryDark} />
                    <StatCard label="Upcoming" value={upcoming} icon="calendar" tint={colors.primary} />
                    <StatCard label="Completed" value={completed} icon="checkmark-done" tint={colors.warning} />
                </View>

                <Pressable onPress={() => router.push("/(tabs)/appointments")}>
                    <Card style={styles.actionCard}>
                        <View style={styles.actionIcon}>
                            <Ionicons name="calendar" size={26} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.actionTitle}>Manage Appointments</Text>
                            <Text style={styles.actionText}>
                                View, complete, or cancel appointments at your center
                            </Text>
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
    logout: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.dangerSoft,
        alignItems: "center",
        justifyContent: "center",
    },
    statRow: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
    actionCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: colors.primarySoft,
    },
    actionIcon: {
        width: 48,
        height: 48,
        borderRadius: radius.sm,
        backgroundColor: colors.primaryDark,
        alignItems: "center",
        justifyContent: "center",
    },
    actionTitle: { fontSize: 14.5, fontWeight: "700", color: colors.primaryDark },
    actionText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
