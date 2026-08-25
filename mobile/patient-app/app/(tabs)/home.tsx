// ==============================================
// AyuLink Patient - Home Dashboard
// Diagnosis entry point, quick Medical ID access,
// and recent treatments
// ==============================================

import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, shadow, spacing } from "../../src/theme";
import { Banner, Button, Card, EmptyState, ScreenHeader } from "../../src/components/ui";
import { TreatmentCard } from "../../src/components/TreatmentCard";
import type { Treatment } from "../../src/types";

export default function Home() {
    const { user, logout } = useAuth();
    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await rpc<Treatment[]>("app_list_my_treatments");
            setTreatments(data ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load treatments");
        } finally {
            setLoaded(true);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (user) load();
    }, [user, load]);

    const openTreatment = (t: Treatment) => {
        if (t.status === "DIAGNOSED") {
            router.push({ pathname: "/diagnosis", params: { threadId: t.thread_id } });
        } else {
            router.push("/(tabs)/appointments");
        }
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
                <ScreenHeader
                    title={`Hi, ${user?.firstName ?? "there"} 👋`}
                    subtitle="Welcome to AyuLink"
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

                <Card style={styles.diagnosisCard}>
                    <View style={styles.diagnosisIcon}>
                        <Ionicons name="pulse" size={26} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.diagnosisTitle}>Do you have any disease?</Text>
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
                        <Ionicons
                            name="chevron-forward"
                            size={20}
                            color={colors.primaryDark}
                        />
                    </Card>
                </Pressable>

                <Text style={styles.sectionTitle}>Recent Treatments</Text>

                {loaded && treatments.length === 0 && !error ? (
                    <EmptyState
                        icon="pulse-outline"
                        title="No treatments yet"
                        message="Tap Diagnosis above to describe your symptoms and get started."
                    />
                ) : (
                    treatments.slice(0, 3).map((t) => (
                        <TreatmentCard key={t.id} treatment={t} onPress={openTreatment} />
                    ))
                )}

                {treatments.length > 3 && (
                    <Pressable
                        onPress={() => router.push("/(tabs)/treatments")}
                        style={styles.viewAll}
                    >
                        <Text style={styles.viewAllText}>
                            View all {treatments.length} treatments
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
    diagnosisCard: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 14,
        marginBottom: spacing.md,
        ...shadow.card,
    },
    diagnosisIcon: {
        width: 48,
        height: 48,
        borderRadius: radius.sm,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    diagnosisTitle: { fontSize: 15.5, fontWeight: "800", color: colors.text },
    diagnosisSubtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
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
