import React from "react";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/lib/auth";
import { colors } from "../../src/theme";

export default function TabsLayout() {
    const { user, loading } = useAuth();

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
                name="scan"
                options={{
                    title: "Scan & Prescribe",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="scan" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="prescriptions"
                options={{
                    title: "Issued",
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="document-text" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
