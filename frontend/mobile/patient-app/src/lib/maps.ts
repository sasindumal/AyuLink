// ==============================================
// AyuLink Mobile - Maps Deep Link
// Opens the native maps app at a channeling center's
// address. Text-query based (no lat/lng needed) —
// AppointmentCenter doesn't carry coordinates today.
// ==============================================

import { Linking, Platform } from "react-native";

export async function openInMaps({
    name,
    address,
    city,
}: {
    name?: string;
    address: string;
    city?: string | null;
}) {
    const query = [name, address, city].filter(Boolean).join(", ");
    const encoded = encodeURIComponent(query);

    const url =
        Platform.OS === "ios"
            ? `https://maps.apple.com/?q=${encoded}`
            : `https://www.google.com/maps/search/?api=1&query=${encoded}`;

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
        await Linking.openURL(url);
    }
}
