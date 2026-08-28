// ==============================================
// AyuLink - Profile Avatar Button
// Top-right entry point to the account screen, in every app.
//
// It replaces the old log-out icon that used to sit here. Logging out is
// a once-in-a-while action that was occupying the most reachable corner
// of the screen, one mis-tap from ending the session; it now lives at the
// bottom of the profile screen, behind a confirmation, which is where
// every app the user already owns puts it.
// ==============================================

import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius } from "../theme";

export function ProfileButton({
    firstName,
    lastName,
    onPress,
}: {
    firstName?: string | null;
    lastName?: string | null;
    onPress: () => void;
}) {
    const initials =
        `${(firstName ?? "").trim().charAt(0)}${(lastName ?? "").trim().charAt(0)}`.toUpperCase() ||
        "?";

    return (
        <Pressable
            onPress={onPress}
            style={styles.avatar}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Profile and settings"
        >
            <Text style={styles.initials}>{initials}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    avatar: {
        width: 42,
        height: 42,
        borderRadius: radius.sm,
        backgroundColor: colors.primaryDark,
        alignItems: "center",
        justifyContent: "center",
    },
    initials: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
});
