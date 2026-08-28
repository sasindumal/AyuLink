// ==============================================
// AyuLink Mobile - UI Kit
// Shared building blocks used by every screen
// ==============================================

import React from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    View,
    ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow, spacing, statusMeta } from "../theme";
import type { AppointmentStatus } from "../types";

// ----- Button -----

export function Button({
    title,
    onPress,
    loading = false,
    disabled = false,
    variant = "primary",
    icon,
    style,
}: {
    title: string;
    onPress: () => void;
    loading?: boolean;
    disabled?: boolean;
    variant?: "primary" | "secondary" | "danger-ghost";
    icon?: keyof typeof Ionicons.glyphMap;
    style?: ViewStyle;
}) {
    const isDisabled = disabled || loading;
    return (
        <Pressable
            onPress={onPress}
            disabled={isDisabled}
            style={({ pressed }) => [
                styles.button,
                // primaryDark, not primary — #48A111 fails WCAG AA with a
                // white label (3.29:1); #25671E passes at 6.91:1. #48A111
                // stays reserved for fills/shapes that never carry text.
                variant === "primary" && { backgroundColor: colors.primaryDark },
                variant === "secondary" && styles.buttonSecondary,
                variant === "danger-ghost" && styles.buttonDangerGhost,
                pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                isDisabled && { opacity: 0.55 },
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator
                    color={variant === "primary" ? "#fff" : colors.primaryDark}
                />
            ) : (
                <>
                    {icon && (
                        <Ionicons
                            name={icon}
                            size={18}
                            color={
                                variant === "primary"
                                    ? "#fff"
                                    : variant === "danger-ghost"
                                      ? colors.danger
                                      : colors.primaryDark
                            }
                            style={{ marginRight: 8 }}
                        />
                    )}
                    <Text
                        style={[
                            styles.buttonText,
                            variant === "secondary" && { color: colors.primaryDark },
                            variant === "danger-ghost" && { color: colors.danger },
                        ]}
                    >
                        {title}
                    </Text>
                </>
            )}
        </Pressable>
    );
}

// ----- Input -----

export function Input({
    label,
    style,
    ...props
}: TextInputProps & { label?: string }) {
    return (
        <View style={{ marginBottom: spacing.md }}>
            {label && <Text style={styles.inputLabel}>{label}</Text>}
            <TextInput
                placeholderTextColor={colors.textMuted}
                style={[styles.input, style]}
                {...props}
            />
        </View>
    );
}

// ----- Card -----

export function Card({
    children,
    style,
}: {
    children: React.ReactNode;
    style?: ViewStyle | ViewStyle[];
}) {
    return <View style={[styles.card, style]}>{children}</View>;
}

// ----- Status badge -----

export function StatusBadge({ status }: { status: AppointmentStatus }) {
    const meta = statusMeta[status];
    return (
        <View style={[styles.badge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
    );
}

// ----- Stat card -----

export function StatCard({
    label,
    value,
    icon,
    tint = colors.primary,
}: {
    label: string;
    value: number | string;
    icon: keyof typeof Ionicons.glyphMap;
    tint?: string;
}) {
    return (
        <Card style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: `${tint}1A` }]}>
                <Ionicons name={icon} size={18} color={tint} />
            </View>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
        </Card>
    );
}

// ----- Banner -----

export function Banner({
    kind,
    message,
}: {
    kind: "error" | "success" | "info";
    message: string;
}) {
    const palette = {
        error: { bg: colors.dangerSoft, fg: colors.danger, icon: "alert-circle" as const },
        success: { bg: colors.primarySoft, fg: colors.primaryDark, icon: "checkmark-circle" as const },
        info: { bg: colors.warningSoft, fg: colors.warningInk, icon: "information-circle" as const },
    }[kind];
    return (
        <View style={[styles.banner, { backgroundColor: palette.bg }]}>
            <Ionicons name={palette.icon} size={18} color={palette.fg} />
            <Text style={[styles.bannerText, { color: palette.fg }]}>{message}</Text>
        </View>
    );
}

// ----- Empty state -----

export function EmptyState({
    icon,
    title,
    message,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    message: string;
}) {
    return (
        <View style={styles.empty}>
            <View style={styles.emptyIcon}>
                <Ionicons name={icon} size={30} color={colors.primaryDark} />
            </View>
            <Text style={styles.emptyTitle}>{title}</Text>
            <Text style={styles.emptyMessage}>{message}</Text>
        </View>
    );
}

// ----- Screen header -----

export function ScreenHeader({
    title,
    subtitle,
    right,
}: {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
}) {
    return (
        <View style={styles.header}>
            <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>{title}</Text>
                {subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
            </View>
            {right}
        </View>
    );
}

// ----- Filter chips -----

export function FilterChips<T extends string>({
    options,
    value,
    onChange,
}: {
    options: { key: T; label: string; count?: number }[];
    value: T;
    onChange: (key: T) => void;
}) {
    return (
        <View style={styles.chipRow}>
            {options.map((opt) => {
                const active = opt.key === value;
                return (
                    <Pressable
                        key={opt.key}
                        onPress={() => onChange(opt.key)}
                        style={[styles.chip, active && styles.chipActive]}
                    >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {opt.label}
                            {opt.count !== undefined ? ` ${opt.count}` : ""}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    });
}

const styles = StyleSheet.create({
    button: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.sm,
        paddingVertical: 15,
        paddingHorizontal: spacing.lg,
    },
    buttonSecondary: {
        backgroundColor: colors.surface,
        borderWidth: 1.5,
        borderColor: colors.primaryDark,
    },
    buttonDangerGhost: {
        backgroundColor: colors.dangerSoft,
    },
    buttonText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 15,
    },
    inputLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 6,
    },
    input: {
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.sm,
        paddingHorizontal: 14,
        paddingVertical: 13,
        fontSize: 15,
        color: colors.text,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        ...shadow.card,
    },
    badge: {
        borderRadius: radius.full,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: "flex-start",
    },
    badgeText: {
        fontSize: 11,
        fontWeight: "700",
    },
    statCard: {
        flex: 1,
        alignItems: "flex-start",
        padding: 14,
    },
    statIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 10,
    },
    statValue: {
        fontSize: 22,
        fontWeight: "800",
        color: colors.text,
    },
    statLabel: {
        fontSize: 11,
        color: colors.textMuted,
        marginTop: 2,
    },
    banner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        borderRadius: radius.sm,
        padding: 12,
        marginBottom: spacing.md,
    },
    bannerText: {
        flex: 1,
        fontSize: 13,
        fontWeight: "600",
    },
    empty: {
        alignItems: "center",
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
    },
    emptyIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: spacing.md,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 4,
    },
    emptyMessage: {
        fontSize: 13,
        color: colors.textMuted,
        textAlign: "center",
        lineHeight: 19,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: spacing.lg,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: "800",
        color: colors.text,
    },
    headerSubtitle: {
        fontSize: 13,
        color: colors.textMuted,
        marginTop: 2,
    },
    chipRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: spacing.md,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.full,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    chipActive: {
        backgroundColor: colors.primaryDark,
        borderColor: colors.primaryDark,
    },
    chipText: {
        fontSize: 12.5,
        fontWeight: "600",
        color: colors.textMuted,
    },
    chipTextActive: {
        color: "#fff",
    },
});
