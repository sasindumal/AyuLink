// ==============================================
// AyuLink Patient - Date of Birth picker
//
// Three dropdowns (Day / Month / Year) instead of a free-text
// YYYY-MM-DD box — no keyboard, no format mistakes.
//
// It keeps its own partial state: the parent only ever holds a complete
// YYYY-MM-DD string or "" (so the existing "please fill in all fields"
// check still fires), while a half-made selection stays visible here
// until all three parts are chosen.
// ==============================================

import React, { useEffect, useMemo, useState } from "react";
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

interface Parts { y: string; m: string; d: string }

function parse(value: string): Parts {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    return match
        ? { y: match[1], m: String(Number(match[2])), d: String(Number(match[3])) }
        : { y: "", m: "", d: "" };
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
    const [parts, setParts] = useState<Parts>(() => parse(value));

    // Resync only when the parent hands us a *complete* date that differs
    // (an edit-screen prefill). A "" from the parent is our own
    // "incomplete" signal echoing back — ignore it, or it would wipe a
    // selection in progress.
    useEffect(() => {
        const p = parse(value);
        if (!p.y || !p.m || !p.d) return;
        setParts((cur) => (cur.y === p.y && cur.m === p.m && cur.d === p.d ? cur : p));
    }, [value]);

    const thisYear = new Date().getFullYear();
    // Newest first — most registrants are young adults, and the list is
    // searchable anyway.
    const years = useMemo(
        () => Array.from({ length: 120 }, (_, i) => String(thisYear - i)),
        [thisYear]
    );
    const days = useMemo(
        () => Array.from({ length: daysInMonth(Number(parts.y), Number(parts.m)) }, (_, i) => String(i + 1)),
        [parts.y, parts.m]
    );

    const update = (next: Parts) => {
        // A day left over from a longer month (31 → February) is clamped.
        const cap = daysInMonth(Number(next.y), Number(next.m));
        if (next.d && Number(next.d) > cap) next = { ...next, d: String(cap) };
        setParts(next);
        onChange(
            next.y && next.m && next.d
                ? `${next.y}-${next.m.padStart(2, "0")}-${next.d.padStart(2, "0")}`
                : ""
        );
    };

    return (
        <View style={{ marginBottom: spacing.md }}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.row}>
                <View style={{ flex: 1.1 }}>
                    <SelectField
                        placeholder="Day"
                        value={parts.d}
                        options={days}
                        onChange={(d) => update({ ...parts, d })}
                    />
                </View>
                <View style={{ flex: 1.9 }}>
                    <SelectField
                        placeholder="Month"
                        value={parts.m ? MONTHS[Number(parts.m) - 1] : ""}
                        options={MONTHS}
                        onChange={(name) => update({ ...parts, m: String(MONTHS.indexOf(name) + 1) })}
                    />
                </View>
                <View style={{ flex: 1.3 }}>
                    <SelectField
                        placeholder="Year"
                        value={parts.y}
                        options={years}
                        onChange={(y) => update({ ...parts, y })}
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
