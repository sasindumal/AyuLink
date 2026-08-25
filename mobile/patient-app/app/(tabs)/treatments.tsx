// ==============================================
// AyuLink Patient - Treatments
// Every AI-assisted diagnosis session: continue an
// unfinished one, or jump to its booked appointment.
// ==============================================

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, spacing } from "../../src/theme";
import { Banner, EmptyState, ScreenHeader } from "../../src/components/ui";
import { TreatmentCard } from "../../src/components/TreatmentCard";
import type { Treatment } from "../../src/types";

export default function Treatments() {
    const { user } = useAuth();
    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

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
            <FlatList
                style={styles.container}
                contentContainerStyle={{ paddingBottom: spacing.xl }}
                data={treatments}
                keyExtractor={(t) => t.id}
                ListHeaderComponent={
                    <>
                        <ScreenHeader title="Treatments" subtitle="Your diagnoses and care journey" />
                        {error && <Banner kind="error" message={error} />}
                    </>
                }
                renderItem={({ item }) => <TreatmentCard treatment={item} onPress={openTreatment} />}
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
                            message="Tap Diagnosis on Home to describe your symptoms and get started."
                        />
                    )
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, paddingHorizontal: spacing.lg },
});
