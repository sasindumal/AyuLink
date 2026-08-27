// ==============================================
// AyuLink Patient - Push Notifications
// Registers this device's Expo push token so the
// Appointment trigger (see the appointments migration)
// can notify this account on booking/reschedule/cancel.
// ==============================================

import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { rpc } from "./api";

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function registerForPushNotifications(): Promise<void> {
    if (!Device.isDevice) return;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== "granted") {
        status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;

    if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
            name: "default",
            importance: Notifications.AndroidImportance.DEFAULT,
        });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    try {
        const { data: token } = await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : undefined
        );
        if (token) {
            await rpc("app_register_push_token", { p_token: token }).catch(() => {});
        }
    } catch {
        // No EAS project configured yet, or the platform can't mint a
        // token (e.g. simulator) — push registration is best-effort.
    }
}
