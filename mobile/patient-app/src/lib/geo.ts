// ==============================================
// AyuLink Patient - Geo helpers
// Postgres `point` serializes as "(lng,lat)" — longitude
// first. Used for client-side "nearest" sorting where the
// list (e.g. channeling centers) has no server-side sort.
// ==============================================

export function parseLocation(raw: string | null | undefined): { lat: number; lng: number } | null {
    if (!raw) return null;
    const match = raw.match(/\(?\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)?/);
    if (!match) return null;
    const lng = Number(match[1]);
    const lat = Number(match[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const s =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
