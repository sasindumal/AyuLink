// ==============================================
// AyuLink Mobile - Maps Deep Link
// Opens the native maps app at a channeling center's
// location. Prefers real geo coordinates (exact pin
// placement) when the center has them — appointment_json()
// now includes latitude/longitude — and falls back to a
// text-address search only when they're missing.
// ==============================================

import { Linking, Platform } from "react-native";

export async function openInMaps({
    name,
    address,
    city,
    latitude,
    longitude,
}: {
    name?: string;
    address: string;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
}) {
    const hasCoords = latitude != null && longitude != null;
    const label = encodeURIComponent(name || address);

    let url: string;
    if (hasCoords) {
        // Coordinate-based: drops the pin at the exact point instead of
        // relying on the maps provider re-geocoding an address string.
        // Apple Maps' `ll` takes the coordinate with `q` as its label;
        // Google's documented Universal Maps URL for a coordinate search
        // has no separate label param, so the pin just shows the
        // coordinate (or Google's own reverse-geocoded address) there.
        url =
            Platform.OS === "ios"
                ? `https://maps.apple.com/?ll=${latitude},${longitude}&q=${label}`
                : `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    } else {
        const query = [name, address, city].filter(Boolean).join(", ");
        const encoded = encodeURIComponent(query);
        url =
            Platform.OS === "ios"
                ? `https://maps.apple.com/?q=${encoded}`
                : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    }

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
        await Linking.openURL(url);
    }
}
