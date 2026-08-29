// ==============================================
// AyuLink Patient - Date of Birth picker
//
// Three dropdowns (Day / Month / Year) instead of a free-text
// YYYY-MM-DD box — no keyboard, no format mistakes. Emits a
// zero-padded YYYY-MM-DD string once all three are set, or "" while
// any is still blank (so the existing "please fill in all fields"
// check still fires).
// ==============================================

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SelectField } from "./SelectField";
import { colors, spacing } from "../theme";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

/** Last day of a 1-indexed month. `new Date(y, m, 0)` is day 0 of the
 *  *next* month, i.e. the last day of month `m`. */
function daysInMonth(year: number, month1: number): number {
    if (!year || !month1) return 31;
    return new Date(year, month1, 0).getDate();
}

export function DobPicker({
    value,
    onChange,
    label = "Date of Birth",
}: {
    value: string;
    onChange: (value: string) => void;
    label?: string;
}) {
    const [y, m, d] = useMemo(() => {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
        if (!match) return ["", "", ""] as const;
        return [match[1], String(Number(match[2])), String(Number(match[3]))] as const;
    }, [value]);

    const thisYear = new Date().getFullYear();
    // Newest first — most registrants are young adults, and the list is
    // searchable anyway.
    const years = useMemo(
        () => Array.from({ length: 120 }, (_, i) => String(thisYear - i)),
        [thisYear]
    );
    const days = useMemo(
        () => Array.from({ length: daysInMonth(Number(y), Number(m)) }, (_, i) => String(i + 1)),
        [y, m]
    );

    const emit = (ny: string, nm: string, nd: string) => {
        if (!ny || !nm || !nd) {
            onChange("");
            return;
        }
        // A day left over from a longer month (31 → February) is clamped.
        const day = Math.min(Number(nd), daysInMonth(Number(ny), Number(nm)));
        onChange(`${ny}-${String(Number(nm)).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    };

    return (
        <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.row}>
                <View style={{ flex: 1.1 }}>
                    <SelectField
                        placeholder="Day"
                        value={d}
                        options={days}
                        onChange={(nd) => emit(y, m, nd)}
                    />
                </View>
                <View style={{ flex: 1.9 }}>
                    <SelectField
                        placeholder="Month"
                        value={m ? MONTHS[Number(m) - 1] : ""}
                        options={MONTHS}
                        onChange={(name) => emit(y, String(MONTHS.indexOf(name) + 1), d)}
                    />
                </View>
                <View style={{ flex: 1.3 }}>
                    <SelectField
                        placeholder="Year"
                        value={y}
                        options={years}
                        onChange={(ny) => emit(ny, m, d)}
                    />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 8 },
    row: { flexDirection: "row", gap: 8 },
});
