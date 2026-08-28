// ==============================================
// AyuLink Patient - My Prescriptions
// Grouped by what the patient actually has to do, not by the
// database status:
//   To collect  -> go to a pharmacy (with an expiry countdown)
//   Taking now  -> collected, course still running
//   Finished    -> collected, course done
//   Expired     -> the window closed before it was collected
// "Dispensed" previously lumped the last two together, which
// filed a success and a failure under the same heading.
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
import { colors, radius, spacing, type } from "../../src/theme";
import { Banner, EmptyState, ScreenHeader } from "../../src/components/ui";
import { PrescriptionCard } from "../../src/components/PrescriptionCard";
import {
    daysLeftOfCourse,
    daysUntilExpiry,
    groupFor,
    nextDoseLabel,
    type RxGroup,
} from "../../src/lib/medication";
import type { Prescription } from "../../src/types";

const GROUP_ORDER: RxGroup[] = ["COLLECT", "TAKING", "FINISHED", "EXPIRED_UNCOLLECTED"];

const GROUP_LABEL: Record<RxGroup, string> = {
    COLLECT: "To collect",
    TAKING: "Taking now",
    FINISHED: "Finished",
    EXPIRED_UNCOLLECTED: "Expired — not collected",
};

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

    const groups = useMemo(() => {
        const q = search.trim().toLowerCase();
        const now = new Date();

        const matched = prescriptions.filter((p) => {
            if (!q) return true;
            return (
                p.diagnosis.toLowerCase().includes(q) ||
                `${p.doctor?.firstName ?? ""} ${p.doctor?.lastName ?? ""}`.toLowerCase().includes(q) ||
                // Searching a drug name is a real question ("do I have
                // anything with amoxicillin?") and the items are already loaded.
                p.items.some((i) => i.drugName.toLowerCase().includes(q))
            );
        });

        const sorted = [...matched].sort((a, b) => b.dateIssued.localeCompare(a.dateIssued));
        const byGroup = new Map<RxGroup, Prescription[]>();
        for (const p of sorted) {
            const g = groupFor(p, now);
            if (!byGroup.has(g)) byGroup.set(g, []);
            byGroup.get(g)!.push(p);
        }
        return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({
            group: g,
            items: byGroup.get(g)!,
        }));
    }, [prescriptions, search]);

    const totalMatches = groups.reduce((n, g) => n + g.items.length, 0);
    const collectCount = groups.find((g) => g.group === "COLLECT")?.items.length ?? 0;
    const takingCount = groups.find((g) => g.group === "TAKING")?.items.length ?? 0;

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
                    title="Prescriptions"
                    subtitle={
                        collectCount || takingCount
                            ? [
                                  collectCount ? `${collectCount} to collect` : null,
                                  takingCount ? `${takingCount} in progress` : null,
                              ]
                                  .filter(Boolean)
                                  .join(" · ")
                            : "Everything your doctors have prescribed"
                    }
                />

                {error && <Banner kind="error" message={error} />}

                <View style={styles.searchBox}>
                    <Ionicons name="search" size={17} color={colors.textMuted} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search condition, doctor, or medicine"
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
                ) : totalMatches === 0 ? (
                    <EmptyState
                        icon="search-outline"
                        title="No matches"
                        message={`Nothing matches "${search.trim()}".`}
                    />
                ) : (
                    groups.map(({ group, items }) => (
                        <View key={group}>
                            <Text style={styles.groupLabel}>
                                {GROUP_LABEL[group]} ({items.length})
                            </Text>
                            {items.map((p) => (
                                <PrescriptionCard
                                    key={p.id}
                                    prescription={p}
                                    perspective="patient"
                                    statusOverride={contextualBadge(p, group)}
                                    footer={<GroupFooter prescription={p} group={group} />}
                                    dimmed={group === "EXPIRED_UNCOLLECTED"}
                                    showQrAction={group === "COLLECT"}
                                />
                            ))}
                        </View>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

/** A label that answers "what do I do now?", rather than echoing the
 *  database status. "Not Dispensed" is a system state; "Ready" is an
 *  instruction. */
function contextualBadge(prescription: Prescription, group: RxGroup) {
    const total = prescription.items.length;
    const remaining = prescription.items.filter((i) => !i.dispensed).length;

    if (group === "COLLECT") {
        return remaining === total
            ? { label: "Ready", color: colors.primaryDark, bg: colors.primarySoft }
            : {
                  label: `${remaining} of ${total} left`,
                  color: colors.warningInk,
                  bg: colors.warningSoft,
              };
    }
    if (group === "TAKING") {
        return { label: "In progress", color: colors.primaryDark, bg: colors.primarySoft };
    }
    if (group === "FINISHED") {
        return { label: "Done", color: colors.neutral, bg: colors.neutralSoft };
    }
    return { label: "Expired", color: colors.danger, bg: colors.dangerSoft };
}

/** The one thing the card can't say for itself: where this sits in time.
 *  Rendered inside the card so it reads as part of the prescription
 *  rather than a detached note floating beneath it. */
function GroupFooter({ prescription, group }: { prescription: Prescription; group: RxGroup }) {
    if (group === "COLLECT") {
        const days = daysUntilExpiry(prescription);
        if (days === null) return null;
        const urgent = days <= 7;
        return (
            <View style={[styles.footer, urgent ? styles.footerUrgent : styles.footerCalm]}>
                <Ionicons
                    name={urgent ? "alert-circle" : "time-outline"}
                    size={14}
                    color={urgent ? colors.warningInk : colors.primaryDark}
                />
                <Text style={[styles.footerText, { color: urgent ? colors.warningInk : colors.primaryDark }]}>
                    {days < 0
                        ? "Expired"
                        : days === 0
                          ? "Expires today — collect now"
                          : `Collect within ${days} day${days === 1 ? "" : "s"}`}
                </Text>
            </View>
        );
    }

    if (group === "TAKING") {
        const left = daysLeftOfCourse(prescription);
        const dose = nextDoseLabel(prescription);
        return (
            <View style={[styles.footer, styles.footerCalm]}>
                <Ionicons name="medkit-outline" size={14} color={colors.primaryDark} />
                <Text style={[styles.footerText, { color: colors.primaryDark }]}>
                    {dose ??
                        (left === null
                            ? "Ongoing course"
                            : left <= 0
                              ? "Last day of the course"
                              : `${left} day${left === 1 ? "" : "s"} left of the course`)}
                </Text>
            </View>
        );
    }

    return null;
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
    searchInput: { flex: 1, paddingVertical: 11, fontSize: 14, color: colors.text },
    groupLabel: {
        ...type.label,
        color: colors.textMuted,
        marginTop: spacing.sm,
        marginBottom: spacing.sm,
    },
    footer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: radius.sm,
        paddingVertical: 7,
        paddingHorizontal: 10,
        marginTop: spacing.sm,
    },
    footerCalm: { backgroundColor: colors.primarySoft },
    footerUrgent: { backgroundColor: colors.warningSoft },
    footerText: { fontSize: 11.5, fontWeight: "700", color: colors.textMuted },
});
