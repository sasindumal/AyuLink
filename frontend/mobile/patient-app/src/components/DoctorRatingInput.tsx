// ==============================================
// AyuLink Patient - Doctor Rating Input
// Tap-to-select 1-5 star rating + optional feedback, shown
// inline in the AI chat when completing a diagnosis. Resolves
// the pending interrupt with a structured value the backend
// saves directly — no need to parse free text into a number.
// ==============================================

import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Button, Input } from "./ui";

export function DoctorRatingInput({
    busy,
    onSubmit,
    onSkip,
}: {
    busy: boolean;
    onSubmit: (rating: number, feedback: string) => void;
    onSkip: () => void;
}) {
    const [rating, setRating] = useState(0);
    const [feedback, setFeedback] = useState("");

    return (
        <View style={{ marginTop: spacing.sm }}>
            <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable key={n} onPress={() => setRating(n)} disabled={busy} hitSlop={6}>
                        <Ionicons
                            name={n <= rating ? "star" : "star-outline"}
                            size={32}
                            color={n <= rating ? colors.warning : colors.textMuted}
                        />
                    </Pressable>
                ))}
            </View>

            <Input
                placeholder="Add a comment (optional)"
                value={feedback}
                onChangeText={setFeedback}
                editable={!busy}
                multiline
                containerStyle={{ marginBottom: spacing.sm }}
            />

            <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                    title="Submit Rating"
                    onPress={() => onSubmit(rating, feedback.trim())}
                    disabled={busy || rating === 0}
                    style={{ flex: 1 }}
                />
                <Pressable onPress={onSkip} disabled={busy} style={styles.skipBtn}>
                    <Text style={styles.skipText}>Skip</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    stars: {
        flexDirection: "row",
        gap: 6,
        marginBottom: spacing.sm,
    },
    skipBtn: {
        paddingHorizontal: spacing.md,
        justifyContent: "center",
        alignItems: "center",
        borderRadius: radius.sm,
    },
    skipText: { color: colors.textMuted, fontWeight: "700", fontSize: 13.5 },
});
