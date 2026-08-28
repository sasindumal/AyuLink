import React, { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { AuthProvider } from "../src/lib/auth";
import { warmUpBackend } from "../src/lib/agentChat";
import { colors } from "../src/theme";

/** Where a tapped notification should land, by the `kind` its scheduler
 *  stamped into `data` (see src/lib/reminders.ts). Without this every
 *  reminder just opened the app on whatever screen it was last on —
 *  including the end-of-course check-in, whose whole body text is "tap to
 *  let your assistant know how it went". */
function routeForNotification(data: Record<string, unknown> | undefined) {
    if (!data) return;
    switch (data.kind) {
        case "medication":
        case "course_end":
            if (typeof data.threadId === "string") {
                router.push({ pathname: "/diagnosis", params: { threadId: data.threadId } });
            } else if (typeof data.treatmentId === "string") {
                router.push({ pathname: "/care-episode", params: { treatmentId: data.treatmentId } });
            }
            break;
        case "appointment":
            if (typeof data.appointmentId === "string") {
                router.push({
                    pathname: "/(tabs)/appointments",
                    params: { appointmentId: data.appointmentId },
                });
            }
            break;
        default:
            break;
    }
}

export default function RootLayout() {
    // Ping the Assistant backend as soon as the app launches — not when
    // the user opens the Assistant tab. A free-tier host (Render etc.)
    // that's spun down eats a ~30-60s cold start on its next request;
    // this way that delay overlaps with the user navigating the rest of
    // the app (login, home) instead of stalling the chat itself.
    useEffect(() => {
        warmUpBackend();
    }, []);

    // Covers both cases: the app was already running when the reminder was
    // tapped (the listener), and the tap is what launched it from cold
    // (getLastNotificationResponseAsync, which the listener never sees).
    useEffect(() => {
        let cancelled = false;

        Notifications.getLastNotificationResponseAsync()
            .then((response) => {
                if (cancelled || !response) return;
                routeForNotification(
                    response.notification.request.content.data as Record<string, unknown>
                );
            })
            .catch(() => {});

        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            routeForNotification(
                response.notification.request.content.data as Record<string, unknown>
            );
        });

        return () => {
            cancelled = true;
            sub.remove();
        };
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
