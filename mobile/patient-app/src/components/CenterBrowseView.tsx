// ==============================================
// AyuLink Patient - Browse by Channeling Center
// Find a center -> see the doctors available there ->
// pick a time in the next few days -> book.
// ==============================================

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../lib/api";
import { colors, spacing } from "../theme";
import { Banner, Button, Card, EmptyState, Input } from "./ui";
import { SlotCard } from "./SlotCard";
import type { CenterAvailabilitySlot, ChannelingCenterSummary } from "../types";

export function CenterBrowseView({
    onBook,
    bookingKey,
}: {
    onBook: (scheduleId: string, date: string) => void;
    bookingKey: string | null;
}) {
    const [query, setQuery] = useState("");
    const [centers, setCenters] = useState<ChannelingCenterSummary[]>([]);
    const [selected, setSelected] = useState<ChannelingCenterSummary | null>(null);
    const [availability, setAvailability] = useState<CenterAvailabilitySlot[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingAvail, setLoadingAvail] = useState(false);

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

    const filtered = centers.filter((c) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
            c.name.toLowerCase().includes(q) ||
            c.address.toLowerCase().includes(q) ||
            (c.city ?? "").toLowerCase().includes(q)
        );
    });

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
                                onBook={() => onBook(item.doctorScheduleId, item.date)}
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
    backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
    backText: { color: colors.primary, fontWeight: "700", fontSize: 13.5 },
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
