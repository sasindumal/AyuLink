// ==============================================
// AyuLink Patient - Care Timeline
// Renders one diagnosis's whole journey as a single ordered
// story — visit started, prescription issued, each drug
// dispensed — instead of the patient reassembling it from
// three separate tabs. Fed by app_treatment_timeline(), which
// already returns events in this exact shape; this component
// only has to render them.
// ==============================================

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing, type } from "../theme";
import type {
    CareEvent,
    CareEventAppointmentBooked,
    CareEventAppointmentCancelled,
    CareEventAppointmentCompleted,
    CareEventAppointmentStarted,
    CareEventDiagnosed,
    CareEventItemDispensed,
    CareEventPrescriptionIssued,
} from "../types";

function formatWhen(iso: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    const today = new Date();
    const sameDay =
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
    const clock = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (sameDay) {
        return `Today · ${clock}`;
    }
    // Time on every entry, not just today's. Several events in one care
    // journey routinely land on the same date — visit started, prescribed,
    // dispensed — and a bare "28 Aug" against three of them tells the
    // patient nothing about when in the day each happened. Sequence itself
    // comes from the list order (the server sorts by timestamp); this is
    // the detail that places each one in the day.
    return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ${clock}`;
}

function EventLine({
    icon,
    title,
    subtitle,
    isLast,
    isFuture,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    isLast: boolean;
    isFuture?: boolean;
}) {
    return (
        <View style={styles.row}>
            <View style={styles.rail}>
                <View
                    style={[
                        styles.dot,
                        isFuture && styles.dotFuture,
                    ]}
                >
                    <Ionicons
                        name={icon}
                        size={11}
                        color={isFuture ? colors.textMuted : "#fff"}
                    />
                </View>
                {!isLast && <View style={styles.line} />}
            </View>
            <View style={[styles.textCol, !isLast && { paddingBottom: spacing.md }]}>
                <Text style={[styles.title, isFuture && styles.titleFuture]}>{title}</Text>
                {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
        </View>
    );
}

function renderEvent(event: CareEvent, index: number, total: number) {
    const isLast = index === total - 1;

    if (event.type === "DIAGNOSED") {
        const p = event.payload as CareEventDiagnosed;
        return (
            <EventLine
                key={event.key}
                icon="pulse"
                title="Symptoms assessed"
                subtitle={
                    p.specialty ? `${formatWhen(event.at)} · ${p.specialty}` : `${formatWhen(event.at)} · AI triage`
                }
                isLast={isLast}
            />
        );
    }

    if (event.type === "APPOINTMENT_BOOKED") {
        const p = event.payload as CareEventAppointmentBooked;
        const when = p.appointmentDate
            ? new Date(p.appointmentDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })
            : "";
        const at = p.startTime ? ` ${p.startTime.slice(0, 5)}` : "";
        // Always reads as "booked", even for an appointment since
        // cancelled: the booking genuinely happened, and the cancellation
        // is now its own later entry. This used to rewrite itself into
        // "Appointment cancelled" because that was the only way a
        // cancellation could show at all.
        return (
            <EventLine
                key={event.key}
                icon="calendar"
                title={`Appointment booked with ${p.doctorName}`}
                subtitle={[`${when}${at}`, p.centerName].filter(Boolean).join(" · ")}
                isLast={isLast}
            />
        );
    }

    if (event.type === "APPOINTMENT_STARTED") {
        const p = event.payload as CareEventAppointmentStarted;
        const where = p.centerName ? ` at ${p.centerName}` : "";
        return (
            <EventLine
                key={event.key}
                icon="medkit"
                title={`Seen by ${p.doctorName}`}
                subtitle={`${formatWhen(event.at)}${where}`}
                isLast={isLast}
            />
        );
    }

    if (event.type === "APPOINTMENT_COMPLETED") {
        const p = event.payload as CareEventAppointmentCompleted;
        const where = p.centerName ? ` · ${p.centerName}` : "";
        return (
            <EventLine
                key={event.key}
                icon="checkmark-done"
                title="Visit completed"
                subtitle={`${formatWhen(event.at)}${where}`}
                isLast={isLast}
            />
        );
    }

    if (event.type === "APPOINTMENT_CANCELLED") {
        const p = event.payload as CareEventAppointmentCancelled;
        // Naming who called it off matters: "the centre cancelled on me"
        // and "I cancelled" are very different things to read back later.
        const who =
            p.cancelledByRole === "CHANNELING_CENTER"
                ? "by the centre"
                : p.cancelledByRole === "DOCTOR"
                  ? "by the doctor"
                  : p.cancelledByRole === "PATIENT"
                    ? "by you"
                    : null;
        return (
            <EventLine
                key={event.key}
                icon="close-circle"
                title={`Appointment cancelled${who ? ` ${who}` : ""}`}
                subtitle={[formatWhen(event.at), p.reason].filter(Boolean).join(" · ")}
                isLast={isLast}
            />
        );
    }

    if (event.type === "PRESCRIPTION_ISSUED") {
        const p = event.payload as CareEventPrescriptionIssued;
        const count = p.items?.length ?? 0;
        return (
            <EventLine
                key={event.key}
                icon="document-text"
                title="Prescription issued"
                subtitle={`${formatWhen(event.at)} · ${count} medication${count === 1 ? "" : "s"}`}
                isLast={isLast}
            />
        );
    }

    if (event.type === "ITEM_DISPENSED") {
        const p = event.payload as CareEventItemDispensed;
        return (
            <EventLine
                key={event.key}
                icon="checkmark-circle"
                title={`${p.drugName} dispensed`}
                subtitle={
                    p.pharmacyName ? `${formatWhen(event.at)} · ${p.pharmacyName}` : formatWhen(event.at)
                }
                isLast={isLast}
            />
        );
    }

    // Forward compatible: a newer database can add event types without an
    // older build rendering them as garbage. Skipping is correct here —
    // previously this position was ITEM_DISPENSED's fallthrough, so any
    // unrecognised type rendered as "undefined dispensed".
    return null;
}

export function CareTimeline({
    events,
    courseEndsAt,
    status,
}: {
    events: CareEvent[];
    courseEndsAt: string | null;
    status: string;
}) {
    const showFutureCheckin = !!courseEndsAt && status !== "COMPLETED";

    if (events.length === 0) {
        return (
            <View style={styles.card}>
                <Text style={styles.label}>Care timeline</Text>
                <Text style={styles.empty}>Nothing has happened on this diagnosis yet.</Text>
            </View>
        );
    }

    return (
        <View style={styles.card}>
            <Text style={styles.label}>Care timeline</Text>
            <View style={{ marginTop: spacing.sm }}>
                {events.map((e, i) =>
                    renderEvent(e, i, events.length + (showFutureCheckin ? 1 : 0))
                )}
                {showFutureCheckin && (
                    <EventLine
                        icon="chatbubble-ellipses-outline"
                        title="Check-in when course ends"
                        subtitle={`Expected ${formatWhen(courseEndsAt)}`}
                        isLast
                        isFuture
                    />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
    },
    label: { ...type.label, color: colors.textMuted },
    empty: { ...type.caption, color: colors.textMuted, marginTop: spacing.sm },
    row: { flexDirection: "row", gap: 10 },
    rail: { alignItems: "center", width: 22 },
    dot: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: colors.primaryDark,
        alignItems: "center",
        justifyContent: "center",
    },
    dotFuture: {
        backgroundColor: colors.neutralSoft,
        borderWidth: 1,
        borderColor: colors.border,
    },
    line: { width: 1.5, flex: 1, backgroundColor: colors.border, marginTop: 3, minHeight: 14 },
    textCol: { flex: 1, paddingTop: 1 },
    title: { fontSize: 13.5, fontWeight: "700", color: colors.text, lineHeight: 18 },
    titleFuture: { color: colors.textMuted },
    subtitle: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
});
