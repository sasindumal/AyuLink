// ==============================================
// AyuLink Pharmacy - Dispensing Records
// History of everything this pharmacy dispensed
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
import { api } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, spacing } from "../../src/theme";
import {
    Banner,
    EmptyState,
    ScreenHeader,
    StatCard,
} from "../../src/components/ui";
import { PrescriptionCard } from "../../src/components/PrescriptionCard";
import type { Prescription } from "../../src/types";

export default function Records() {
    const { user, token } = useAuth();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [search, setSearch] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            // Default pharmacist filter: prescriptions containing items
            // this pharmacist dispensed
            const data = await api<{ prescriptions: Prescription[] }>(
                "/api/prescriptions",
                { token }
            );
            setPrescriptions(data.prescriptions ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load records");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [token]);

    useEffect(() => {
        if (token) load();
    }, [token, load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return prescriptions;
        return prescriptions.filter(
            (p) =>
                p.diagnosis.toLowerCase().includes(q) ||
                p.id.toLowerCase().includes(q) ||
                `${p.patient?.firstName ?? ""} ${p.patient?.lastName ?? ""}`
                    .toLowerCase()
                    .includes(q)
        );
    }, [prescriptions, search]);

    const myItems = prescriptions.flatMap((p) =>
        p.items.filter((i) => i.dispensed && i.dispensedById === user?.id)
    );
    const patientsServed = new Set(prescriptions.map((p) => p.patientId)).size;

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <View style={styles.container}>
                <ScreenHeader
                    title="Dispensing Records"
                    subtitle="Prescriptions your pharmacy has handled"
                />

                {error && <Banner kind="error" message={error} />}

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

                <View style={styles.searchBox}>
                    <Ionicons name="search" size={17} color={colors.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by patient, diagnosis, or Rx ID"
                        placeholderTextColor={colors.textMuted}
                        value={search}
                        onChangeText={setSearch}
                    />
                </View>

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
                                perspective="pharmacy"
                                initiallyExpanded
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
                                icon="file-tray-outline"
                                title="No records yet"
                                message={
                                    search
                                        ? "Try adjusting your search terms."
                                        : "Prescriptions you dispense will appear here."
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
    statRow: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
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
