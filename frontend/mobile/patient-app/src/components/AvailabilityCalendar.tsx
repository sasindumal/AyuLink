// ==============================================
// AyuLink Patient - Availability Calendar
//
// A month grid where the *data decides what's tappable*: only dates the
// doctor (or the search) actually has blocks on are selectable. That's
// the whole reason this isn't a native date picker — a platform picker
// happily lets you choose a Sunday nobody works, then makes you find
// that out from an empty result list.
//
// Pure React Native: no @react-native-community/datetimepicker, so it
// runs in Expo Go with no custom dev-client build.
// ==============================================

import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

/** Local-time YYYY-MM-DD. Deliberately not toISOString(), which converts
 *  to UTC and lands on the previous day for anywhere east of Greenwich —
 *  Sri Lanka is UTC+5:30, so every evening would render off by one. */
export function toISODate(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
}

export function AvailabilityCalendar({
    availableDates,
    value,
    onChange,
    minDate,
    maxDate,
    disabled = false,
}: {
    /** Dates with at least one bookable block, as YYYY-MM-DD. */
    availableDates: Set<string>;
    value: string | null;
    onChange: (date: string | null) => void;
    minDate?: string;
    maxDate?: string;
    disabled?: boolean;
}) {
    // Open on the month of the current selection, else the first month
    // that actually has availability — landing someone on an empty
    // current month when everything is next month is a dead end.
    const initial = useMemo(() => {
        const seed = value ?? [...availableDates].sort()[0];
        const d = seed ? new Date(`${seed}T00:00:00`) : new Date();
        return { year: d.getFullYear(), month: d.getMonth() };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const [cursor, setCursor] = useState(initial);

    const today = toISODate(new Date());
    const grid = useMemo(() => {
        const first = new Date(cursor.year, cursor.month, 1);
        const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
        const lead = first.getDay();
        const cells: (string | null)[] = Array(lead).fill(null);
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push(toISODate(new Date(cursor.year, cursor.month, d)));
        }
        while (cells.length % 7 !== 0) cells.push(null);
        return cells;
    }, [cursor]);

    const step = (delta: number) => {
        const next = new Date(cursor.year, cursor.month + delta, 1);
        setCursor({ year: next.getFullYear(), month: next.getMonth() });
    };

    // Only offer months that could contain something bookable.
    const monthStart = toISODate(new Date(cursor.year, cursor.month, 1));
    const monthEnd = toISODate(new Date(cursor.year, cursor.month + 1, 0));
    const canGoBack = !minDate || monthStart > minDate;
    const canGoForward = !maxDate || monthEnd < maxDate;

    const isSelectable = (iso: string) =>
        !disabled &&
        availableDates.has(iso) &&
        (!minDate || iso >= minDate) &&
        (!maxDate || iso <= maxDate);

    return (
        <View style={styles.wrap}>
            <View style={styles.header}>
                <Pressable
                    onPress={() => canGoBack && step(-1)}
                    disabled={!canGoBack}
                    style={[styles.navBtn, !canGoBack && styles.navBtnOff]}
                    hitSlop={8}
                >
                    <Ionicons name="chevron-back" size={18} color={canGoBack ? colors.primaryDark : colors.border} />
                </Pressable>
                <Text style={styles.monthLabel}>
                    {MONTHS[cursor.month]} {cursor.year}
                </Text>
                <Pressable
                    onPress={() => canGoForward && step(1)}
                    disabled={!canGoForward}
                    style={[styles.navBtn, !canGoForward && styles.navBtnOff]}
                    hitSlop={8}
                >
                    <Ionicons name="chevron-forward" size={18} color={canGoForward ? colors.primaryDark : colors.border} />
                </Pressable>
            </View>

            <View style={styles.weekRow}>
                {WEEKDAYS.map((w, i) => (
                    <Text key={`${w}-${i}`} style={styles.weekday}>
                        {w}
                    </Text>
                ))}
            </View>

            <View style={styles.grid}>
                {grid.map((iso, i) => {
                    if (!iso) return <View key={`pad-${i}`} style={styles.cell} />;
                    const selectable = isSelectable(iso);
                    const selected = value === iso;
                    const isToday = iso === today;
                    return (
                        <Pressable
                            key={iso}
                            style={styles.cell}
                            disabled={!selectable}
                            onPress={() => onChange(selected ? null : iso)}
                        >
                            <View
                                style={[
                                    styles.day,
                                    isToday && !selected && styles.dayToday,
                                    selected && styles.daySelected,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.dayText,
                                        !selectable && styles.dayTextOff,
                                        selected && styles.dayTextSelected,
                                    ]}
                                >
                                    {Number(iso.slice(8))}
                                </Text>
                            </View>
                            {/* The dot is the affordance: it's what tells you
                                which days are worth tapping before you tap. */}
                            <View style={[styles.dot, selectable && !selected && styles.dotOn]} />
                        </Pressable>
                    );
                })}
            </View>

            {availableDates.size === 0 && (
                <Text style={styles.noneText}>No open days in this period.</Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.sm,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 4,
        paddingBottom: 6,
    },
    navBtn: {
        width: 30,
        height: 30,
        borderRadius: radius.sm,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.primarySoft,
    },
    navBtnOff: { backgroundColor: "transparent" },
    monthLabel: { fontSize: 14.5, fontWeight: "800", color: colors.text },
    weekRow: { flexDirection: "row", marginBottom: 2 },
    weekday: {
        flex: 1,
        textAlign: "center",
        fontSize: 10.5,
        fontWeight: "700",
        color: colors.textMuted,
        letterSpacing: 0.4,
    },
    grid: { flexDirection: "row", flexWrap: "wrap" },
    cell: {
        width: `${100 / 7}%`,
        alignItems: "center",
        paddingVertical: 3,
    },
    day: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    dayToday: { borderWidth: 1.5, borderColor: colors.primary },
    daySelected: { backgroundColor: colors.primaryDark },
    dayText: { fontSize: 13.5, fontWeight: "600", color: colors.text },
    dayTextOff: { color: colors.border, fontWeight: "400" },
    dayTextSelected: { color: "#fff", fontWeight: "800" },
    dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: "transparent" },
    dotOn: { backgroundColor: colors.primary },
    noneText: {
        textAlign: "center",
        fontSize: 12.5,
        color: colors.textMuted,
        paddingVertical: spacing.sm,
    },
});
