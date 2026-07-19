// ==============================================
// AyuLink Pharmacy - Home Dashboard
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
import { api, ApiError } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, spacing } from "../../src/theme";
import { Banner, Card, ScreenHeader, StatCard } from "../../src/components/ui";
import type { PharmacyProfile, Prescription } from "../../src/types";

export default function Home() {
    const { user, token, logout } = useAuth();
    const [profile, setProfile] = useState<PharmacyProfile | null>(null);
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const [rxResult, profileResult] = await Promise.allSettled([
                api<{ prescriptions: Prescription[] }>("/api/prescriptions", { token }),
                api<{ pharmacyProfile: PharmacyProfile }>("/api/pharmacy/profile", {
                    token,
                }),
            ]);
            if (rxResult.status === "fulfilled") {
                setPrescriptions(rxResult.value.prescriptions ?? []);
                setError(null);
            } else {
                setError(
                    rxResult.reason instanceof Error
                        ? rxResult.reason.message
                        : "Failed to load records"
                );
            }
            if (profileResult.status === "fulfilled") {
                setProfile(profileResult.value.pharmacyProfile);
            } else if (
                !(profileResult.reason instanceof ApiError) ||
                profileResult.reason.status !== 404
            ) {
                // 404 just means no pharmacy profile on file — not an error
            }
        } finally {
            setRefreshing(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) load();
    }, [token, load]);

    const myId = user?.id;
    const myItems = prescriptions.flatMap((p) =>
        p.items.filter((i) => i.dispensed && i.dispensedById === myId)
    );
    const patientsServed = new Set(prescriptions.map((p) => p.patientId)).size;

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
                    title={profile?.pharmacyName ?? `Hi, ${user?.firstName ?? ""}`}
                    subtitle="Pharmacy dashboard"
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

                {user?.verified === false && (
                    <Banner
                        kind="info"
                        message="Your pharmacy is pending verification. Dispensing is enabled once your license is approved (sign in again once approved)."
                    />
                )}
                {error && <Banner kind="error" message={error} />}

                {profile && (
                    <Card style={styles.identity}>
                        <View style={styles.identityRow}>
                            <Ionicons
                                name="shield-checkmark"
                                size={18}
                                color={colors.primaryDark}
                            />
                            <Text style={styles.identityName}>
                                {profile.pharmacyName}
                            </Text>
                        </View>
                        <Text style={styles.identityMeta}>
                            License {profile.licenseNumber}
                        </Text>
                        {!!profile.pharmacyAddress && (
                            <Text style={styles.identityMeta}>
                                📍 {profile.pharmacyAddress}
                            </Text>
                        )}
                    </Card>
                )}

                <View style={styles.statRow}>
                    <StatCard
                        label="Prescriptions"
                        value={prescriptions.length}
                        icon="albums"
                        tint={colors.primaryDark}
                    />
                    <StatCard
                        label="Meds Given"
                        value={myItems.length}
                        icon="medkit"
                        tint={colors.primary}
                    />
                    <StatCard
                        label="Patients"
                        value={patientsServed}
                        icon="people"
                        tint={colors.warning}
                    />
                </View>

                <Pressable onPress={() => router.push("/(tabs)/dispense")}>
                    <Card style={styles.actionCard}>
                        <View style={styles.actionIcon}>
                            <Ionicons name="scan" size={26} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.actionTitle}>Scan & Dispense</Text>
                            <Text style={styles.actionText}>
                                Scan a patient's Medical ID to view and dispense their
                                active prescriptions
                            </Text>
                        </View>
                        <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.primaryDark}
                        />
                    </Card>
                </Pressable>

                <Pressable onPress={() => router.push("/(tabs)/records")}>
                    <Card style={[styles.actionCard, { backgroundColor: colors.surface }]}>
                        <View
                            style={[
                                styles.actionIcon,
                                { backgroundColor: colors.primary },
                            ]}
                        >
                            <Ionicons name="file-tray-full" size={24} color="#fff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.actionTitle}>Dispensing Records</Text>
                            <Text style={styles.actionText}>
                                Review everything your pharmacy has dispensed
                            </Text>
                        </View>
                        <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.primaryDark}
                        />
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
    identity: {
        borderLeftWidth: 4,
        borderLeftColor: colors.primary,
        marginBottom: spacing.md,
    },
    identityRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 4,
    },
    identityName: { fontSize: 16, fontWeight: "800", color: colors.text },
    identityMeta: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    statRow: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
    actionCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        marginBottom: spacing.md,
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
