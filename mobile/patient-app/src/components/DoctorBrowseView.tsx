// ==============================================
// AyuLink Patient - Browse by Doctor
// Search doctors -> pick one -> see their available
// places and times for the next few days -> book.
// ==============================================

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../lib/api";
import { colors, spacing } from "../theme";
import { Banner, Button, Card, EmptyState, Input, formatDate } from "./ui";
import type { DoctorAvailabilitySlot, DoctorSummary } from "../types";

export function DoctorBrowseView({
    onBook,
    bookingKey,
}: {
    onBook: (scheduleId: string, date: string) => void;
    bookingKey: string | null;
}) {
    const [specialty, setSpecialty] = useState("");
    const [city, setCity] = useState("");
    const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
    const [selected, setSelected] = useState<DoctorSummary | null>(null);
    const [availability, setAvailability] = useState<DoctorAvailabilitySlot[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingAvail, setLoadingAvail] = useState(false);

    const search = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await rpc<DoctorSummary[]>("app_search_doctors", {
                p_specialty: specialty.trim() || null,
                p_city: city.trim() || null,
            });
            setDoctors(data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Search failed");
        } finally {
            setLoading(false);
        }
    }, [specialty, city]);

    useEffect(() => {
        search();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const openDoctor = async (doctor: DoctorSummary) => {
        setSelected(doctor);
        setLoadingAvail(true);
        setError(null);
        try {
            const data = await rpc<DoctorAvailabilitySlot[]>("app_get_doctor_availability", {
                p_doctor_id: doctor.doctorId,
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

                {loadingAvail ? (
                    <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
                ) : (
                    <FlatList
                        data={availability}
                        keyExtractor={(s, i) => `${s.doctorScheduleId}-${s.date}-${i}`}
                        scrollEnabled={false}
                        renderItem={({ item }) => (
                            <Card style={styles.slotCard}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.slotDate}>
                                        {formatDate(item.date)}, {item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)}
                                    </Text>
                                    <Text style={styles.slotCenter}>
                                        {item.channelingCenterName}
                                        {item.city ? `  ·  ${item.city}` : ""}
                                    </Text>
                                </View>
                                <Button
                                    title="Book"
                                    onPress={() => onBook(item.doctorScheduleId, item.date)}
                                    loading={bookingKey === `${item.doctorScheduleId}-${item.date}`}
                                />
                            </Card>
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
            <Input
                label="Specialty"
                placeholder="e.g. Cardiology"
                value={specialty}
                onChangeText={setSpecialty}
            />
            <Input label="City" placeholder="e.g. Colombo" value={city} onChangeText={setCity} />
            <Button title="Search Doctors" onPress={search} loading={loading} />

            {error && <Banner kind="error" message={error} />}

            <FlatList
                data={doctors}
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
    slotCard: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginBottom: spacing.sm,
    },
    slotDate: { fontSize: 14, fontWeight: "700", color: colors.text },
    slotCenter: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
});
