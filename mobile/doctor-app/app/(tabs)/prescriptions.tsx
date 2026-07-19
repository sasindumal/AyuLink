// ==============================================
// AyuLink Doctor - Issued Prescriptions
// ==============================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, spacing } from "../../src/theme";
import {
    Banner,
    EmptyState,
    FilterChips,
    ScreenHeader,
} from "../../src/components/ui";
import { PrescriptionCard } from "../../src/components/PrescriptionCard";
import type { Prescription } from "../../src/types";

type Filter = "ALL" | "NOT_DISPENSED" | "PARTIALLY_DISPENSED" | "FULLY_DISPENSED";

export default function Prescriptions() {
    const { user } = useAuth();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [filter, setFilter] = useState<Filter>("ALL");
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

    const filtered = useMemo(() => {
        let list = prescriptions;
        if (filter !== "ALL") list = list.filter((p) => p.status === filter);
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter(
                (p) =>
                    p.diagnosis.toLowerCase().includes(q) ||
                    `${p.patient?.firstName ?? ""} ${p.patient?.lastName ?? ""}`
                        .toLowerCase()
                        .includes(q)
            );
        }
        return list;
    }, [prescriptions, filter, search]);

    const count = (status: Filter) =>
        status === "ALL"
            ? prescriptions.length
            : prescriptions.filter((p) => p.status === status).length;

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <View style={styles.container}>
                <ScreenHeader
                    title="Issued Prescriptions"
                    subtitle="Everything you have prescribed"
                />

                {error && <Banner kind="error" message={error} />}

                <View style={styles.searchBox}>
                    <Ionicons name="search" size={17} color={colors.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by patient or diagnosis"
                        placeholderTextColor={colors.textMuted}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>

                <FilterChips<Filter>
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { key: "ALL", label: "All", count: count("ALL") },
                        { key: "NOT_DISPENSED", label: "Active", count: count("NOT_DISPENSED") },
                        { key: "PARTIALLY_DISPENSED", label: "Partial", count: count("PARTIALLY_DISPENSED") },
                        { key: "FULLY_DISPENSED", label: "Done", count: count("FULLY_DISPENSED") },
                    ]}
                />

                {loading ? (
                    <ActivityIndicator
                        size="large"
                        color={colors.primaryDark}
                        style={{ marginTop: spacing.xl }}
                    />
                ) : (
                    <FlatList
                        data={filtered}
                        keyExtractor={(p) => p.id}
                        renderItem={({ item }) => (
                            <PrescriptionCard prescription={item} perspective="doctor" />
                        )}
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
                        ListEmptyComponent={
                            <EmptyState
                                icon="document-text-outline"
                                title="Nothing here"
                                message={
                                    search
                                        ? "Try adjusting your search terms."
                                        : "Prescriptions you issue will appear here."
                                }
                            />
                        }
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, padding: spacing.lg, paddingBottom: 0 },
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
});
