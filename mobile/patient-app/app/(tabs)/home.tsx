// ==============================================
// AyuLink Patient - Home Dashboard
// Stats, quick Medical ID access, recent activity
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
    StatCard,
} from "../../src/components/ui";
import { PrescriptionCard } from "../../src/components/PrescriptionCard";
import type { Prescription } from "../../src/types";

export default function Home() {
    const { user, logout } = useAuth();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
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
    }, []);

    useEffect(() => {
        if (user) load();
    }, [user, load]);

    const active = prescriptions.filter((p) => p.status !== "FULLY_DISPENSED");
    const dispensed = prescriptions.filter((p) => p.status === "FULLY_DISPENSED");

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
                    title={`Hi, ${user?.firstName ?? "there"} 👋`}
                    subtitle="Welcome back to AyuLink"
                    right={
                        <Pressable onPress={logout} style={styles.logout}>
                            <Ionicons
                                name="log-out-outline"
                                size={22}
                                color={colors.danger}
                            />
                        </Pressable>
                    }
                />

                {error && <Banner kind="error" message={error} />}

                <View style={styles.statRow}>
                    <StatCard
                        label="Active"
                        value={active.length}
                        icon="pulse"
                        tint={colors.primary}
                    />
                    <StatCard
                        label="Total"
                        value={prescriptions.length}
                        icon="albums"
                        tint={colors.primaryDark}
                    />
                    <StatCard
                        label="Dispensed"
                        value={dispensed.length}
                        icon="checkmark-done"
                        tint={colors.warning}
                    />
                </View>

                <Pressable onPress={() => router.push("/(tabs)/medical-id")}>
                    <Card style={styles.idCard}>
                        <View style={styles.idIcon}>
                            <Ionicons name="qr-code" size={26} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.idTitle}>My Medical ID</Text>
                            <Text style={styles.idValue}>{user?.medicalId}</Text>
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
                        message="Prescriptions issued by your doctor will appear here after your next visit."
                    />
                ) : (
                    prescriptions
                        .slice(0, 3)
                        .map((p) => (
                            <PrescriptionCard
                                key={p.id}
                                prescription={p}
                                perspective="patient"
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
                        <Ionicons
                            name="arrow-forward"
                            size={15}
                            color={colors.primary}
                        />
                    </Pressable>
                )}
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
    idCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        marginBottom: spacing.lg,
        backgroundColor: colors.primarySoft,
    },
    idIcon: {
        width: 48,
        height: 48,
        borderRadius: radius.sm,
        backgroundColor: colors.primaryDark,
        alignItems: "center",
        justifyContent: "center",
    },
    idTitle: { fontSize: 14.5, fontWeight: "700", color: colors.primaryDark },
    idValue: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
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
