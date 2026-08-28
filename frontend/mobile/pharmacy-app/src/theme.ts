// ==============================================
// AyuLink Mobile - Design Tokens
// Mirrors the web app's brand palette
// ==============================================

import type { PrescriptionStatus } from "./types";

// Brand colors are exactly #25671E / #48A111 / #F2B50B / #F7F0F0 — nothing
// added to that set. Everything else here is DERIVED from those four:
// text/textMuted/border are the brand green desaturated to different
// depths, primarySoft/warningSoft are the brand green/amber tinted onto
// white, and warningInk/onBright are ink dark enough to sit on the
// brighter two brand colors (neither #48A111 nor #F2B50B passes WCAG AA
// with white or with each other's on-brand text weight — verified,
// see docs/design/ayulink-design.html for the full contrast audit).
//
// #96302A is the one addition beyond the four: destructive actions and
// expired/cancelled states need a hue readers reliably parse as
// "warning/undo this", which four colors alone that never got past
// AA testing.
export const colors = {
    background: "#F7F0F0",
    surface: "#FFFFFF",
    primaryDark: "#25671E",
    primary: "#48A111",
    primarySoft: "#EDF6E7",
    warning: "#F2B50B",
    warningInk: "#916800",
    warningSoft: "#FDF5DD",
    danger: "#96302A",
    dangerSoft: "#F1E6E5",
    text: "#1A2E18",
    textMuted: "#57654F",
    border: "#E2D4D4",
    // Darkened from #6B7280 — that value predates this pass and failed
    // AA on neutralSoft (4.20:1) for "Completed"/"Fully Dispensed" badges.
    neutral: "#5A616D",
    neutralSoft: "#EFEFEC",
    onBright: "#14210F",
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
    PARTIALLY_DISPENSED: { label: "Partial", color: colors.warningInk, bg: colors.warningSoft },
    FULLY_DISPENSED: { label: "Dispensed", color: colors.neutral, bg: colors.neutralSoft },
    EXPIRED: { label: "Expired", color: colors.danger, bg: colors.dangerSoft },
};
