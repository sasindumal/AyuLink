// ==============================================
// AyuLink Patient - Doctor Search Filters
// ==============================================

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { colors, spacing } from "../theme";
import { FilterChips, Input } from "./ui";

export type SortOption = "soonest" | "nearest" | "rating";
export type MinRating = 0 | 3 | 4 | 4.5;

export interface SearchFilterState {
    specialty: string;
    district: string;
    sort: SortOption;
    minRating: MinRating;
    lat: number | null;
    lng: number | null;
}

export function SearchFilters({
    value,
    onChange,
}: {
    value: SearchFilterState;
    onChange: (next: SearchFilterState) => void;
}) {
    const [locating, setLocating] = React.useState(false);
    const [locationError, setLocationError] = React.useState<string | null>(null);

    const useMyLocation = async () => {
        setLocating(true);
        setLocationError(null);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== "granted") {
                setLocationError("Location permission was denied");
                return;
            }
            const pos = await Location.getCurrentPositionAsync({});
            onChange({
                ...value,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                sort: "nearest",
            });
        } catch {
            setLocationError("Could not get your location");
        } finally {
            setLocating(false);
        }
    };

    const hasLocation = value.lat != null && value.lng != null;

    return (
        <View>
            <Input
                label="Specialty"
                placeholder="e.g. Cardiology"
                value={value.specialty}
                onChangeText={(specialty) => onChange({ ...value, specialty })}
            />
            <Input
                label="District"
                placeholder="e.g. Colombo"
                value={value.district}
                onChangeText={(district) => onChange({ ...value, district })}
            />

            <View style={styles.locationRow}>
                <FilterChips<"off" | "on">
                    value={hasLocation ? "on" : "off"}
                    onChange={() => {
                        if (hasLocation) {
                            onChange({ ...value, lat: null, lng: null, sort: "soonest" });
                        } else {
                            useMyLocation();
                        }
                    }}
                    options={[
                        {
                            key: "on",
                            label: locating ? "Locating…" : hasLocation ? "Using your location ✓" : "Use my location",
                        },
                    ]}
                />
                {locationError && <Text style={styles.error}>{locationError}</Text>}
            </View>

            <Text style={styles.label}>Minimum rating</Text>
            <FilterChips<string>
                value={String(value.minRating)}
                onChange={(v) => onChange({ ...value, minRating: Number(v) as MinRating })}
                options={[
                    { key: "0", label: "Any" },
                    { key: "3", label: "3+" },
                    { key: "4", label: "4+" },
                    { key: "4.5", label: "4.5+" },
                ]}
            />

            <Text style={styles.label}>Sort by</Text>
            <FilterChips<SortOption>
                value={value.sort}
                onChange={(sort) => {
                    if (sort === "nearest" && !hasLocation) {
                        useMyLocation();
                        return;
                    }
                    onChange({ ...value, sort });
                }}
                options={[
                    { key: "soonest", label: "Soonest" },
                    { key: "nearest", label: "Nearest" },
                    { key: "rating", label: "Rating" },
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    locationRow: { marginBottom: spacing.sm },
    label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6, marginTop: 4 },
    error: { fontSize: 12, color: colors.danger, marginTop: 4 },
});
