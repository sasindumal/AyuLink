// ==============================================
// AyuLink Patient - Appointments
//
// Two jobs, not four search strategies:
//   * Managing what's booked (the default). The soonest visit gets a
//     hero card with the full address; the rest follow under "Later".
//     Search/specialty/city/sort live on Past, where a long history
//     actually warrants filtering.
//   * Finding a doctor — entered deliberately from the bottom of that
//     list, never asked upfront.
//
// "By doctor" and "by centre" still exist, but as drill-downs reached
// from a result (a slot's "other times", or the browse-centres link)
// rather than modes chosen before searching anything. Every non-default
// view carries its own way back, so there's no mode switcher.
//
// The detail modal remains the action surface (Reschedule / Cancel /
// Open in Maps), reachable from a list card or a notification deep
// link. Rescheduling reuses the same search flow — selecting a slot
// calls app_reschedule_appointment instead of app_book_appointment.
// ==============================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Pressable,
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
import { colors, radius, spacing } from "../../src/theme";
import { Banner, Button, EmptyState, FilterChips, Input, ScreenHeader } from "../../src/components/ui";
import { SlotCard } from "../../src/components/SlotCard";
import { AppointmentCard } from "../../src/components/AppointmentCard";
import { NextAppointmentCard } from "../../src/components/NextAppointmentCard";
import { SearchFilters, type SearchFilterState } from "../../src/components/SearchFilters";
import { SelectField } from "../../src/components/SelectField";
import { DoctorBrowseView } from "../../src/components/DoctorBrowseView";
import { CenterBrowseView } from "../../src/components/CenterBrowseView";
import { useLookups } from "../../src/lib/lookups";
import { AppointmentDetailModal } from "../../src/components/AppointmentDetailModal";
import { ConfirmModal } from "../../src/components/ConfirmModal";
import { SlotPicker, type PickerSlot } from "../../src/components/SlotPicker";
import { syncAppointmentReminders } from "../../src/lib/reminders";
import type {
    Appointment,
    DoctorAvailabilitySlot,
    DoctorSlot,
    DoctorSummary,
    Treatment,
} from "../../src/types";

type Mode = "quick" | "byDoctor" | "byCenter" | "mine";
type MineFilter = "upcoming" | "past";
type MineSort = "date" | "doctor" | "center";

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
    const [mineQuery, setMineQuery] = useState("");
    const [mineSpecialty, setMineSpecialty] = useState("");
    const [mineCity, setMineCity] = useState("");
    const [mineSort, setMineSort] = useState<MineSort>("date");
    const { specialties, cities } = useLookups();
    const [filters, setFilters] = useState<SearchFilterState>(DEFAULT_FILTERS);
    const [slots, setSlots] = useState<DoctorSlot[]>([]);
    // Free-text filter over the result list. This is what replaces
    // "By Doctor" / "By Center" as top-level modes: typing a doctor's or
    // centre's name narrows the one list, instead of the patient having to
    // choose a search strategy before searching anything.
    const [slotQuery, setSlotQuery] = useState("");
    const [viewingDoctor, setViewingDoctor] = useState<DoctorSummary | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
    const [detailTarget, setDetailTarget] = useState<Appointment | null>(null);
    const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Booking is a two-step commit here too: picking a doctor loads their
    // whole schedule into this picker, and only Confirm calls the RPC.
    // Same component the assistant's choose_slot step uses, so a slot
    // chosen by tapping and one chosen by chatting are the same thing.
    const [picker, setPicker] = useState<{
        doctor: { first_name?: string; last_name?: string; specialty?: string | null; rating?: number | null };
        slots: PickerSlot[];
        preselected: { doctor_schedule_id?: string | null; date?: string | null };
    } | null>(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
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
            // Keep the "3 hours before" nudges in step with what's
            // actually booked — this runs on every focus, so a reschedule
            // or cancellation made anywhere (here, the chat, the centre's
            // own app) corrects the reminder on the next visit.
            syncAppointmentReminders(appts ?? []).catch(() => {});
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

    // Rescheduling is "same doctor, same centre, different time" — so it
    // opens that doctor's remaining slots at that centre directly, rather
    // than dropping the patient back into a specialty-wide search. Moving
    // to a different doctor or a different clinic isn't a reschedule; it's
    // a cancel-and-rebook, which the detail modal already offers.
    const startReschedule = (appointment: Appointment) => {
        setDetailTarget(null);
        setRescheduleTarget(appointment);
        openSlotPickerForDoctor(
            appointment.doctor.id,
            {
                first_name: appointment.doctor.firstName,
                last_name: appointment.doctor.lastName,
                specialty: appointment.doctor.specialty,
                rating: appointment.doctor.rating,
            },
            {
                doctor_schedule_id: appointment.doctor_schedule_id,
                date: appointment.appointment_date,
            },
            appointment.channeling_center_id
        );
    };

    /** Step 1 of booking: load this doctor's real schedule and open the
     *  picker with the tapped slot preselected. Nothing is committed. */
    const openSlotPicker = async (slot: DoctorSlot) => {
        setLoadingSlots(true);
        setError(null);
        try {
            const available = await rpc<DoctorAvailabilitySlot[]>("app_get_doctor_availability", {
                p_doctor_id: slot.doctorId,
                p_lookahead_days: 21,
            });
            setPicker({
                doctor: {
                    first_name: slot.doctorFirstName,
                    last_name: slot.doctorLastName,
                    specialty: slot.specialty,
                    rating: slot.rating,
                },
                slots: (available ?? []) as PickerSlot[],
                preselected: {
                    doctor_schedule_id: slot.doctorScheduleId,
                    date: slot.nextAvailableDate,
                },
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't load that doctor's times");
        } finally {
            setLoadingSlots(false);
        }
    };

    /** Same, for the by-doctor / by-centre drill-downs, which already hand
     *  back a concrete (schedule, date) pair.
     *
     *  `onlyCenterId` narrows to a single channeling centre — used when
     *  rescheduling, where "same doctor, same place, different time" is
     *  what the patient means, and offering that doctor's slots at a
     *  clinic across the island is a way to send someone to the wrong
     *  building. */
    const openSlotPickerForDoctor = async (
        doctorId: string,
        doctor: { first_name?: string; last_name?: string; specialty?: string | null; rating?: number | null },
        preselect: { doctor_schedule_id: string; date: string },
        onlyCenterId?: string
    ) => {
        setLoadingSlots(true);
        setError(null);
        try {
            const available = await rpc<DoctorAvailabilitySlot[]>("app_get_doctor_availability", {
                p_doctor_id: doctorId,
                p_lookahead_days: 21,
            });
            const slots = (available ?? []).filter(
                (s) => !onlyCenterId || s.channelingCenterId === onlyCenterId
            ) as PickerSlot[];
            if (slots.length === 0) {
                setError(
                    onlyCenterId
                        ? "That doctor has no other times at this centre in the next 3 weeks. You can cancel and book a different one instead."
                        : "That doctor has no available times in the next 3 weeks."
                );
                return;
            }
            setPicker({ doctor, slots, preselected: preselect });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't load that doctor's times");
        } finally {
            setLoadingSlots(false);
        }
    };

    /** Step 2: the patient confirmed an exact slot — commit it. */
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
            setPicker(null);
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
        setPicker(null);
        setViewingDoctor(null);
        setMode("mine");
    };

    const changeMode = (next: Mode) => {
        setViewingDoctor(null);
        // A stale text filter left over from a previous visit would
        // silently hide results that a fresh search just returned.
        if (next === "quick") setSlotQuery("");
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
        let list = mineFilter === "upcoming" ? upcoming : past;

        if (mineSpecialty) {
            list = list.filter((a) => a.doctor.specialty === mineSpecialty);
        }
        if (mineCity) {
            list = list.filter((a) => a.channelingCenter.city === mineCity);
        }

        const q = mineQuery.trim().toLowerCase();
        if (q) {
            list = list.filter((a) => {
                const doctorName = `dr. ${a.doctor.firstName} ${a.doctor.lastName}`.toLowerCase();
                return (
                    doctorName.includes(q) ||
                    (a.doctor.specialty ?? "").toLowerCase().includes(q) ||
                    a.channelingCenter.name.toLowerCase().includes(q) ||
                    (a.channelingCenter.city ?? "").toLowerCase().includes(q) ||
                    a.order_number.toLowerCase().includes(q)
                );
            });
        }

        list = [...list].sort((a, b) => {
            if (mineSort === "doctor") {
                return `${a.doctor.firstName} ${a.doctor.lastName}`.localeCompare(
                    `${b.doctor.firstName} ${b.doctor.lastName}`
                );
            }
            if (mineSort === "center") {
                return a.channelingCenter.name.localeCompare(b.channelingCenter.name);
            }
            const aKey = `${a.appointment_date} ${a.start_time}`;
            const bKey = `${b.appointment_date} ${b.start_time}`;
            return mineFilter === "upcoming" ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey);
        });

        return list;
    }, [appointments, mineFilter, mineQuery, mineSpecialty, mineCity, mineSort]);

    const linkedTreatment = detailTarget
        ? treatments.find((t) => t.appointment_id === detailTarget.id) ?? null
        : null;

    // The soonest upcoming appointment gets its own card above the list —
    // it's what people open this tab for. Only when the list is otherwise
    // unfiltered and sorted by date, so the "next" claim is actually true:
    // under a name sort or an active search, the first row isn't the
    // soonest and a hero would be lying. It's then dropped from the list
    // below so the same appointment doesn't appear twice.
    const isUnfilteredUpcoming =
        mineFilter === "upcoming" &&
        mineSort === "date" &&
        !mineQuery.trim() &&
        !mineSpecialty &&
        !mineCity;
    const heroAppointment = isUnfilteredUpcoming ? mineList[0] ?? null : null;
    const mineListBody = heroAppointment ? mineList.slice(1) : mineList;

    const visibleSlots = useMemo(() => {
        const q = slotQuery.trim().toLowerCase();
        if (!q) return slots;
        return slots.filter(
            (s) =>
                `dr. ${s.doctorFirstName} ${s.doctorLastName}`.toLowerCase().includes(q) ||
                (s.specialty ?? "").toLowerCase().includes(q) ||
                s.channelingCenterName.toLowerCase().includes(q) ||
                (s.city ?? "").toLowerCase().includes(q)
        );
    }, [slots, slotQuery]);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <View style={styles.container}>
                <ScreenHeader
                    title="Appointments"
                    subtitle={
                        rescheduleTarget
                            ? `Choose a new slot for ${rescheduleTarget.order_number}`
                            : mode !== "mine"
                              ? "Pick a doctor and a time"
                              : mineFilter === "past"
                                ? "Past & cancelled"
                                : `${appointments.filter((a) => a.status === "BOOKED").length} upcoming`
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

                {/* Two jobs, not four search strategies. "By doctor" and
                    "by centre" are still reachable — but as drill-downs from
                    a result (see viewOtherTimes / the browse-centres link),
                    not as a question asked before you've searched. */}
                {/* No mode switcher. Finding a doctor is entered deliberately
                    from the bottom of the upcoming list, and every non-default
                    view carries its own way back — so nothing asks the patient
                    to choose a mode before they've done anything. */}
                {mode !== "mine" && (
                    <Pressable
                        onPress={() => changeMode(mode === "quick" ? "mine" : "quick")}
                        style={styles.backRow}
                    >
                        <Ionicons name="arrow-back" size={17} color={colors.primaryDark} />
                        <Text style={styles.backRowText}>
                            {mode === "quick" ? "My appointments" : "Back to search"}
                        </Text>
                    </Pressable>
                )}

                {mode === "mine" && mineFilter === "past" && (
                    <Pressable onPress={() => setMineFilter("upcoming")} style={styles.backRow}>
                        <Ionicons name="arrow-back" size={17} color={colors.primaryDark} />
                        <Text style={styles.backRowText}>Upcoming</Text>
                    </Pressable>
                )}

                {mode === "quick" && (
                    <FlatList
                        data={visibleSlots}
                        keyExtractor={(s) => s.doctorScheduleId}
                        ListHeaderComponent={
                            <View style={{ marginBottom: spacing.sm }}>
                                <Input
                                    placeholder="Doctor, specialty, or centre name"
                                    value={slotQuery}
                                    onChangeText={setSlotQuery}
                                />
                                <SearchFilters value={filters} onChange={setFilters} />
                                <Button title="Search" onPress={search} loading={searching} />
                                <Pressable
                                    onPress={() => changeMode("byCenter")}
                                    style={styles.browseCentresRow}
                                >
                                    <Ionicons name="business-outline" size={15} color={colors.primaryDark} />
                                    <Text style={styles.browseCentresText}>
                                        Or browse by channeling centre
                                    </Text>
                                    <Ionicons name="chevron-forward" size={15} color={colors.primaryDark} />
                                </Pressable>
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
                                onBook={() => openSlotPicker(item)}
                                booking={loadingSlots || busyKey === `${item.doctorScheduleId}-${item.nextAvailableDate}`}
                                onViewOtherTimes={() => viewOtherTimes(item)}
                            />
                        )}
                        contentContainerStyle={{ paddingBottom: spacing.xl }}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            searching ? null : slots.length > 0 ? (
                                // Results exist; the text filter just excluded them
                                // all. Telling someone to change their specialty
                                // filter here would send them the wrong way.
                                <EmptyState
                                    icon="search-outline"
                                    title="No matches"
                                    message={`No doctor or centre matches "${slotQuery.trim()}".`}
                                />
                            ) : (
                                <EmptyState
                                    icon="search-outline"
                                    title="No availability found"
                                    message="Try a different specialty, city, or rating filter."
                                />
                            )
                        }
                    />
                )}

                {mode === "byDoctor" && (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
                        <DoctorBrowseView
                            onBook={(scheduleId, date, doctor) =>
                                openSlotPickerForDoctor(
                                    doctor.doctorId,
                                    {
                                        first_name: doctor.doctorFirstName,
                                        last_name: doctor.doctorLastName,
                                        specialty: doctor.specialty,
                                        rating: doctor.rating,
                                    },
                                    { doctor_schedule_id: scheduleId, date }
                                )
                            }
                            bookingKey={busyKey}
                            initialDoctor={viewingDoctor}
                            onLeaveInitialDoctor={() => setViewingDoctor(null)}
                        />
                    </ScrollView>
                )}

                {mode === "byCenter" && (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
                        <CenterBrowseView
                            onBook={(scheduleId, date, slot) =>
                                openSlotPickerForDoctor(
                                    slot.doctorId,
                                    {
                                        first_name: slot.doctorFirstName,
                                        last_name: slot.doctorLastName,
                                        specialty: slot.specialty,
                                        rating: slot.rating,
                                    },
                                    { doctor_schedule_id: scheduleId, date }
                                )
                            }
                            bookingKey={busyKey}
                        />
                    </ScrollView>
                )}

                {mode === "mine" &&
                    (loadingMine ? (
                        <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
                    ) : (
                        <FlatList
                            data={mineListBody}
                            keyExtractor={(a) => a.id}
                            ListHeaderComponent={
                                <View>
                                    {heroAppointment && (
                                        <NextAppointmentCard
                                            appointment={heroAppointment}
                                            onPress={setDetailTarget}
                                            onReschedule={startReschedule}
                                        />
                                    )}
                                    {/* Search and filters belong to Past, where the
                                        list is a long history worth narrowing. An
                                        upcoming list is two or three items — filtering
                                        it is chrome that earns nothing. */}
                                    {mineFilter === "past" && (
                                        <>
                                            <Input
                                                placeholder="Search by doctor, center, or order number"
                                                value={mineQuery}
                                                onChangeText={setMineQuery}
                                            />
                                            <View style={styles.filterRow}>
                                                <View style={{ flex: 1 }}>
                                                    <SelectField
                                                        label="Specialty"
                                                        value={mineSpecialty}
                                                        options={specialties}
                                                        onChange={setMineSpecialty}
                                                    />
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <SelectField
                                                        label="City"
                                                        value={mineCity}
                                                        options={cities}
                                                        onChange={setMineCity}
                                                    />
                                                </View>
                                            </View>
                                            <Text style={styles.sortLabel}>Sort by</Text>
                                            <FilterChips<MineSort>
                                                value={mineSort}
                                                onChange={setMineSort}
                                                options={[
                                                    { key: "date", label: "Date/Time" },
                                                    { key: "doctor", label: "Doctor" },
                                                    { key: "center", label: "Center" },
                                                ]}
                                            />
                                        </>
                                    )}

                                    {heroAppointment && mineListBody.length > 0 && (
                                        <Text style={styles.laterLabel}>Later</Text>
                                    )}
                                </View>
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
                            ListFooterComponent={
                                mineFilter === "upcoming" ? (
                                    <View style={{ marginTop: spacing.md }}>
                                        <Button
                                            title="Find a doctor"
                                            variant="secondary"
                                            icon="search"
                                            onPress={() => changeMode("quick")}
                                        />
                                        <Pressable
                                            onPress={() => setMineFilter("past")}
                                            style={styles.pastLink}
                                        >
                                            <Text style={styles.pastLinkText}>
                                                View past appointments
                                            </Text>
                                        </Pressable>
                                    </View>
                                ) : null
                            }
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
                                // With exactly one upcoming appointment the hero
                                // card takes it and the list body is empty — showing
                                // "No upcoming appointments" directly beneath the
                                // appointment itself would be plainly wrong.
                                heroAppointment ? null : (
                                    <EmptyState
                                        icon="calendar-outline"
                                        title={mineFilter === "upcoming" ? "No upcoming appointments" : "No past appointments"}
                                        message={
                                            mineFilter === "upcoming"
                                                ? "Search and book a doctor's slot to see it here."
                                                : "Completed and cancelled appointments will show up here."
                                        }
                                    />
                                )
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

                {picker && (
                    <SlotPicker
                        visible
                        doctor={picker.doctor}
                        slots={picker.slots}
                        preselected={picker.preselected}
                        message={
                            rescheduleTarget
                                ? `Moving ${rescheduleTarget.order_number} — these are ${rescheduleTarget.doctor.firstName ? `Dr. ${rescheduleTarget.doctor.lastName}` : "the doctor"}'s other times at ${rescheduleTarget.channelingCenter.name}.`
                                : null
                        }
                        confirmLabel={rescheduleTarget ? "Confirm New Time" : "Confirm Booking"}
                        busy={!!busyKey}
                        onConfirm={(s) => book(s.doctorScheduleId, s.date)}
                        // Backing out of a reschedule abandons it entirely —
                        // leaving the banner up with no way to reopen the
                        // picker would be a dead end.
                        onCancel={() => {
                            setPicker(null);
                            setRescheduleTarget(null);
                        }}
                    />
                )}

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
    sortLabel: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6, marginTop: 4 },
    filterRow: { flexDirection: "row", gap: 10 },
    rescheduleCancel: { fontSize: 13, fontWeight: "700", color: colors.danger },
    backRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 10,
        marginBottom: spacing.sm,
    },
    backRowText: { fontSize: 13.5, fontWeight: "700", color: colors.primaryDark },
    laterLabel: {
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: colors.textMuted,
        marginBottom: spacing.sm,
    },
    pastLink: { alignItems: "center", paddingVertical: 14 },
    pastLinkText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
    browseCentresRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: spacing.sm,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: radius.sm,
        backgroundColor: colors.primarySoft,
    },
    browseCentresText: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.primaryDark },
});
