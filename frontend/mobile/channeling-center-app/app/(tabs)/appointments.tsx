// ==============================================
// AyuLink Channeling Center - Appointments
// ==============================================

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, spacing } from "../../src/theme";
import { Banner, EmptyState, FilterChips, ScreenHeader } from "../../src/components/ui";
import { CenterAppointmentCard } from "../../src/components/CenterAppointmentCard";
import type { Appointment, AppointmentStatus } from "../../src/types";

type Filter = "ALL" | AppointmentStatus;

export default function Appointments() {
    const { user } = useAuth();
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [filter, setFilter] = useState<Filter>("ALL");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const data = await rpc<Appointment[]>("app_list_center_appointments");
            setAppointments(data ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load appointments");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (user) load();
    }, [user, load]);

    const filtered = filter === "ALL" ? appointments : appointments.filter((a) => a.status === filter);
    const count = (status: Filter) =>
        status === "ALL" ? appointments.length : appointments.filter((a) => a.status === status).length;

    const cancel = async (id: string, reason: string) => {
        setBusyId(id);
        try {
            await rpc("app_cancel_appointment", { p_appointment_id: id, p_reason: reason || null });
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to cancel appointment");
        } finally {
            setBusyId(null);
        }
    };

    const complete = async (id: string) => {
        setBusyId(id);
        try {
            await rpc("app_complete_appointment", { p_appointment_id: id });
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to mark complete");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <View style={styles.container}>
                <ScreenHeader title="Appointments" subtitle="Everyone booked at your center" />

                {error && <Banner kind="error" message={error} />}

                <FilterChips<Filter>
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { key: "ALL", label: "All", count: count("ALL") },
                        { key: "BOOKED", label: "Booked", count: count("BOOKED") },
                        { key: "COMPLETED", label: "Completed", count: count("COMPLETED") },
                        { key: "CANCELLED", label: "Cancelled", count: count("CANCELLED") },
                    ]}
                />

                {loading ? (
                    <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
                ) : (
                    <FlatList
                        data={filtered}
                        keyExtractor={(a) => a.id}
                        renderItem={({ item }) => (
                            <CenterAppointmentCard
                                appointment={item}
                                onCancel={cancel}
                                onComplete={complete}
                                cancelling={busyId === item.id}
                                completing={busyId === item.id}
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
                                icon="calendar-outline"
                                title="Nothing here"
                                message="Appointments booked at your center will appear here."
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
});
