// ==============================================
// AyuLink Patient - Ayu floating bubble
//
// A small persistent affordance that sits above the tab bar. It is the
// only entry point to Ayu, and it is deliberately quiet: a plain bubble
// most of the time, and a labelled prompt only when Ayu actually has
// something to ask (a first-time intake, or a monthly gap-check).
//
// Hidden entirely when the patient switches Ayu off, or when the profile
// is complete and nothing is due — an assistant that nags a finished
// profile teaches people to ignore it.
// ==============================================

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow } from "../theme";

export function AyuBubble({
    visible,
    prompting,
    label,
    onPress,
    onDismiss,
}: {
    visible: boolean;
    /** Expanded, with a call to action, because something is unanswered. */
    prompting: boolean;
    label?: string;
    onPress: () => void;
    onDismiss?: () => void;
}) {
    if (!visible) return null;

    if (!prompting) {
        return (
            <Pressable style={styles.bubble} onPress={onPress} accessibilityLabel="Open Ayu">
                <Text style={styles.mark}>ආ</Text>
            </Pressable>
        );
    }

    return (
        <View style={styles.promptWrap}>
            <Pressable style={styles.prompt} onPress={onPress}>
                <View style={styles.promptAvatar}>
                    <Text style={styles.promptMark}>ආ</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.promptTitle}>Ayu</Text>
                    <Text style={styles.promptText} numberOfLines={2}>
                        {label ?? "Let's set up your health profile."}
                    </Text>
                </View>
                {onDismiss && (
                    <Pressable onPress={onDismiss} hitSlop={10} style={styles.dismiss}>
                        <Ionicons name="close" size={17} color={colors.textMuted} />
                    </Pressable>
                )}
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    bubble: {
        position: "absolute",
        right: 18,
        bottom: 22,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.primaryDark,
        alignItems: "center",
        justifyContent: "center",
        ...shadow.card,
    },
    mark: { color: "#fff", fontSize: 22, fontWeight: "800" },
    promptWrap: { position: "absolute", left: 16, right: 16, bottom: 22 },
    prompt: {
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1.5,
        borderColor: colors.primary,
        paddingVertical: 12,
        paddingHorizontal: 14,
        ...shadow.card,
    },
    promptAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: colors.primaryDark,
        alignItems: "center",
        justifyContent: "center",
    },
    promptMark: { color: "#fff", fontSize: 16, fontWeight: "800" },
    promptTitle: { fontSize: 13.5, fontWeight: "800", color: colors.primaryDark },
    promptText: { fontSize: 12.5, color: colors.textMuted, marginTop: 1, lineHeight: 17 },
    dismiss: { padding: 4 },
});
