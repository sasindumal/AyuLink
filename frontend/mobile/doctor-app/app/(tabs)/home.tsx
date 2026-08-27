// ==============================================
// AyuLink Doctor - Home Dashboard
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
import {
    Banner,
    Card,
    EmptyState,
    ScreenHeader,
} from "../../src/components/ui";
import { PrescriptionCard } from "../../src/components/PrescriptionCard";
import type { Prescription } from "../../src/types";

function greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
}

export default function Home() {
    const { user, logout } = useAuth();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await rpc<Prescription[]>("app_list_prescriptions");
            setPrescriptions(data ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load prescriptions");
        } finally {
            setLoaded(true);
            setRefreshing(false);
        }
        rpc<number>("app_unread_notification_count")
            .then(setUnreadCount)
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (user) load();
    }, [user, load]);

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
                    title={`${greeting()}, Dr. ${user?.lastName ?? ""} 🩺`}
                    subtitle="Here is your practice at a glance"
                    right={
                        <View style={styles.headerActions}>
                            <Pressable
                                onPress={() => router.push("/notifications")}
                                style={[styles.iconButton, { backgroundColor: colors.primarySoft }]}
                            >
                                <Ionicons name="notifications-outline" size={22} color={colors.primaryDark} />
                                {unreadCount > 0 && (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>
                                            {unreadCount > 9 ? "9+" : unreadCount}
                                        </Text>
                                    </View>
                                )}
                            </Pressable>
                            <Pressable onPress={logout} style={[styles.iconButton, { backgroundColor: colors.dangerSoft }]}>
                                <Ionicons
                                    name="log-out-outline"
                                    size={22}
                                    color={colors.danger}
                                />
                            </Pressable>
                        </View>
                    }
                />

                {user?.verified === false && (
                    <Banner
                        kind="info"
                        message="Your SLMC credentials are still being verified — you can use the app as normal in the meantime."
                    />
                )}
                {error && <Banner kind="error" message={error} />}

                <Pressable onPress={() => router.push("/(tabs)/scan")}>
                    <Card style={styles.actionCard}>
                        <View style={styles.actionIcon}>
                            <Ionicons name="scan" size={26} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.actionTitle}>Scan & Prescribe</Text>
                            <Text style={styles.actionText}>
                                Scan a patient's Medical ID to start a new prescription
                            </Text>
                        </View>
                        <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.primaryDark}
                        />
                    </Card>
                </Pressable>

                <Text style={styles.sectionTitle}>Recent Prescriptions</Text>

                {loaded && prescriptions.length === 0 && !error ? (
                    <EmptyState
                        icon="document-text-outline"
                        title="No prescriptions yet"
                        message="Scan a patient to issue your first digital prescription."
                    />
                ) : (
                    prescriptions
                        .slice(0, 3)
                        .map((p) => (
                            <PrescriptionCard
                                key={p.id}
                                prescription={p}
                                perspective="doctor"
                            />
                        ))
                )}

                {prescriptions.length > 3 && (
                    <Pressable
                        onPress={() => router.push("/(tabs)/prescriptions")}
                        style={styles.viewAll}
                    >
                        <Text style={styles.viewAllText}>
                            View all {prescriptions.length} prescriptions
                        </Text>
                        <Ionicons name="arrow-forward" size={15} color={colors.primary} />
                    </Pressable>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
    headerActions: { flexDirection: "row", gap: 8 },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
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
    actionCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        marginBottom: spacing.lg,
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
    sectionTitle: {
        fontSize: 16,
        fontWeight: "800",
        color: colors.text,
        marginBottom: spacing.sm,
    },
    viewAll: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 10,
    },
    viewAllText: { color: colors.primary, fontWeight: "700", fontSize: 13.5 },
});
