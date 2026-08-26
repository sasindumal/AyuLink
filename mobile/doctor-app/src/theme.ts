// ==============================================
// AyuLink Mobile - Design Tokens
// Mirrors the web app's brand palette
// ==============================================

import type { PrescriptionStatus } from "./types";

export const colors = {
    background: "#F7F0F0",
    surface: "#FFFFFF",
    primaryDark: "#25671E",
    primary: "#48A111",
    primarySoft: "#E8F4E3",
    warning: "#F2B50B",
    warningSoft: "#FDF3D7",
    danger: "#D64545",
    dangerSoft: "#FBE9E9",
    text: "#1C2B1A",
    textMuted: "#71806E",
    border: "#E5DFD6",
    neutral: "#6B7280",
    neutralSoft: "#EFEFEC",
};

export const radius = {
    sm: 10,
    md: 16,
    lg: 22,
    full: 999,
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
};

export const shadow = {
    card: {
        shadowColor: "#25671E",
        shadowOpacity: 0.07,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },
};

export const statusMeta: Record<
    PrescriptionStatus,
    { label: string; color: string; bg: string }
> = {
    NOT_DISPENSED: { label: "Not Dispensed", color: colors.primaryDark, bg: colors.primarySoft },
    PARTIALLY_DISPENSED: { label: "Partial", color: "#9A6F00", bg: colors.warningSoft },
    FULLY_DISPENSED: { label: "Dispensed", color: colors.neutral, bg: colors.neutralSoft },
    EXPIRED: { label: "Expired", color: colors.danger, bg: colors.dangerSoft },
};
