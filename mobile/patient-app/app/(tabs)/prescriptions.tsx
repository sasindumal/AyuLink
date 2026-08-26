// ==============================================
// AyuLink Patient - My Prescriptions
// Filterable, searchable prescription history
// ==============================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
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
import {
    Banner,
    EmptyState,
    FilterChips,
    ScreenHeader,
} from "../../src/components/ui";
import { PrescriptionCard } from "../../src/components/PrescriptionCard";
import type { Prescription } from "../../src/types";

type Sort = "date" | "doctor";

export default function Prescriptions() {
    const { user } = useAuth();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [sort, setSort] = useState<Sort>("date");
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
        const q = search.trim().toLowerCase();
        if (q) {
            list = list.filter(
                (p) =>
                    p.diagnosis.toLowerCase().includes(q) ||
                    `${p.doctor?.firstName ?? ""} ${p.doctor?.lastName ?? ""}`
                        .toLowerCase()
                        .includes(q)
            );
        }
        list = [...list].sort((a, b) => {
            if (sort === "doctor") {
                return `${a.doctor?.firstName ?? ""} ${a.doctor?.lastName ?? ""}`.localeCompare(
                    `${b.doctor?.firstName ?? ""} ${b.doctor?.lastName ?? ""}`
                );
            }
            return b.dateIssued.localeCompare(a.dateIssued);
        });
        return list;
    }, [prescriptions, search, sort]);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <View style={styles.container}>
                <ScreenHeader
                    title="My Prescriptions"
                    subtitle="Everything your doctors have prescribed"
                />

                {error && <Banner kind="error" message={error} />}

                <View style={styles.searchBox}>
                    <Ionicons name="search" size={17} color={colors.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by diagnosis or doctor"
                        placeholderTextColor={colors.textMuted}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>

                <Text style={styles.sortLabel}>Sort by</Text>
                <FilterChips<Sort>
                    value={sort}
                    onChange={setSort}
                    options={[
                        { key: "date", label: "Date" },
                        { key: "doctor", label: "Doctor Name" },
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
                            <PrescriptionCard
                                prescription={item}
                                perspective="patient"
                            />
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
                                        : "Prescriptions will appear here after a doctor issues one."
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
    sortLabel: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
});
