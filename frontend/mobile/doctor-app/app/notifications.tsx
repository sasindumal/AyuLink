// ==============================================
// AyuLink Doctor - Notifications
// Persisted history of appointment events (booked,
// rescheduled, cancelled, completed) for the doctor's
// own schedule. Reached from the bell icon on Home.
// ==============================================

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { rpc } from "../src/lib/api";
import { useAuth } from "../src/lib/auth";
import { colors, radius, spacing } from "../src/theme";
import { Banner, EmptyState } from "../src/components/ui";
import { NotificationCard } from "../src/components/NotificationCard";
import type { AppNotification } from "../src/types";

export default function Notifications() {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const data = await rpc<AppNotification[]>("app_list_notifications");
            setNotifications(data ?? []);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load notifications");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (user) load();
    }, [user, load]);

    const openNotification = async (n: AppNotification) => {
        if (!n.read) {
            setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
            rpc("app_mark_notification_read", { p_notification_id: n.id }).catch(() => {});
        }
    };

    const markAllRead = async () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        rpc("app_mark_all_notifications_read").catch(() => {});
    };

    const hasUnread = notifications.some((n) => !n.read);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <FlatList
                style={styles.container}
                contentContainerStyle={{ paddingBottom: spacing.xl }}
                data={notifications}
                keyExtractor={(n) => n.id}
                ListHeaderComponent={
                    <>
                        <View style={styles.header}>
                            <Pressable onPress={() => router.back()} style={styles.backBtn}>
                                <Ionicons name="arrow-back" size={22} color={colors.primaryDark} />
                            </Pressable>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.headerTitle}>Notifications</Text>
                                <Text style={styles.headerSubtitle}>Your appointment updates</Text>
                            </View>
                            {hasUnread && (
                                <Pressable onPress={markAllRead}>
                                    <Text style={styles.markAllText}>Mark all read</Text>
                                </Pressable>
                            )}
                        </View>
                        {error && <Banner kind="error" message={error} />}
                    </>
                }
                renderItem={({ item }) => <NotificationCard notification={item} onPress={openNotification} />}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={() => {
                            setRefreshing(true);
                            load();
                        }}
                        tintColor={colors.primaryDark}
                    />
                }
                ListEmptyComponent={
                    loading ? (
                        <ActivityIndicator size="large" color={colors.primaryDark} style={{ marginTop: spacing.xl }} />
                    ) : (
                        <EmptyState
                            icon="notifications-outline"
                            title="No notifications yet"
                            message="Updates about your appointments will appear here."
                        />
                    )
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, paddingHorizontal: spacing.lg },
    header: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: spacing.lg, marginBottom: spacing.lg },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: radius.sm,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: { fontSize: 20, fontWeight: "800", color: colors.text },
    headerSubtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
    markAllText: { color: colors.primary, fontWeight: "700", fontSize: 12.5 },
});
