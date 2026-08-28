// ==============================================
// AyuLink Patient - Browse by Channeling Center
// Find a center -> see the doctors available there ->
// pick a time in the next few days -> book.
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
import { haversineKm, parseLocation } from "../lib/geo";
import type { CenterAvailabilitySlot, ChannelingCenterSummary } from "../types";

type CenterSort = "name" | "nearest";

export function CenterBrowseView({
    onBook,
    bookingKey,
}: {
    /** `slot` carries the doctor, so the caller can open the shared
     *  confirm/adjust picker rather than booking on a single tap. */
    onBook: (scheduleId: string, date: string, slot: CenterAvailabilitySlot) => void;
    bookingKey: string | null;
}) {
    const [query, setQuery] = useState("");
    const [city, setCity] = useState("");
    const [sort, setSort] = useState<CenterSort>("name");
    const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [locating, setLocating] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [centers, setCenters] = useState<ChannelingCenterSummary[]>([]);
    const [selected, setSelected] = useState<ChannelingCenterSummary | null>(null);
    const [availability, setAvailability] = useState<CenterAvailabilitySlot[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingAvail, setLoadingAvail] = useState(false);
    const { cities } = useLookups();

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await rpc<ChannelingCenterSummary[]>("app_list_channeling_centers");
            setCenters(data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load centers");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const withDistance = useMemo(
        () =>
            centers.map((c) => {
                const loc = parseLocation(c.location);
                const distanceKm = coords && loc ? haversineKm(coords, loc) : null;
                return { ...c, distanceKm };
            }),
        [centers, coords]
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        let result = withDistance.filter((c) => {
            const matchesQuery =
                !q ||
                c.name.toLowerCase().includes(q) ||
                c.address.toLowerCase().includes(q) ||
                (c.city ?? "").toLowerCase().includes(q);
            const matchesCity = !city || (c.city ?? "").toLowerCase() === city.toLowerCase();
            return matchesQuery && matchesCity;
        });
        if (sort === "nearest") {
            result = [...result].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
        } else {
            result = [...result].sort((a, b) => a.name.localeCompare(b.name));
        }
        return result;
    }, [withDistance, query, city, sort]);

    const useMyLocation = async () => {
        setLocating(true);
        setLocationError(null);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                setLocationError("Location permission was denied");
                return;
            }
            const pos = await Location.getCurrentPositionAsync({});
            setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            setSort("nearest");
        } catch {
            setLocationError("Could not get your location");
        } finally {
            setLocating(false);
        }
    };

    const openCenter = async (center: ChannelingCenterSummary) => {
        setSelected(center);
        setLoadingAvail(true);
        setError(null);
        try {
            const data = await rpc<CenterAvailabilitySlot[]>("app_get_center_availability", {
                p_channeling_center_id: center.id,
                p_lookahead_days: 14,
            });
            setAvailability(data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load availability");
        } finally {
            setLoadingAvail(false);
        }
    };

    if (selected) {
        return (
            <View>
                <View style={styles.backRow}>
                    <Ionicons
                        name="arrow-back"
                        size={18}
                        color={colors.primary}
                        onPress={() => setSelected(null)}
                    />
                    <Text style={styles.backText} onPress={() => setSelected(null)}>
                        Back to centers
                    </Text>
                </View>
                <Text style={styles.selectedTitle}>{selected.name}</Text>
                <Text style={styles.selectedSubtitle}>
                    {selected.address}
                    {selected.city ? `  ·  ${selected.city}` : ""}
                </Text>

                {error && <Banner kind="error" message={error} />}

                {loadingAvail ? (
                    <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
                ) : (
                    <FlatList
                        data={availability}
                        keyExtractor={(s, i) => `${s.doctorScheduleId}-${s.date}-${i}`}
                        scrollEnabled={false}
                        renderItem={({ item }) => (
                            <SlotCard
                                doctorName={`Dr. ${item.doctorFirstName} ${item.doctorLastName}`}
                                specialty={item.specialty}
                                rating={item.rating}
                                date={item.date}
                                startTime={item.startTime}
                                endTime={item.endTime}
                                onBook={() => onBook(item.doctorScheduleId, item.date, item)}
                                booking={bookingKey === `${item.doctorScheduleId}-${item.date}`}
                            />
                        )}
                        ListEmptyComponent={
                            <EmptyState
                                icon="calendar-outline"
                                title="No upcoming availability"
                                message="No doctors have free slots here in the next 14 days."
                            />
                        }
                    />
                )}
            </View>
        );
    }

    return (
        <View>
            <Input
                label="Search centers"
                placeholder="Name, address, or city"
                value={query}
                onChangeText={setQuery}
            />
            <SelectField label="City" value={city} options={cities} onChange={setCity} />

            <Text style={styles.label}>Sort by</Text>
            <FilterChips<CenterSort>
                value={sort}
                onChange={(next) => {
                    if (next === "nearest" && !coords) {
                        useMyLocation();
                        return;
                    }
                    setSort(next);
                }}
                options={[
                    { key: "name", label: "Name" },
                    { key: "nearest", label: locating ? "Locating…" : "Nearest" },
                ]}
            />
            {locationError && <Text style={styles.error}>{locationError}</Text>}

            {error && <Banner kind="error" message={error} />}

            {loading ? (
                <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(c) => c.id}
                    scrollEnabled={false}
                    renderItem={({ item }) => (
                        <Card style={styles.centerCard}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.centerName}>{item.name}</Text>
                                <Text style={styles.centerAddress}>
                                    {item.address}
                                    {item.city ? `  ·  ${item.city}` : ""}
                                    {item.distanceKm != null ? `  ·  ${item.distanceKm.toFixed(1)} km` : ""}
                                </Text>
                            </View>
                            <Button title="View" variant="secondary" onPress={() => openCenter(item)} />
                        </Card>
                    )}
                    ListEmptyComponent={
                        <EmptyState
                            icon="business-outline"
                            title="No centers found"
                            message="Try a different search term."
                        />
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6, marginTop: 4 },
    error: { fontSize: 12, color: colors.danger, marginTop: 4, marginBottom: spacing.sm },
    backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
    backText: { color: colors.primaryDark, fontWeight: "700", fontSize: 13.5 },
    selectedTitle: { fontSize: 17, fontWeight: "800", color: colors.primaryDark },
    selectedSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
    centerCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: spacing.sm,
    },
    centerName: { fontSize: 14.5, fontWeight: "700", color: colors.primaryDark },
    centerAddress: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
});
