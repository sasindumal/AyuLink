// ==============================================
// AyuLink Doctor - Referral Doctor Picker
// Search verified doctors by name, SLMC number, or specialty
// to refer a patient on to. The chosen doctor (with their SLMC
// registration) is shown to the patient in their AI chat.
// ==============================================

import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../lib/api";
import { colors, radius, spacing } from "../theme";
import { Input } from "./ui";
import type { ReferralDoctor } from "../types";

export function ReferralDoctorPicker({
    visible,
    onClose,
    onSelect,
}: {
    visible: boolean;
    onClose: () => void;
    onSelect: (doctor: ReferralDoctor) => void;
}) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<ReferralDoctor[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        // Debounced so typing a name doesn't fire a query per keystroke.
        const handle = setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await rpc<ReferralDoctor[]>("app_search_referral_doctors", {
                    p_query: query.trim() || null,
                    p_specialty: null,
                });
                if (!cancelled) setResults(data ?? []);
            } catch (e) {
                if (!cancelled) {
                    setError(e instanceof Error ? e.message : "Could not search doctors");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [query, visible]);

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Refer to</Text>
                    <Pressable onPress={onClose} hitSlop={8}>
                        <Ionicons name="close" size={24} color={colors.textMuted} />
                    </Pressable>
                </View>

                <Input
                    placeholder="Search by name, SLMC number, or specialty"
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                />

                {error && <Text style={styles.error}>{error}</Text>}

                {loading ? (
                    <ActivityIndicator
                        color={colors.primaryDark}
                        style={{ marginTop: spacing.lg }}
                    />
                ) : (
                    <FlatList
                        data={results}
                        keyExtractor={(d) => d.id}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                            <Pressable style={styles.row} onPress={() => onSelect(item)}>
                                <View style={styles.avatar}>
                                    <Ionicons name="medkit" size={16} color="#fff" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.name}>
                                        Dr. {item.firstName} {item.lastName}
                                    </Text>
                                    <Text style={styles.meta}>
                                        {[
                                            item.specialty,
                                            item.slmcRegNo ? `SLMC ${item.slmcRegNo}` : null,
                                        ]
                                            .filter(Boolean)
                                            .join("  ·  ")}
                                    </Text>
                                </View>
                                <Ionicons
                                    name="chevron-forward"
                                    size={16}
                                    color={colors.textMuted}
                                />
                            </Pressable>
                        )}
                        ListEmptyComponent={
                            <Text style={styles.empty}>
                                {query.trim()
                                    ? "No doctors match that search."
                                    : "No other verified doctors available."}
                            </Text>
                        }
                    />
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.xl,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: spacing.md,
    },
    title: { flex: 1, fontSize: 20, fontWeight: "800", color: colors.text },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        marginBottom: 10,
    },
    avatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    name: { fontSize: 14, fontWeight: "700", color: colors.text },
    meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    empty: {
        textAlign: "center",
        color: colors.textMuted,
        marginTop: spacing.xl,
        fontSize: 13,
    },
    error: { color: colors.danger, fontSize: 12.5, marginBottom: spacing.sm },
});
