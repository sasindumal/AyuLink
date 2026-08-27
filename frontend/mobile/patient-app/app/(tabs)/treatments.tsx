// ==============================================
// AyuLink Patient - Diagnoses
// Every AI-assisted diagnosis session: search, filter by
// status, pin favorites to the top, and browse the rest
// grouped by how recent they are. Continue a diagnosis
// (even after booking — the chat keeps managing that
// booking too), start a new one, or delete it.
// ==============================================

import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, spacing } from "../../src/theme";
import { Banner, EmptyState, FilterChips, Input, ScreenHeader } from "../../src/components/ui";
import { ConfirmModal } from "../../src/components/ConfirmModal";
import { TreatmentCard } from "../../src/components/TreatmentCard";
import type { Treatment, TreatmentStatus } from "../../src/types";

type StatusFilter = "ALL" | TreatmentStatus;

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "DIAGNOSED", label: "Diagnosed" },
    { key: "BOOKED", label: "Booked" },
    { key: "COMPLETED", label: "Completed" },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Which section a diagnosis falls into, given "now" —
 * sequential, mutually-exclusive rolling windows, then by calendar year
 * for anything older than a year. The list is already sorted newest-first
 * (app_list_my_treatments), so grouping in encounter order naturally
 * produces sections in the right chronological order without a separate
 * sort step. */
function dateBucket(createdAt: string, now: Date): string {
    const created = new Date(createdAt);
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.floor((startOfDay(now) - startOfDay(created)) / MS_PER_DAY);

    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays <= 7) return "Last Week";
    if (diffDays <= 30) return "Last Month";
    if (diffDays <= 90) return "Last 3 Months";
    if (diffDays <= 365) return "Last Year";
    return String(created.getFullYear());
}

export default function Treatments() {
    const { user } = useAuth();
    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Treatment | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

    const load = useCallback(async () => {
        try {
            const data = await rpc<Treatment[]>("app_list_my_treatments");
            setTreatments(data ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load diagnoses");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // useFocusEffect (not useEffect) — this tab stays mounted when you
    // switch away, so this re-fetches every time it regains focus (e.g.
    // right after finishing a diagnosis/booking in chat).
    useFocusEffect(
        useCallback(() => {
            if (user) load();
        }, [user, load])
    );

    const openTreatment = (t: Treatment) => {
        router.push({ pathname: "/diagnosis", params: { threadId: t.thread_id } });
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await rpc("app_delete_treatment", { p_treatment_id: deleteTarget.id });
            setTreatments((prev) => prev.filter((t) => t.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete diagnosis");
        } finally {
            setDeleting(false);
        }
    };

    const sections = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = treatments.filter((t) => {
            if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
            if (!q) return true;
            return (
                t.disease_name.toLowerCase().includes(q) ||
                (t.specialty ?? "").toLowerCase().includes(q) ||
                (t.description ?? "").toLowerCase().includes(q)
            );
        });

        const now = new Date();
        const buckets = new Map<string, Treatment[]>();
        for (const t of filtered) {
            const key = dateBucket(t.created_at, now);
            if (!buckets.has(key)) buckets.set(key, []);
            buckets.get(key)!.push(t);
        }

        return Array.from(buckets, ([title, data]) => ({ title, data }));
    }, [treatments, search, statusFilter]);

    const totalMatches = sections.reduce((n, s) => n + s.data.length, 0);
    const isFiltering = search.trim().length > 0 || statusFilter !== "ALL";

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <SectionList
                style={styles.container}
                contentContainerStyle={{ paddingBottom: spacing.xl }}
                sections={sections}
                keyExtractor={(t) => t.id}
                stickySectionHeadersEnabled={false}
                ListHeaderComponent={
                    <>
                        <ScreenHeader
                            title="Diagnoses"
                            subtitle="Your diagnoses and care journey"
                            right={
                                <Pressable onPress={() => router.push("/diagnosis")} style={styles.newBtn}>
                                    <Text style={styles.newBtnText}>+ New</Text>
                                </Pressable>
                            }
                        />
                        {error && <Banner kind="error" message={error} />}

                        {treatments.length > 0 && (
                            <>
                                <Input
                                    placeholder="Search by condition, specialty..."
                                    value={search}
                                    onChangeText={setSearch}
                                    containerStyle={{ marginBottom: spacing.sm }}
                                />
                                <FilterChips options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
                                {isFiltering && (
                                    <Text style={styles.matchCount}>
                                        {totalMatches} match{totalMatches === 1 ? "" : "es"}
                                    </Text>
                                )}
                            </>
                        )}
                    </>
                }
                renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
                renderItem={({ item }) => (
                    <TreatmentCard treatment={item} onPress={openTreatment} onDelete={setDeleteTarget} />
                )}
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
                    loading ? (
                        <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
                    ) : treatments.length > 0 ? (
                        <EmptyState
                            icon="search-outline"
                            title="No matches"
                            message="Try a different search term or filter."
                        />
                    ) : (
                        <EmptyState
                            icon="pulse-outline"
                            title="No diagnoses yet"
                            message="Tap + New above to describe your symptoms and get started."
                        />
                    )
                }
            />

            <ConfirmModal
                visible={!!deleteTarget}
                title="Delete this diagnosis?"
                message={
                    deleteTarget
                        ? `"${deleteTarget.disease_name}" and its chat history will be removed. This won't cancel a linked appointment.`
                        : ""
                }
                confirmLabel="Delete"
                destructive
                loading={deleting}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteTarget(null)}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, paddingHorizontal: spacing.lg },
    newBtn: {
        backgroundColor: colors.primarySoft,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    newBtnText: { color: colors.primaryDark, fontWeight: "700", fontSize: 13 },
    matchCount: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.sm },
    sectionHeader: {
        fontSize: 13,
        fontWeight: "800",
        color: colors.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginTop: spacing.md,
        marginBottom: spacing.sm,
    },
});
