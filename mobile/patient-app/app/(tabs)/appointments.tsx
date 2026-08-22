// ==============================================
// AyuLink Patient - Appointments
// Find & Book a doctor slot, or manage existing
// appointments. Rescheduling reuses the same search
// flow: pick a new slot for an existing appointment.
// ==============================================

import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, spacing } from "../../src/theme";
import { Banner, Button, EmptyState, FilterChips, ScreenHeader } from "../../src/components/ui";
import { DoctorSlotCard } from "../../src/components/DoctorSlotCard";
import { AppointmentCard } from "../../src/components/AppointmentCard";
import { SearchFilters, type SearchFilterState } from "../../src/components/SearchFilters";
import type { Appointment, DoctorSlot } from "../../src/types";

type TabView = "find" | "mine";

const DEFAULT_FILTERS: SearchFilterState = {
    specialty: "",
    district: "",
    sort: "soonest",
    minRating: 0,
    lat: null,
    lng: null,
};

export default function Appointments() {
    const { user } = useAuth();
    const [view, setView] = useState<TabView>("mine");
    const [filters, setFilters] = useState<SearchFilterState>(DEFAULT_FILTERS);
    const [slots, setSlots] = useState<DoctorSlot[]>([]);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searching, setSearching] = useState(false);
    const [loadingMine, setLoadingMine] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const loadMine = useCallback(async () => {
        try {
            const data = await rpc<Appointment[]>("app_list_my_appointments");
            setAppointments(data ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load your appointments");
        } finally {
            setLoadingMine(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (user) loadMine();
    }, [user, loadMine]);

    const search = useCallback(async () => {
        setSearching(true);
        setError(null);
        try {
            const data = await rpc<DoctorSlot[]>("app_search_doctor_slots", {
                p_specialty: filters.specialty.trim() || null,
                p_district: filters.district.trim() || null,
                p_near_lat: filters.lat,
                p_near_lng: filters.lng,
                p_min_rating: filters.minRating || null,
                p_sort: filters.sort,
            });
            setSlots(data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Search failed");
        } finally {
            setSearching(false);
        }
    }, [filters]);

    useEffect(() => {
        if (view === "find" && user) search();
    }, [view, user]); // eslint-disable-line react-hooks/exhaustive-deps

    const startReschedule = (appointment: Appointment) => {
        setRescheduleTarget(appointment);
        setFilters({ ...DEFAULT_FILTERS, specialty: appointment.doctor.specialty ?? "" });
        setView("find");
    };

    const book = async (slot: DoctorSlot) => {
        setBusyId(slot.doctorScheduleId);
        try {
            if (rescheduleTarget) {
                await rpc("app_reschedule_appointment", {
                    p_appointment_id: rescheduleTarget.id,
                    p_new_doctor_schedule_id: slot.doctorScheduleId,
                    p_new_date: slot.nextAvailableDate,
                });
                Alert.alert("Rescheduled", `Your appointment ${rescheduleTarget.order_number} was moved.`);
                setRescheduleTarget(null);
            } else {
                const booked = await rpc<Appointment>("app_book_appointment", {
                    p_doctor_schedule_id: slot.doctorScheduleId,
                    p_appointment_date: slot.nextAvailableDate,
                });
                Alert.alert("Booked!", `Your order number is ${booked.order_number}.`);
            }
            setView("mine");
            await loadMine();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Booking failed");
        } finally {
            setBusyId(null);
        }
    };

    const cancel = async (id: string, reason: string) => {
        setBusyId(id);
        try {
            await rpc("app_cancel_appointment", { p_appointment_id: id, p_reason: reason || null });
            await loadMine();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to cancel appointment");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <View style={styles.container}>
                <ScreenHeader
                    title="Appointments"
                    subtitle={rescheduleTarget ? `Choose a new slot for ${rescheduleTarget.order_number}` : "Find, book, and manage your visits"}
                />

                {error && <Banner kind="error" message={error} />}

                {rescheduleTarget && (
                    <View style={styles.rescheduleBanner}>
                        <Ionicons name="swap-horizontal" size={16} color={colors.primaryDark} />
                        <Text style={styles.rescheduleText}>
                            Rescheduling {rescheduleTarget.order_number}
                        </Text>
                        <Text
                            style={styles.rescheduleCancel}
                            onPress={() => {
                                setRescheduleTarget(null);
                                setView("mine");
                            }}
                        >
                            Cancel
                        </Text>
                    </View>
                )}

                {!rescheduleTarget && (
                    <FilterChips<TabView>
                        value={view}
                        onChange={setView}
                        options={[
                            { key: "find", label: "Find & Book" },
                            { key: "mine", label: "My Appointments", count: appointments.length },
                        ]}
                    />
                )}

                {view === "find" ? (
                    <FlatList
                        data={slots}
                        keyExtractor={(s) => s.doctorScheduleId}
                        ListHeaderComponent={
                            <View style={{ marginBottom: spacing.sm }}>
                                <SearchFilters value={filters} onChange={setFilters} />
                                <Button title="Search" onPress={search} loading={searching} />
                            </View>
                        }
                        renderItem={({ item }) => (
                            <DoctorSlotCard slot={item} onBook={book} booking={busyId === item.doctorScheduleId} />
                        )}
                        contentContainerStyle={{ paddingBottom: spacing.xl }}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            !searching ? (
                                <EmptyState
                                    icon="search-outline"
                                    title="No availability found"
                                    message="Try a different specialty, district, or rating filter."
                                />
                            ) : null
                        }
                    />
                ) : loadingMine ? (
                    <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
                ) : (
                    <FlatList
                        data={appointments}
                        keyExtractor={(a) => a.id}
                        renderItem={({ item }) => (
                            <AppointmentCard
                                appointment={item}
                                onCancel={cancel}
                                onReschedule={startReschedule}
                                cancelling={busyId === item.id}
                            />
                        )}
                        contentContainerStyle={{ paddingBottom: spacing.xl }}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => {
                                    setRefreshing(true);
                                    loadMine();
                                }}
                                tintColor={colors.primaryDark}
                            />
                        }
                        ListEmptyComponent={
                            <EmptyState
                                icon="calendar-outline"
                                title="No appointments yet"
                                message="Search and book a doctor's slot to see it here."
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
    rescheduleBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.primarySoft,
        borderRadius: 12,
        padding: spacing.sm,
        marginBottom: spacing.sm,
    },
    rescheduleText: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.primaryDark },
    rescheduleCancel: { fontSize: 13, fontWeight: "700", color: colors.danger },
});
