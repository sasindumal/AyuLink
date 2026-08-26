// ==============================================
// AyuLink Doctor - Quick Pick Field
// A text Input with a row of preset chips beneath it —
// used for dosage/frequency/duration in the prescription
// builder so common values are one tap, while manual free
// text entry always stays available.
// ==============================================

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";
import { Input } from "./ui";

function leadingNumber(text: string): string {
    const match = text.trim().match(/^[\d.]+/);
    return match ? match[0] : "";
}

export function QuickPickField({
    label,
    placeholder,
    value,
    onChangeText,
    presets,
    mode = "replace",
}: {
    label: string;
    placeholder?: string;
    value: string;
    onChangeText: (value: string) => void;
    presets: string[];
    /** "replace" sets the field to the preset outright; "appendUnit"
     * keeps any leading number the doctor already typed and just
     * swaps the unit after it (e.g. "500" + tap "mg" -> "500 mg"). */
    mode?: "replace" | "appendUnit";
}) {
    const apply = (preset: string) => {
        if (mode === "appendUnit") {
            const n = leadingNumber(value);
            onChangeText(n ? `${n} ${preset}` : preset);
        } else {
            onChangeText(preset);
        }
    };

    return (
        <View style={{ marginBottom: spacing.md }}>
            <Input
                label={label}
                placeholder={placeholder}
                value={value}
                onChangeText={onChangeText}
                style={{ marginBottom: spacing.xs }}
            />
            <View style={styles.row}>
                {presets.map((preset) => (
                    <Pressable key={preset} onPress={() => apply(preset)} style={styles.chip}>
                        <Text style={styles.chipText}>{preset}</Text>
                    </Pressable>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: {
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: radius.full,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
    },
    chipText: { fontSize: 11.5, fontWeight: "600", color: colors.textMuted },
});
