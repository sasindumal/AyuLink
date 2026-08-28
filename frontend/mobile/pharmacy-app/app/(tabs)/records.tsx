// ==============================================
// AyuLink Pharmacy - Dispensing Records
// History of everything this pharmacy dispensed
// ==============================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, radius, spacing, type } from "../../src/theme";
import {
    Banner,
    EmptyState,
    ScreenHeader,
    StatCard,
} from "../../src/components/ui";
import { PrescriptionCard } from "../../src/components/PrescriptionCard";
import type { Prescription } from "../../src/types";

export default function Records() {
    const { user } = useAuth();
    const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"ALL" | "PARTIAL" | "TODAY">("ALL");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            // Server-side filter: prescriptions containing items
            // this pharmacist dispensed
            const data = await rpc<Prescription[]>("app_list_prescriptions");
            setPrescriptions(data ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load records");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (user) load();
    }, [user, load]);

    /** Which day bucket a record belongs to. A pharmacist looks back in
     *  terms of "today / yesterday / that Tuesday", not one flat list. */
    const dayLabel = (iso: string): string => {
        const d = new Date(iso);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const same = (a: Date, b: Date) =>
            a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();
        if (same(d, today)) return "Today";
        if (same(d, yesterday)) return "Yesterday";
        return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    };

    const sections = useMemo(() => {
        const q = search.trim().toLowerCase();
        const todayStr = new Date().toDateString();

        const matched = prescriptions.filter((p) => {
            if (statusFilter === "PARTIAL" && p.items.every((i) => i.dispensed)) return false;
            if (
                statusFilter === "TODAY" &&
                !p.items.some(
                    (i) => i.dispensed && i.dispensedAt && new Date(i.dispensedAt).toDateString() === todayStr
                )
            ) {
                return false;
            }
            if (!q) return true;
            return (
                p.diagnosis.toLowerCase().includes(q) ||
                p.id.toLowerCase().includes(q) ||
                `${p.patient?.firstName ?? ""} ${p.patient?.lastName ?? ""}`.toLowerCase().includes(q)
            );
        });

        // Newest first, then bucketed — iterating in sorted order means the
        // sections themselves come out newest-first without a second sort.
        const sorted = [...matched].sort((a, b) => b.dateIssued.localeCompare(a.dateIssued));
        const buckets = new Map<string, Prescription[]>();
        for (const p of sorted) {
            const key = dayLabel(p.dateIssued);
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key)!.push(p);
        }
        return Array.from(buckets, ([title, data]) => ({ title, data }));
    }, [prescriptions, search, statusFilter]);

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

                <View style={styles.seg}>
                    {(["ALL", "PARTIAL", "TODAY"] as const).map((key) => (
                        <Pressable
                            key={key}
                            onPress={() => setStatusFilter(key)}
                            style={[styles.segItem, statusFilter === key && styles.segItemActive]}
                        >
                            <Text
                                style={[styles.segText, statusFilter === key && styles.segTextActive]}
                            >
                                {key === "ALL" ? "All" : key === "PARTIAL" ? "Partial" : "Today"}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {loading ? (
                    <ActivityIndicator
                        size="large"
                        color={colors.primaryDark}
                        style={{ marginTop: spacing.xl }}
                    />
                ) : (
                    <SectionList
                        sections={sections}
                        keyExtractor={(p) => p.id}
                        stickySectionHeadersEnabled={false}
                        renderSectionHeader={({ section }) => (
                            <Text style={styles.sectionHeader}>{section.title}</Text>
                        )}
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
                                    search || statusFilter !== "ALL"
                                        ? "Try adjusting your search or filter."
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
    seg: {
        flexDirection: "row",
        backgroundColor: colors.background,
        borderRadius: radius.sm,
        padding: 3,
        marginBottom: spacing.sm,
    },
    segItem: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: radius.sm - 3 },
    segItemActive: { backgroundColor: colors.surface },
    segText: { fontSize: 12.5, fontWeight: "700", color: colors.textMuted },
    segTextActive: { color: colors.primaryDark },
    sectionHeader: {
        ...type.label,
        color: colors.textMuted,
        marginTop: spacing.md,
        marginBottom: spacing.sm,
    },
});
