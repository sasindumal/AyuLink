// ==============================================
// AyuLink Patient - Voice Control
// Big mic button + status for Diagnosis' voice mode:
// tap to start listening, tap again to stop and send
// the transcript. Shows live interim text and a
// pulsing ring while listening.
// ==============================================

import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";

export function VoiceControl({
    listening,
    speaking,
    disabled,
    disabledReason,
    interimTranscript,
    onStart,
    onStop,
}: {
    listening: boolean;
    speaking: boolean;
    disabled: boolean;
    disabledReason?: string;
    interimTranscript: string;
    onStart: () => void;
    onStop: () => void;
}) {
    const pulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!listening) {
            pulse.setValue(1);
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1.18, duration: 550, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [listening, pulse]);

    const statusText = disabled
        ? disabledReason ?? "Respond above first…"
        : speaking
          ? "Speaking…"
          : listening
            ? "Listening… tap to stop"
            : "Tap to speak";

    return (
        <View style={styles.container}>
            {listening && interimTranscript ? (
                <View style={styles.transcriptBubble}>
                    <Text style={styles.transcriptText} numberOfLines={3}>
                        {interimTranscript}
                    </Text>
                </View>
            ) : null}

            <View style={styles.micRow}>
                <Animated.View style={{ transform: [{ scale: pulse }] }}>
                    <Pressable
                        onPress={listening ? onStop : onStart}
                        disabled={disabled || speaking}
                        style={[
                            styles.micButton,
                            listening && styles.micButtonActive,
                            (disabled || speaking) && styles.micButtonDisabled,
                        ]}
                    >
                        <Ionicons
                            name={listening ? "stop" : "mic"}
                            size={30}
                            color={listening ? "#fff" : disabled || speaking ? colors.textMuted : colors.primaryDark}
                        />
                    </Pressable>
                </Animated.View>
                <Text style={styles.statusText}>{statusText}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { paddingVertical: spacing.sm, alignItems: "center" },
    transcriptBubble: {
        backgroundColor: colors.primarySoft,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        marginBottom: spacing.sm,
        maxWidth: "90%",
    },
    transcriptText: { color: colors.primaryDark, fontSize: 13.5, textAlign: "center" },
    micRow: { alignItems: "center", gap: 6 },
    micButton: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: colors.primary,
    },
    micButtonActive: {
        backgroundColor: colors.danger,
        borderColor: colors.danger,
    },
    micButtonDisabled: {
        backgroundColor: colors.neutralSoft,
        borderColor: colors.border,
    },
    statusText: { fontSize: 12.5, color: colors.textMuted, fontWeight: "600" },
});
