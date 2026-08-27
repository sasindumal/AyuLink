// ==============================================
// AyuLink Doctor - Select Field
// A tappable "Input"-styled field that opens a modal
// with a searchable dropdown list of options. Typing a
// value that isn't in the list offers a "Use <value>" row,
// so a custom entry is always possible too.
// ==============================================

import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";

export function SelectField({
    label,
    placeholder = "Select",
    value,
    options,
    onChange,
    allowCustom = true,
}: {
    label?: string;
    placeholder?: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
    /** Lets typing a value not in `options` be used as-is. */
    allowCustom?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((o) => o.toLowerCase().includes(q));
    }, [options, query]);

    const exactMatch = useMemo(
        () => options.some((o) => o.toLowerCase() === query.trim().toLowerCase()),
        [options, query]
    );

    const close = () => {
        setOpen(false);
        setQuery("");
    };

    const choose = (v: string) => {
        onChange(v);
        close();
    };

    return (
        <View style={{ marginBottom: spacing.md }}>
            {label && <Text style={styles.label}>{label}</Text>}
            <Pressable style={styles.field} onPress={() => setOpen(true)}>
                <Text style={[styles.fieldText, !value && styles.fieldPlaceholder]} numberOfLines={1}>
                    {value || placeholder}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            </Pressable>

            <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
                <Pressable style={styles.backdrop} onPress={close}>
                    <Pressable style={styles.sheet} onPress={() => {}}>
                        <Text style={styles.sheetTitle}>{label || "Select"}</Text>
                        <TextInput
                            style={styles.search}
                            placeholder={allowCustom ? "Search or type a custom value…" : "Search…"}
                            placeholderTextColor={colors.textMuted}
                            value={query}
                            onChangeText={setQuery}
                            autoCorrect={false}
                            onSubmitEditing={() => {
                                if (allowCustom && query.trim() && !exactMatch) choose(query.trim());
                            }}
                        />
                        <FlatList
                            data={filtered}
                            keyExtractor={(o) => o}
                            style={{ maxHeight: 320 }}
                            ListHeaderComponent={
                                allowCustom && query.trim() && !exactMatch ? (
                                    <Pressable style={styles.option} onPress={() => choose(query.trim())}>
                                        <Ionicons name="add-circle-outline" size={17} color={colors.primary} />
                                        <Text style={styles.customText} numberOfLines={1}>
                                            Use "{query.trim()}"
                                        </Text>
                                    </Pressable>
                                ) : null
                            }
                            renderItem={({ item }) => {
                                const active = item === value;
                                return (
                                    <Pressable style={styles.option} onPress={() => choose(item)}>
                                        <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={1}>
                                            {item}
                                        </Text>
                                        {active && <Ionicons name="checkmark" size={17} color={colors.primary} />}
                                    </Pressable>
                                );
                            }}
                            ListEmptyComponent={
                                !allowCustom || !query.trim() ? (
                                    <Text style={styles.empty}>No matches</Text>
                                ) : null
                            }
                        />
                        <Pressable style={styles.closeBtn} onPress={close}>
                            <Text style={styles.closeText}>Close</Text>
                        </Pressable>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6 },
    field: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingHorizontal: 14,
        paddingVertical: 13,
    },
    fieldText: { fontSize: 15, color: colors.text, flex: 1 },
    fieldPlaceholder: { color: colors.textMuted },
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(28, 43, 26, 0.45)",
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        padding: spacing.lg,
        maxHeight: "75%",
    },
    sheetTitle: { fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: spacing.sm },
    search: {
        backgroundColor: colors.background,
        borderRadius: radius.sm,
        paddingHorizontal: 14,
        paddingVertical: 11,
        fontSize: 14,
        color: colors.text,
        marginBottom: spacing.sm,
    },
    option: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    optionText: { fontSize: 14.5, color: colors.text, flex: 1 },
    optionTextActive: { color: colors.primaryDark, fontWeight: "700" },
    customText: { fontSize: 14.5, color: colors.primary, fontWeight: "700", flex: 1 },
    empty: { textAlign: "center", color: colors.textMuted, paddingVertical: spacing.lg, fontSize: 13 },
    closeBtn: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
    closeText: { color: colors.textMuted, fontWeight: "700", fontSize: 13.5 },
});
