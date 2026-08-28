// ==============================================
// AyuLink Patient - Where & When Picker
//
// Replaces the two free-text boxes the assistant used to ask "any
// preferred city or time?" with. Typing a city meant guessing at spelling
// and at whether it was even in the database; typing a date meant the
// backend had to parse "next Tuesday-ish" out of prose. Both are now
// picked from real values the backend sent with the question.
//
// Everything here is optional. Skipping all of it is the common case and
// means "nearest, soonest" — which is why Skip is a first-class button
// and not a cancel.
// ==============================================

import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Button, formatDate } from "./ui";
import { SelectField } from "./SelectField";
import { AvailabilityCalendar, toISODate } from "./AvailabilityCalendar";

export interface PreferenceValue {
    location: string | null;
    date: string | null;
    time_band: string | null;
    time: string | null;
}

const BAND_LABELS: Record<string, string> = {
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Evening",
};
const BAND_HINT: Record<string, string> = {
    morning: "before 12",
    afternoon: "12 – 5",
    evening: "after 5",
};

export function PreferencePicker({
    cities,
    minDate,
    maxDate,
    timeBands,
    busy = false,
    onSubmit,
}: {
    cities: string[];
    minDate?: string;
    maxDate?: string;
    timeBands: string[];
    busy?: boolean;
    onSubmit: (value: PreferenceValue, label: string) => void;
}) {
    const [city, setCity] = useState("");
    const [date, setDate] = useState<string | null>(null);
    const [band, setBand] = useState<string | null>(null);
    const [showCalendar, setShowCalendar] = useState(false);

    // No availability is known yet at this point in the conversation — the
    // search hasn't run. So every day in the bookable window is offerable,
    // and the *next* screen (SlotPicker) is where real availability
    // narrows things down.
    const selectableDates = useMemo(() => {
        const out = new Set<string>();
        const start = minDate ? new Date(`${minDate}T00:00:00`) : new Date();
        const end = maxDate ? new Date(`${maxDate}T00:00:00`) : new Date(Date.now() + 21 * 864e5);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            out.add(toISODate(d));
        }
        return out;
    }, [minDate, maxDate]);

    const submit = (value: PreferenceValue) => {
        const parts = [
            value.location,
            value.date ? formatDate(value.date) : null,
            value.time_band ? BAND_LABELS[value.time_band] : null,
        ].filter(Boolean);
        onSubmit(value, parts.length ? parts.join(" · ") : "Nearest, soonest");
    };

    return (
        <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
            <SelectField
                label="City"
                placeholder="Nearest to me"
                value={city}
                options={cities}
                onChange={setCity}
            />

            <Pressable
                style={styles.field}
                onPress={() => setShowCalendar((s) => !s)}
                disabled={busy}
            >
                <Ionicons name="calendar-outline" size={16} color={colors.primaryDark} />
                <Text style={[styles.fieldText, !date && styles.fieldPlaceholder]}>
                    {date ? formatDate(date) : "Any day"}
                </Text>
                {date ? (
                    <Pressable onPress={() => setDate(null)} hitSlop={8}>
                        <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </Pressable>
                ) : (
                    <Ionicons
                        name={showCalendar ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={colors.textMuted}
                    />
                )}
            </Pressable>

            {showCalendar && (
                <AvailabilityCalendar
                    availableDates={selectableDates}
                    value={date}
                    onChange={(d) => {
                        setDate(d);
                        if (d) setShowCalendar(false);
                    }}
                    minDate={minDate}
                    maxDate={maxDate}
                    disabled={busy}
                />
            )}

            <Text style={styles.label}>Time of day</Text>
            <View style={styles.bandRow}>
                {timeBands.map((b) => {
                    const active = band === b;
                    return (
                        <Pressable
                            key={b}
                            style={[styles.band, active && styles.bandActive]}
                            onPress={() => setBand(active ? null : b)}
                            disabled={busy}
                        >
                            <Text style={[styles.bandText, active && styles.bandTextActive]}>
                                {BAND_LABELS[b] ?? b}
                            </Text>
                            <Text style={[styles.bandHint, active && styles.bandHintActive]}>
                                {BAND_HINT[b] ?? ""}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
                <Button
                    title="Skip"
                    variant="secondary"
                    onPress={() => submit({ location: null, date: null, time_band: null, time: null })}
                    disabled={busy}
                    style={{ flex: 1 }}
                />
                <Button
                    title="Find doctors"
                    onPress={() =>
                        submit({
                            location: city.trim() || null,
                            date,
                            time_band: band,
                            time: null,
                        })
                    }
                    disabled={busy}
                    style={{ flex: 1.4 }}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: -2 },
    field: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingHorizontal: 14,
        paddingVertical: 13,
    },
    fieldText: { flex: 1, fontSize: 15, color: colors.text },
    fieldPlaceholder: { color: colors.textMuted },
    bandRow: { flexDirection: "row", gap: 8 },
    band: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 9,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
    },
    bandActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    bandText: { fontSize: 13, fontWeight: "700", color: colors.text },
    bandTextActive: { color: colors.primaryDark },
    bandHint: { fontSize: 10.5, color: colors.textMuted, marginTop: 1 },
    bandHintActive: { color: colors.primaryDark },
});
