// ==============================================
// AyuLink Patient - Slot Picker
//
// The step between "I want this doctor" and an actual booking. Tapping
// Book anywhere in the app opens this: the doctor's real schedule, with
// whatever slot was on the card already selected, and nothing committed
// until Confirm.
//
// One component serves both entry points on purpose — the chat's
// choose_slot interrupt and the Appointments tab's manual booking — so a
// slot chosen by talking to the assistant and one chosen by tapping
// through the UI are the same interaction, not two that drift apart.
// ==============================================

import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";
import { Button, formatDate } from "./ui";
import { AvailabilityCalendar } from "./AvailabilityCalendar";

/** A bookable block, as returned by app_get_doctor_availability. */
export interface PickerSlot {
    doctorScheduleId: string;
    channelingCenterId?: string;
    channelingCenterName?: string;
    address?: string;
    city?: string | null;
    date: string;
    startTime: string;
    endTime: string;
    distanceKm?: number | null;
}

export interface PickerDoctor {
    first_name?: string;
    last_name?: string;
    specialty?: string | null;
    rating?: number | null;
}

/** "17:00:00" -> "5:00 PM" */
export function formatClock(t: string | undefined): string {
    if (!t) return "";
    const [hRaw, mRaw] = t.split(":");
    const h = Number(hRaw);
    if (Number.isNaN(h)) return t;
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${mRaw ?? "00"} ${h < 12 ? "AM" : "PM"}`;
}

export function SlotPicker({
    visible,
    doctor,
    slots,
    preselected,
    title,
    message,
    confirmLabel = "Confirm Booking",
    busy = false,
    onConfirm,
    onCancel,
}: {
    visible: boolean;
    doctor?: PickerDoctor | null;
    slots: PickerSlot[];
    preselected?: { doctor_schedule_id?: string | null; date?: string | null } | null;
    title?: string;
    message?: string | null;
    confirmLabel?: string;
    busy?: boolean;
    onConfirm: (slot: PickerSlot) => void;
    onCancel: () => void;
}) {
    const availableDates = useMemo(
        () => new Set(slots.map((s) => s.date).filter(Boolean)),
        [slots]
    );

    const sortedDates = useMemo(() => [...availableDates].sort(), [availableDates]);

    // Start on whatever the card was already offering, so Confirm is a
    // single tap for anyone happy with the suggestion.
    const [date, setDate] = useState<string | null>(
        preselected?.date && availableDates.has(preselected.date)
            ? preselected.date
            : sortedDates[0] ?? null
    );
    const [scheduleId, setScheduleId] = useState<string | null>(
        preselected?.doctor_schedule_id ?? null
    );

    const daySlots = useMemo(
        () =>
            slots
                .filter((s) => s.date === date)
                .sort((a, b) => a.startTime.localeCompare(b.startTime)),
        [slots, date]
    );

    // A schedule id from another day must not stay "selected" once the
    // patient moves the calendar, or Confirm would book the old day.
    const activeSlot =
        daySlots.find((s) => s.doctorScheduleId === scheduleId) ??
        (daySlots.length === 1 ? daySlots[0] : null);

    const pickDate = (next: string | null) => {
        setDate(next);
        setScheduleId(null);
    };

    const doctorName = doctor
        ? `Dr. ${doctor.first_name ?? ""} ${doctor.last_name ?? ""}`.trim()
        : null;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
            <View style={styles.backdrop}>
                <View style={styles.sheet}>
                    <View style={styles.grabber} />

                    <View style={styles.headerRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title} numberOfLines={1}>
                                {title ?? doctorName ?? "Choose a time"}
                            </Text>
                            {doctor?.specialty && (
                                <Text style={styles.subtitle}>
                                    {doctor.specialty}
                                    {doctor.rating != null ? `  ·  ★ ${doctor.rating.toFixed(1)}` : ""}
                                </Text>
                            )}
                        </View>
                        <Pressable onPress={onCancel} hitSlop={10} style={styles.closeBtn}>
                            <Ionicons name="close" size={20} color={colors.textMuted} />
                        </Pressable>
                    </View>

                    {message ? (
                        <View style={styles.note}>
                            <Ionicons name="information-circle-outline" size={15} color={colors.warningInk} />
                            <Text style={styles.noteText}>{message}</Text>
                        </View>
                    ) : null}

                    <ScrollView
                        style={{ maxHeight: 420 }}
                        contentContainerStyle={{ paddingBottom: spacing.sm }}
                        showsVerticalScrollIndicator={false}
                    >
                        <AvailabilityCalendar
                            availableDates={availableDates}
                            value={date}
                            onChange={pickDate}
                            minDate={sortedDates[0]}
                            maxDate={sortedDates[sortedDates.length - 1]}
                            disabled={busy}
                        />

                        <Text style={styles.sectionLabel}>
                            {date ? `Times on ${formatDate(date)}` : "Pick a day above"}
                        </Text>

                        {date && daySlots.length === 0 && (
                            <Text style={styles.emptyText}>Nothing free that day.</Text>
                        )}

                        {daySlots.map((s) => {
                            const active = activeSlot?.doctorScheduleId === s.doctorScheduleId;
                            return (
                                <Pressable
                                    key={`${s.doctorScheduleId}-${s.date}`}
                                    style={[styles.slotRow, active && styles.slotRowActive]}
                                    onPress={() => setScheduleId(s.doctorScheduleId)}
                                    disabled={busy}
                                >
                                    <View style={[styles.radio, active && styles.radioOn]}>
                                        {active && <View style={styles.radioDot} />}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.slotTime, active && styles.slotTimeActive]}>
                                            {formatClock(s.startTime)} – {formatClock(s.endTime)}
                                        </Text>
                                        {s.channelingCenterName ? (
                                            <Text style={styles.slotCenter} numberOfLines={1}>
                                                {s.channelingCenterName}
                                                {s.city ? `, ${s.city}` : ""}
                                            </Text>
                                        ) : null}
                                        {s.address ? (
                                            <Text style={styles.slotAddress} numberOfLines={1}>
                                                {s.address}
                                            </Text>
                                        ) : null}
                                    </View>
                                    {s.distanceKm != null && (
                                        <Text style={styles.distance}>{s.distanceKm.toFixed(1)} km</Text>
                                    )}
                                </Pressable>
                            );
                        })}
                    </ScrollView>

                    <View style={styles.footer}>
                        <Pressable style={styles.backBtn} onPress={onCancel} disabled={busy}>
                            <Text style={styles.backText}>Back</Text>
                        </Pressable>
                        <View style={{ flex: 1 }}>
                            <Button
                                title={confirmLabel}
                                onPress={() => activeSlot && onConfirm(activeSlot)}
                                disabled={!activeSlot || busy}
                                loading={busy}
                            />
                        </View>
                    </View>

                    {activeSlot && (
                        <Text style={styles.summary} numberOfLines={2}>
                            {formatDate(activeSlot.date)} · {formatClock(activeSlot.startTime)}
                            {activeSlot.channelingCenterName ? ` · ${activeSlot.channelingCenterName}` : ""}
                        </Text>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(28, 43, 26, 0.45)", justifyContent: "flex-end" },
    sheet: {
        backgroundColor: colors.background,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        padding: spacing.lg,
        paddingTop: spacing.sm,
    },
    grabber: {
        alignSelf: "center",
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
        marginBottom: spacing.sm,
    },
    headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: spacing.sm },
    title: { fontSize: 16.5, fontWeight: "800", color: colors.text },
    subtitle: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    closeBtn: { padding: 2 },
    note: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 7,
        backgroundColor: colors.warningSoft,
        borderRadius: radius.sm,
        padding: 10,
        marginBottom: spacing.sm,
    },
    noteText: { flex: 1, fontSize: 12.5, color: colors.warningInk, lineHeight: 17 },
    sectionLabel: {
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: colors.textMuted,
        marginTop: spacing.md,
        marginBottom: 6,
    },
    emptyText: { fontSize: 13, color: colors.textMuted, paddingVertical: spacing.sm },
    slotRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: spacing.md,
        marginBottom: 8,
    },
    slotRowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
    radio: {
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 1.5,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    radioOn: { borderColor: colors.primaryDark },
    radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primaryDark },
    slotTime: { fontSize: 14.5, fontWeight: "700", color: colors.text },
    slotTimeActive: { color: colors.primaryDark },
    slotCenter: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    slotAddress: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
    distance: { fontSize: 11.5, fontWeight: "700", color: colors.primaryDark },
    footer: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: spacing.sm },
    backBtn: { paddingVertical: 12, paddingHorizontal: 8 },
    backText: { color: colors.textMuted, fontWeight: "700", fontSize: 13.5 },
    summary: {
        textAlign: "center",
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 8,
    },
});
