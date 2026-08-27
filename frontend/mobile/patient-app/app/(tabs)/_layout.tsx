import React, { useEffect } from "react";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/lib/auth";
import { colors } from "../../src/theme";
import { registerForPushNotifications } from "../../src/lib/notifications";

export default function TabsLayout() {
    const { user, loading } = useAuth();

    useEffect(() => {
        if (user) registerForPushNotifications();
    }, [user]);

    if (!loading && !user) {
        return <Redirect href="/login" />;
    }

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: colors.primaryDark,
                tabBarInactiveTintColor: colors.textMuted,
                tabBarStyle: {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                },
                tabBarLabelStyle: { fontWeight: "600", fontSize: 11 },
                sceneStyle: { backgroundColor: colors.background },
            }}
        >
            <Tabs.Screen
                name="home"
                options={{
                    title: "Home",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="home" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="treatments"
                options={{
                    title: "Treatments",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="pulse" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="medical-id"
                options={{
                    title: "Medical ID",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="qr-code" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="prescriptions"
                options={{
                    title: "Prescriptions",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="document-text" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="appointments"
                options={{
                    title: "Appointments",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="calendar" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
