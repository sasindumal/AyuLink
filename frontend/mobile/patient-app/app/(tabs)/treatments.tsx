// ==============================================
// AyuLink Patient - Treatments
// Every AI-assisted diagnosis session: continue it
// (even after booking — the chat keeps managing that
// booking too), start a new one, or delete it.
// ==============================================

import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, spacing } from "../../src/theme";
import { Banner, EmptyState, ScreenHeader } from "../../src/components/ui";
import { ConfirmModal } from "../../src/components/ConfirmModal";
import { TreatmentCard } from "../../src/components/TreatmentCard";
import type { Treatment } from "../../src/types";

export default function Treatments() {
    const { user } = useAuth();
    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Treatment | null>(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await rpc<Treatment[]>("app_list_my_treatments");
            setTreatments(data ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load treatments");
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
            setError(e instanceof Error ? e.message : "Failed to delete treatment");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <FlatList
                style={styles.container}
                contentContainerStyle={{ paddingBottom: spacing.xl }}
                data={treatments}
                keyExtractor={(t) => t.id}
                ListHeaderComponent={
                    <>
                        <ScreenHeader
                            title="Treatments"
                            subtitle="Your diagnoses and care journey"
                            right={
                                <Pressable onPress={() => router.push("/diagnosis")} style={styles.newBtn}>
                                    <Text style={styles.newBtnText}>+ New</Text>
                                </Pressable>
                            }
                        />
                        {error && <Banner kind="error" message={error} />}
                    </>
                }
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
                    ) : (
                        <EmptyState
                            icon="pulse-outline"
                            title="No treatments yet"
                            message="Tap + New above to describe your symptoms and get started."
                        />
                    )
                }
            />

            <ConfirmModal
                visible={!!deleteTarget}
                title="Delete this treatment?"
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
});
