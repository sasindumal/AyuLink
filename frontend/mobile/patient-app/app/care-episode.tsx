// ==============================================
// AyuLink Patient - Care Episode
// One diagnosis's whole story: the timeline (visit, prescription,
// each drug dispensed), the follow-up plan if one exists, and a
// way back into the chat that produced it. Reached by tapping a
// card on the My Care tab.
// ==============================================

import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../src/lib/api";
import { colors, radius, spacing, treatmentStatusMeta, type } from "../src/theme";
import { Banner, Button } from "../src/components/ui";
import { CareTimeline } from "../src/components/CareTimeline";
import type { CareEventPrescriptionIssued, CareTimeline as CareTimelineData, TreatmentStatus } from "../src/types";

const FOLLOWUP_LABEL: Record<string, string> = {
    MEET_SAME_DOCTOR: "Go back to the same doctor",
    REFER_DOCTOR: "Referred onward",
};

export default function CareEpisode() {
    const params = useLocalSearchParams<{ treatmentId?: string }>();
    const treatmentId = params.treatmentId ?? "";

    const [data, setData] = useState<CareTimelineData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        if (!treatmentId) return;
        try {
            const result = await rpc<CareTimelineData>("app_treatment_timeline", {
                p_treatment_id: treatmentId,
            });
            setData(result);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load this diagnosis");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [treatmentId]);

    // Re-fetch on every focus — returning here after rating a doctor or
    // dispensing progressing should show the up-to-date timeline, not a
    // stale snapshot from when the screen first opened.
    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const referral = data?.events
        .filter((e) => e.type === "PRESCRIPTION_ISSUED")
        .map((e) => e.payload as CareEventPrescriptionIssued)
        .find((p) => p.followupPlan === "REFER_DOCTOR" && p.referredDoctor);

    const meta = data ? treatmentStatusMeta[data.status as TreatmentStatus] : null;

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
                <View style={styles.header}>
                    <Pressable onPress={() => router.back()} style={styles.backBtn}>
                        <Ionicons name="arrow-back" size={22} color={colors.primaryDark} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerTitle} numberOfLines={2}>
                            {data?.diseaseName ?? "Diagnosis"}
                        </Text>
                        {data && (
                            <Text style={styles.headerSubtitle}>
                                {data.events.find((e) => e.type === "APPOINTMENT_STARTED")
                                    ? "Started " +
                                      new Date(
                                          data.events.find((e) => e.type === "APPOINTMENT_STARTED")!.at ?? ""
                                      ).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                                    : "Not yet seen by a doctor"}
                            </Text>
                        )}
                    </View>
                    {meta && (
                        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                    )}
                </View>

                {error && <Banner kind="error" message={error} />}

                {loading ? (
                    <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
                ) : data ? (
                    <>
                        <CareTimeline events={data.events} courseEndsAt={data.courseEndsAt} status={data.status} />

                        {referral && (
                            <View style={styles.referralCard}>
                                <Text style={styles.label}>{FOLLOWUP_LABEL[referral.followupPlan]}</Text>
                                <Text style={styles.referralName}>
                                    Dr. {referral.referredDoctor?.firstName} {referral.referredDoctor?.lastName}
                                </Text>
                                <Text style={styles.referralMeta}>
                                    {[referral.referredDoctor?.specialty, referral.referredDoctor?.slmcRegNo ? `SLMC ${referral.referredDoctor.slmcRegNo}` : null]
                                        .filter(Boolean)
                                        .join("  ·  ")}
                                </Text>
                            </View>
                        )}

                        <Button
                            title="Continue in chat"
                            icon="chatbubble-ellipses"
                            variant="secondary"
                            onPress={() =>
                                router.push({ pathname: "/diagnosis", params: { threadId: data.threadId } })
                            }
                            style={{ marginTop: spacing.md }}
                        />
                    </>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, paddingHorizontal: spacing.lg },
    header: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingTop: spacing.lg,
        marginBottom: spacing.lg,
    },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: radius.sm,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: { ...type.title, color: colors.text },
    headerSubtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
    badge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 5, marginTop: 2 },
    badgeText: { fontSize: 11, fontWeight: "700" },
    label: { ...type.label, color: colors.textMuted },
    referralCard: {
        backgroundColor: colors.warningSoft,
        borderRadius: radius.md,
        padding: spacing.md,
        marginTop: spacing.md,
    },
    referralName: { fontSize: 14, fontWeight: "700", color: colors.text, marginTop: 4 },
    referralMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
