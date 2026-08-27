import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../src/lib/auth";
import { warmUpBackend } from "../src/lib/agentChat";
import { colors } from "../src/theme";

export default function RootLayout() {
    // Ping the Assistant backend as soon as the app launches — not when
    // the user opens the Assistant tab. A free-tier host (Render etc.)
    // that's spun down eats a ~30-60s cold start on its next request;
    // this way that delay overlaps with the user navigating the rest of
    // the app (login, home) instead of stalling the chat itself.
    useEffect(() => {
        warmUpBackend();
    }, []);

    return (
        <AuthProvider>
            <StatusBar style="dark" />
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                }}
            />
        </AuthProvider>
    );
}
