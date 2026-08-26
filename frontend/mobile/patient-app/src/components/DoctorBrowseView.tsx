// ==============================================
// AyuLink Patient - Browse by Doctor
// Search doctors -> pick one -> see their available
// places and times for the next few days -> book.
// Can also be handed a doctor directly (initialDoctor)
// to jump straight to their availability — used by
// Quick Search's "See other times with this doctor".
// ==============================================

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { rpc } from "../lib/api";
import { colors, spacing } from "../theme";
import { Banner, Button, Card, EmptyState, FilterChips, Input } from "./ui";
import { SelectField } from "./SelectField";
import { SlotCard } from "./SlotCard";
import { useLookups } from "../lib/lookups";
import type { DoctorAvailabilitySlot, DoctorSummary } from "../types";

type DetailSort = "soonest" | "center" | "nearest";
type MinRating = 0 | 3 | 4 | 4.5;

export function DoctorBrowseView({
    onBook,
    bookingKey,
    initialDoctor,
    onLeaveInitialDoctor,
}: {
    onBook: (scheduleId: string, date: string) => void;
    bookingKey: string | null;
    initialDoctor?: DoctorSummary | null;
    onLeaveInitialDoctor?: () => void;
}) {
    const [specialty, setSpecialty] = useState("");
    const [city, setCity] = useState("");
    const [minRating, setMinRating] = useState<MinRating>(0);
    const [sortByRating, setSortByRating] = useState(false);
    const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
    const [selected, setSelected] = useState<DoctorSummary | null>(initialDoctor ?? null);
    const [availability, setAvailability] = useState<DoctorAvailabilitySlot[]>([]);
    const [centerQuery, setCenterQuery] = useState("");
    const [detailSort, setDetailSort] = useState<DetailSort>("soonest");
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [locating, setLocating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingAvail, setLoadingAvail] = useState(false);
    const { specialties, cities } = useLookups();

    const search = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await rpc<DoctorSummary[]>("app_search_doctors", {
                p_specialty: specialty.trim() || null,
                p_city: city.trim() || null,
                p_min_rating: minRating || null,
            });
            setDoctors(data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Search failed");
        } finally {
            setLoading(false);
        }
    }, [specialty, city, minRating]);

    const sortedDoctors = useMemo(() => {
        if (!sortByRating) return doctors;
        return [...doctors].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    }, [doctors, sortByRating]);

    const visibleAvailability = useMemo(() => {
        const q = centerQuery.trim().toLowerCase();
        if (!q) return availability;
        return availability.filter(
            (s) =>
                s.channelingCenterName.toLowerCase().includes(q) ||
                (s.city ?? "").toLowerCase().includes(q) ||
                s.address.toLowerCase().includes(q)
        );
    }, [availability, centerQuery]);

    const loadAvailability = useCallback(
        async (doctorId: string, sort: DetailSort, loc: { lat: number; lng: number } | null) => {
            setLoadingAvail(true);
            setError(null);
            try {
                const data = await rpc<DoctorAvailabilitySlot[]>("app_get_doctor_availability", {
                    p_doctor_id: doctorId,
                    p_lookahead_days: 14,
                    p_near_lat: loc?.lat ?? null,
                    p_near_lng: loc?.lng ?? null,
                    p_sort: sort,
                });
                setAvailability(data ?? []);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to load availability");
            } finally {
                setLoadingAvail(false);
            }
        },
        []
    );

    const openDoctor = useCallback(
        (doctor: DoctorSummary) => {
            setSelected(doctor);
            setCenterQuery("");
            setDetailSort("soonest");
            loadAvailability(doctor.doctorId, "soonest", coords);
        },
        [coords, loadAvailability]
    );

    const useMyLocation = async () => {
        setLocating(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                setError("Location permission was denied");
                return;
            }
            const pos = await Location.getCurrentPositionAsync({});
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setCoords(loc);
            setDetailSort("nearest");
            if (selected) loadAvailability(selected.doctorId, "nearest", loc);
        } catch {
            setError("Could not get your location");
        } finally {
            setLocating(false);
        }
    };

    const changeDetailSort = (sort: DetailSort) => {
        if (sort === "nearest" && !coords) {
            useMyLocation();
            return;
        }
        setDetailSort(sort);
        if (selected) loadAvailability(selected.doctorId, sort, coords);
    };

    useEffect(() => {
        if (initialDoctor) {
            openDoctor(initialDoctor);
        } else {
            search();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const goBackToDoctors = () => {
        setSelected(null);
        if (initialDoctor) onLeaveInitialDoctor?.();
    };

    if (selected) {
        return (
            <View>
                <View style={styles.backRow}>
                    <Ionicons name="arrow-back" size={18} color={colors.primary} onPress={goBackToDoctors} />
                    <Text style={styles.backText} onPress={goBackToDoctors}>
                        Back to doctors
                    </Text>
                </View>
                <Text style={styles.selectedTitle}>
                    Dr. {selected.doctorFirstName} {selected.doctorLastName}
                </Text>
                <Text style={styles.selectedSubtitle}>
                    {selected.specialty}
                    {selected.rating != null ? `  ·  ★ ${selected.rating.toFixed(1)}` : ""}
                </Text>

                {error && <Banner kind="error" message={error} />}

                <Input
                    label="Search centers"
                    placeholder="Name, address, or city"
                    value={centerQuery}
                    onChangeText={setCenterQuery}
                />
                <Text style={styles.label}>Sort by</Text>
                <FilterChips<DetailSort>
                    value={detailSort}
                    onChange={changeDetailSort}
                    options={[
                        { key: "soonest", label: "Soonest" },
                        { key: "center", label: "Center" },
                        { key: "nearest", label: locating ? "Locating…" : "Nearest" },
                    ]}
                />

                {loadingAvail ? (
                    <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
                ) : (
                    <FlatList
                        data={visibleAvailability}
                        keyExtractor={(s, i) => `${s.doctorScheduleId}-${s.date}-${i}`}
                        scrollEnabled={false}
                        renderItem={({ item }) => (
                            <SlotCard
                                centerName={item.channelingCenterName}
                                address={item.address}
                                city={item.city}
                                distanceKm={item.distanceKm}
                                date={item.date}
                                startTime={item.startTime}
                                endTime={item.endTime}
                                onBook={() => onBook(item.doctorScheduleId, item.date)}
                                booking={bookingKey === `${item.doctorScheduleId}-${item.date}`}
                            />
                        )}
                        ListEmptyComponent={
                            <EmptyState
                                icon="calendar-outline"
                                title="No upcoming availability"
                                message="This doctor has no free slots in the next 14 days."
                            />
                        }
                    />
                )}
            </View>
        );
    }

    return (
        <View>
            <SelectField label="Specialty" value={specialty} options={specialties} onChange={setSpecialty} />
            <SelectField label="City" value={city} options={cities} onChange={setCity} />

            <Text style={styles.label}>Minimum rating</Text>
            <FilterChips<string>
                value={String(minRating)}
                onChange={(v) => setMinRating(Number(v) as MinRating)}
                options={[
                    { key: "0", label: "Any" },
                    { key: "3", label: "3+" },
                    { key: "4", label: "4+" },
                    { key: "4.5", label: "4.5+" },
                ]}
            />

            <Button title="Search Doctors" onPress={search} loading={loading} />

            {error && <Banner kind="error" message={error} />}

            <View style={styles.sortRow}>
                <Text style={styles.sortLabel}>{sortedDoctors.length} doctor{sortedDoctors.length === 1 ? "" : "s"}</Text>
                <FilterChips<"off" | "on">
                    value={sortByRating ? "on" : "off"}
                    onChange={() => setSortByRating((v) => !v)}
                    options={[{ key: "on", label: sortByRating ? "Sorted by rating ✓" : "Sort by rating" }]}
                />
            </View>

            <FlatList
                data={sortedDoctors}
                keyExtractor={(d) => d.doctorId}
                scrollEnabled={false}
                contentContainerStyle={{ marginTop: spacing.sm }}
                renderItem={({ item }) => (
                    <Card style={styles.doctorCard}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.doctorName}>
                                Dr. {item.doctorFirstName} {item.doctorLastName}
                            </Text>
                            <Text style={styles.doctorSpecialty}>
                                {item.specialty}
                                {item.rating != null ? `  ·  ★ ${item.rating.toFixed(1)}` : ""}
                            </Text>
                        </View>
                        <Button title="View" variant="secondary" onPress={() => openDoctor(item)} />
                    </Card>
                )}
                ListEmptyComponent={
                    !loading ? (
                        <EmptyState
                            icon="people-outline"
                            title="No doctors found"
                            message="Try a different specialty or city."
                        />
                    ) : null
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6, marginTop: 4 },
    sortRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: spacing.sm,
    },
    sortLabel: { fontSize: 12.5, color: colors.textMuted, fontWeight: "600" },
    backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
    backText: { color: colors.primary, fontWeight: "700", fontSize: 13.5 },
    selectedTitle: { fontSize: 17, fontWeight: "800", color: colors.primaryDark },
    selectedSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
    doctorCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: spacing.sm,
    },
    doctorName: { fontSize: 14.5, fontWeight: "700", color: colors.primaryDark },
    doctorSpecialty: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
});
