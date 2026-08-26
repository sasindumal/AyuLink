// ==============================================
// AyuLink Patient - My Prescriptions
// Always sorted by most recent. The main view only shows
// active prescriptions (not dispensed / partially dispensed);
// fully dispensed and expired ones live in the Dispensed
// section below. Searching looks across everything at once,
// regardless of status.
// ==============================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, spacing } from "../../src/theme";
import { Banner, EmptyState, ScreenHeader } from "../../src/components/ui";
import { PrescriptionCard } from "../../src/components/PrescriptionCard";
import type { Prescription } from "../../src/types";

const ACTIVE_STATUSES = new Set(["NOT_DISPENSED", "PARTIALLY_DISPENSED"]);

export default function Prescriptions() {
    const { user } = useAuth();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [search, setSearch] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await rpc<Prescription[]>("app_list_prescriptions");
            setPrescriptions(data ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load prescriptions");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (user) load();
    }, [user, load]);

    const sorted = useMemo(
        () => [...prescriptions].sort((a, b) => b.dateIssued.localeCompare(a.dateIssued)),
        [prescriptions]
    );

    const query = search.trim().toLowerCase();

    const searchResults = useMemo(() => {
        if (!query) return null;
        return sorted.filter(
            (p) =>
                p.diagnosis.toLowerCase().includes(query) ||
                `${p.doctor?.firstName ?? ""} ${p.doctor?.lastName ?? ""}`.toLowerCase().includes(query)
        );
    }, [sorted, query]);

    const active = useMemo(() => sorted.filter((p) => ACTIVE_STATUSES.has(p.status)), [sorted]);
    const archived = useMemo(() => sorted.filter((p) => !ACTIVE_STATUSES.has(p.status)), [sorted]);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <ScrollView
                style={styles.container}
                contentContainerStyle={{ paddingBottom: spacing.xl }}
                showsVerticalScrollIndicator={false}
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
                    title="My Prescriptions"
                    subtitle="Everything your doctors have prescribed, most recent first"
                />

                {error && <Banner kind="error" message={error} />}

                <View style={styles.searchBox}>
                    <Ionicons name="search" size={17} color={colors.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by diagnosis or doctor (any status)"
                        placeholderTextColor={colors.textMuted}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
                ) : prescriptions.length === 0 ? (
                    <EmptyState
                        icon="document-text-outline"
                        title="Nothing here"
                        message="Prescriptions will appear here after a doctor issues one."
                    />
                ) : searchResults !== null ? (
                    <>
                        <Text style={styles.sectionTitle}>Search Results ({searchResults.length})</Text>
                        {searchResults.length === 0 ? (
                            <Text style={styles.emptySection}>No prescriptions match "{search.trim()}".</Text>
                        ) : (
                            searchResults.map((p) => (
                                <PrescriptionCard key={p.id} prescription={p} perspective="patient" />
                            ))
                        )}
                    </>
                ) : (
                    <>
                        <Text style={styles.sectionTitle}>Active ({active.length})</Text>
                        {active.length === 0 ? (
                            <Text style={styles.emptySection}>No active prescriptions.</Text>
                        ) : (
                            active.map((p) => <PrescriptionCard key={p.id} prescription={p} perspective="patient" />)
                        )}

                        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
                            Dispensed ({archived.length})
                        </Text>
                        {archived.length === 0 ? (
                            <Text style={styles.emptySection}>No dispensed or expired prescriptions yet.</Text>
                        ) : (
                            archived.map((p) => <PrescriptionCard key={p.id} prescription={p} perspective="patient" />)
                        )}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
    searchBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.surface,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 12,
        marginBottom: spacing.md,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 11,
        fontSize: 14,
        color: colors.text,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: "800",
        color: colors.text,
        marginBottom: spacing.sm,
    },
    emptySection: {
        fontSize: 13,
        color: colors.textMuted,
        marginBottom: spacing.md,
    },
});
