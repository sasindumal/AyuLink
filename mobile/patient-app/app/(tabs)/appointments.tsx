// ==============================================
// AyuLink Patient - Appointments
// Three ways to find a slot (kept side by side):
//   - Quick Search: filter by specialty/city/rating/
//     nearest, shows the soonest slot per doctor, with
//     a link into that doctor's full availability.
//   - By Doctor: search doctors, pick one, see every
//     upcoming slot they hold over the next 14 days.
//   - By Center: browse channeling centers, pick one,
//     see every doctor available there over the next
//     14 days.
// Plus My Appointments (Upcoming / Past) to manage
// existing bookings — the detail modal is the action
// surface (Reschedule/Cancel/Open in Maps), reachable
// from either the list card or a notification deep link.
// Rescheduling reuses whichever browse mode is active —
// the mode switcher stays visible the whole time now —
// selecting a slot calls app_reschedule_appointment
// instead of app_book_appointment.
// ==============================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../../src/lib/api";
import { useAuth } from "../../src/lib/auth";
import { colors, spacing } from "../../src/theme";
import { Banner, Button, EmptyState, FilterChips, ScreenHeader } from "../../src/components/ui";
import { SlotCard } from "../../src/components/SlotCard";
import { AppointmentCard } from "../../src/components/AppointmentCard";
import { SearchFilters, type SearchFilterState } from "../../src/components/SearchFilters";
import { DoctorBrowseView } from "../../src/components/DoctorBrowseView";
import { CenterBrowseView } from "../../src/components/CenterBrowseView";
import { AppointmentDetailModal } from "../../src/components/AppointmentDetailModal";
import { ConfirmModal } from "../../src/components/ConfirmModal";
import type { Appointment, DoctorSlot, DoctorSummary, Treatment } from "../../src/types";

type Mode = "quick" | "byDoctor" | "byCenter" | "mine";
type MineFilter = "upcoming" | "past";

const DEFAULT_FILTERS: SearchFilterState = {
    specialty: "",
    city: "",
    sort: "soonest",
    minRating: 0,
    lat: null,
    lng: null,
};

export default function Appointments() {
    const { user } = useAuth();
    const params = useLocalSearchParams<{ appointmentId?: string }>();
    const [mode, setMode] = useState<Mode>("mine");
    const [mineFilter, setMineFilter] = useState<MineFilter>("upcoming");
    const [filters, setFilters] = useState<SearchFilterState>(DEFAULT_FILTERS);
    const [slots, setSlots] = useState<DoctorSlot[]>([]);
    const [viewingDoctor, setViewingDoctor] = useState<DoctorSummary | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
    const [detailTarget, setDetailTarget] = useState<Appointment | null>(null);
    const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searching, setSearching] = useState(false);
    const [loadingMine, setLoadingMine] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const loadMine = useCallback(async () => {
        try {
            const [appts, tx] = await Promise.all([
                rpc<Appointment[]>("app_list_my_appointments"),
                rpc<Treatment[]>("app_list_my_treatments").catch(() => []),
            ]);
            setAppointments(appts ?? []);
            setTreatments(tx ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load your appointments");
        } finally {
            setLoadingMine(false);
            setRefreshing(false);
        }
    }, []);

    // useFocusEffect (not useEffect) — this tab stays mounted when you
    // switch away, so this re-fetches every time it regains focus (e.g.
    // right after booking/cancelling/rescheduling via chat).
    useFocusEffect(
        useCallback(() => {
            if (user) loadMine();
        }, [user, loadMine])
    );

    // Deep link from a notification: jump straight to "mine" and open
    // that appointment's detail once it's loaded.
    useEffect(() => {
        if (!params.appointmentId || loadingMine) return;
        const target = appointments.find((a) => a.id === params.appointmentId);
        if (target) {
            setMode("mine");
            setDetailTarget(target);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.appointmentId, loadingMine]);

    const search = useCallback(async () => {
        setSearching(true);
        setError(null);
        try {
            const data = await rpc<DoctorSlot[]>("app_search_doctor_slots", {
                p_specialty: filters.specialty.trim() || null,
                p_city: filters.city.trim() || null,
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
        if (mode === "quick" && user) search();
    }, [mode, user]); // eslint-disable-line react-hooks/exhaustive-deps

    const startReschedule = (appointment: Appointment) => {
        setDetailTarget(null);
        setRescheduleTarget(appointment);
        setFilters({ ...DEFAULT_FILTERS, specialty: appointment.doctor.specialty ?? "" });
        setMode("quick");
    };

    const book = async (scheduleId: string, date: string) => {
        const key = `${scheduleId}-${date}`;
        setBusyKey(key);
        setError(null);
        try {
            if (rescheduleTarget) {
                await rpc("app_reschedule_appointment", {
                    p_appointment_id: rescheduleTarget.id,
                    p_new_doctor_schedule_id: scheduleId,
                    p_new_date: date,
                });
                Alert.alert("Rescheduled", `Your appointment ${rescheduleTarget.order_number} was moved.`);
                setRescheduleTarget(null);
            } else {
                const booked = await rpc<Appointment>("app_book_appointment", {
                    p_doctor_schedule_id: scheduleId,
                    p_appointment_date: date,
                });
                Alert.alert("Booked!", `Your order number is ${booked.order_number}.`);
            }
            setViewingDoctor(null);
            setMode("mine");
            setMineFilter("upcoming");
            await loadMine();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Booking failed");
        } finally {
            setBusyKey(null);
        }
    };

    const cancel = async (id: string, reason: string) => {
        setBusyKey(id);
        try {
            await rpc("app_cancel_appointment", { p_appointment_id: id, p_reason: reason || null });
            await loadMine();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to cancel appointment");
        } finally {
            setBusyKey(null);
        }
    };

    const cancelReschedule = () => {
        setRescheduleTarget(null);
        setViewingDoctor(null);
        setMode("mine");
    };

    const changeMode = (next: Mode) => {
        setViewingDoctor(null);
        setMode(next);
    };

    const viewOtherTimes = (slot: DoctorSlot) => {
        setViewingDoctor({
            doctorId: slot.doctorId,
            doctorFirstName: slot.doctorFirstName,
            doctorLastName: slot.doctorLastName,
            specialty: slot.specialty,
            rating: slot.rating,
        });
        setMode("byDoctor");
    };

    const goToTreatment = (treatment: Treatment) => {
        setDetailTarget(null);
        router.push({ pathname: "/diagnosis", params: { threadId: treatment.thread_id } });
    };

    const mineList = useMemo(() => {
        const upcoming = appointments.filter((a) => a.status === "BOOKED");
        const past = appointments.filter((a) => a.status !== "BOOKED");
        return mineFilter === "upcoming" ? upcoming : past;
    }, [appointments, mineFilter]);

    const linkedTreatment = detailTarget
        ? treatments.find((t) => t.appointment_id === detailTarget.id) ?? null
        : null;

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <View style={styles.container}>
                <ScreenHeader
                    title="Appointments"
                    subtitle={
                        rescheduleTarget
                            ? `Choose a new slot for ${rescheduleTarget.order_number}`
                            : "Find, book, and manage your visits"
                    }
                />

                {error && <Banner kind="error" message={error} />}

                {rescheduleTarget && (
                    <View style={styles.rescheduleBanner}>
                        <Ionicons name="swap-horizontal" size={16} color={colors.primaryDark} />
                        <Text style={styles.rescheduleText}>
                            Rescheduling {rescheduleTarget.order_number}
                        </Text>
                        <Text style={styles.rescheduleCancel} onPress={cancelReschedule}>
                            Cancel
                        </Text>
                    </View>
                )}

                <FilterChips<Mode>
                    value={mode}
                    onChange={changeMode}
                    options={[
                        { key: "quick", label: "Quick Search" },
                        { key: "byDoctor", label: "By Doctor" },
                        { key: "byCenter", label: "By Center" },
                        { key: "mine", label: "My Appointments", count: appointments.length },
                    ]}
                />

                {mode === "quick" && (
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
                            <SlotCard
                                doctorName={`Dr. ${item.doctorFirstName} ${item.doctorLastName}`}
                                specialty={item.specialty}
                                rating={item.rating}
                                centerName={item.channelingCenterName}
                                address={item.address}
                                city={item.city}
                                distanceKm={item.distanceKm}
                                date={item.nextAvailableDate}
                                startTime={item.startTime}
                                endTime={item.endTime}
                                onBook={() => book(item.doctorScheduleId, item.nextAvailableDate)}
                                booking={busyKey === `${item.doctorScheduleId}-${item.nextAvailableDate}`}
                                onViewOtherTimes={() => viewOtherTimes(item)}
                            />
                        )}
                        contentContainerStyle={{ paddingBottom: spacing.xl }}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            !searching ? (
                                <EmptyState
                                    icon="search-outline"
                                    title="No availability found"
                                    message="Try a different specialty, city, or rating filter."
                                />
                            ) : null
                        }
                    />
                )}

                {mode === "byDoctor" && (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
                        <DoctorBrowseView
                            onBook={book}
                            bookingKey={busyKey}
                            initialDoctor={viewingDoctor}
                            onLeaveInitialDoctor={() => setViewingDoctor(null)}
                        />
                    </ScrollView>
                )}

                {mode === "byCenter" && (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
                        <CenterBrowseView onBook={book} bookingKey={busyKey} />
                    </ScrollView>
                )}

                {mode === "mine" &&
                    (loadingMine ? (
                        <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
                    ) : (
                        <FlatList
                            data={mineList}
                            keyExtractor={(a) => a.id}
                            ListHeaderComponent={
                                <FilterChips<MineFilter>
                                    value={mineFilter}
                                    onChange={setMineFilter}
                                    options={[
                                        { key: "upcoming", label: "Upcoming", count: appointments.filter((a) => a.status === "BOOKED").length },
                                        { key: "past", label: "Past & Cancelled", count: appointments.filter((a) => a.status !== "BOOKED").length },
                                    ]}
                                />
                            }
                            renderItem={({ item }) => (
                                <AppointmentCard
                                    appointment={item}
                                    onRequestCancel={setCancelTarget}
                                    onReschedule={startReschedule}
                                    onPress={setDetailTarget}
                                    cancelling={busyKey === item.id}
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
                                    title={mineFilter === "upcoming" ? "No upcoming appointments" : "No past appointments"}
                                    message={
                                        mineFilter === "upcoming"
                                            ? "Search and book a doctor's slot to see it here."
                                            : "Completed and cancelled appointments will show up here."
                                    }
                                />
                            }
                        />
                    ))}

                <AppointmentDetailModal
                    appointment={detailTarget}
                    linkedTreatment={linkedTreatment}
                    cancelling={!!detailTarget && busyKey === detailTarget.id}
                    onClose={() => setDetailTarget(null)}
                    onReschedule={startReschedule}
                    onRequestCancel={(a) => {
                        setDetailTarget(null);
                        setCancelTarget(a);
                    }}
                    onViewTreatment={goToTreatment}
                />

                <ConfirmModal
                    visible={!!cancelTarget}
                    title="Cancel this appointment?"
                    message={
                        cancelTarget
                            ? `Dr. ${cancelTarget.doctor.firstName} ${cancelTarget.doctor.lastName} at ${cancelTarget.channelingCenter.name} will be notified.`
                            : ""
                    }
                    confirmLabel="Cancel Appointment"
                    destructive
                    showReasonInput
                    loading={!!cancelTarget && busyKey === cancelTarget.id}
                    onConfirm={(reason) => {
                        if (!cancelTarget) return;
                        const target = cancelTarget;
                        setCancelTarget(null);
                        cancel(target.id, reason);
                    }}
                    onCancel={() => setCancelTarget(null)}
                />
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
