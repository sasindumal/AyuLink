// ==============================================
// AyuLink Patient - Notification Card
// ==============================================

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Card } from "./ui";
import type { AppNotification, NotificationType } from "../types";

const typeIcon: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
    APPOINTMENT_BOOKED: "calendar",
    APPOINTMENT_RESCHEDULED: "swap-horizontal",
    APPOINTMENT_CANCELLED: "close-circle",
    APPOINTMENT_COMPLETED: "checkmark-done",
};

function timeAgo(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationCard({
    notification,
    onPress,
}: {
    notification: AppNotification;
    onPress: (n: AppNotification) => void;
}) {
    return (
        <Pressable onPress={() => onPress(notification)}>
            <Card style={notification.read ? styles.card : [styles.card, styles.unreadCard]}>
                <View style={styles.iconWrap}>
                    <Ionicons name={typeIcon[notification.type]} size={18} color={colors.primaryDark} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{notification.title}</Text>
                    <Text style={styles.body} numberOfLines={2}>
                        {notification.body}
                    </Text>
                    <Text style={styles.time}>{timeAgo(notification.created_at)}</Text>
                </View>
                {!notification.read && <View style={styles.dot} />}
            </Card>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: spacing.sm },
    unreadCard: { backgroundColor: colors.primarySoft },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: radius.sm,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
    },
    title: { fontSize: 13.5, fontWeight: "700", color: colors.text },
    body: { fontSize: 12.5, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
    time: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
        marginTop: 4,
    },
});
