// ==============================================
// AyuLink Patient - Medication course maths
//
// parseDurationDays deliberately mirrors the Postgres
// parse_duration_days() function (see the care-journey events
// migration) case for case. Two implementations of the same rule is
// a real risk, so if one changes the other has to follow — the unit
// test in this file's companion check keeps them honest.
//
// Used to work out where a prescription sits in its lifecycle:
// still to collect, mid-course, or finished.
// ==============================================

import { doseHoursFor } from "./reminders";
import type { Prescription } from "../types";

/** Free-text medication duration -> whole days. Null when open-ended
 *  ("Ongoing", "As needed") or unparseable — callers treat null as
 *  "no course end we can compute". */
export function parseDurationDays(duration: string | null | undefined): number | null {
    const v = (duration ?? "").trim().toLowerCase();
    if (!v || v.includes("ongoing") || v.includes("continuous") || v.includes("as needed")) {
        return null;
    }
    const match = v.match(/(\d+)/);
    if (!match) return null;
    const n = Number(match[1]);
    if (!Number.isFinite(n)) return null;

    if (v.includes("month")) return n * 30;
    if (v.includes("week")) return n * 7;
    if (v.includes("day")) return n;
    // A bare number with no unit is conventionally days in this app.
    return n;
}

/**
 * When the last dispensed medication on this prescription runs out.
 * Null when nothing is dispensed yet, or when any dispensed drug is
 * open-ended (an "Ongoing" drug means the course never self-terminates,
 * so the prescription stays in progress rather than ever reading as
 * finished).
 */
export function courseEndsAt(prescription: Prescription): Date | null {
    const dispensed = prescription.items.filter((i) => i.dispensed && i.dispensedAt);
    if (dispensed.length === 0) return null;

    let latest: Date | null = null;
    for (const item of dispensed) {
        const days = parseDurationDays(item.duration);
        if (days === null) return null; // open-ended — no end date
        const end = new Date(item.dispensedAt!);
        end.setDate(end.getDate() + days);
        if (!latest || end > latest) latest = end;
    }
    return latest;
}

export type RxGroup = "COLLECT" | "TAKING" | "FINISHED" | "EXPIRED_UNCOLLECTED";

/**
 * Which of the four patient-facing groups a prescription belongs to.
 *
 * Reads the ITEMS rather than trusting `status` alone, because
 * prescription_json() derives EXPIRED purely from expires_at — so a
 * prescription the patient fully collected still reports EXPIRED once
 * the date passes. That's fine for "can a pharmacy still dispense
 * this", but it would wrongly file a completed course under "never
 * collected" here.
 */
export function groupFor(prescription: Prescription, now: Date = new Date()): RxGroup {
    const items = prescription.items;
    const allDispensed = items.length > 0 && items.every((i) => i.dispensed);
    const isExpired = prescription.status === "EXPIRED";

    if (!allDispensed) {
        // Nothing left to collect once it's expired — the window closed.
        return isExpired ? "EXPIRED_UNCOLLECTED" : "COLLECT";
    }

    // Fully collected. Expiry is moot at this point; what matters is
    // whether they're still working through the course.
    const end = courseEndsAt(prescription);
    if (end === null) return "TAKING"; // open-ended course, still on it
    return end > now ? "TAKING" : "FINISHED";
}

/** Whole days until expiry; negative once past. Null when it never expires. */
export function daysUntilExpiry(prescription: Prescription, now: Date = new Date()): number | null {
    if (!prescription.expiresAt) return null;
    const expires = new Date(prescription.expiresAt);
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.round((startOfDay(expires) - startOfDay(now)) / 86_400_000);
}

/** Days left of the course; null when not applicable. */
export function daysLeftOfCourse(prescription: Prescription, now: Date = new Date()): number | null {
    const end = courseEndsAt(prescription);
    if (!end) return null;
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.round((startOfDay(end) - startOfDay(now)) / 86_400_000);
}

/**
 * The next dose time today for a prescription's medications, as a label.
 * Derived from each drug's frequency using the same mapping the reminder
 * scheduler uses, so what this screen promises and what the notification
 * actually fires at can't drift apart.
 *
 * Null when nothing has a fixed schedule ("as needed" drugs shouldn't
 * imply a clock time) or when every dose today has already passed.
 */
export function nextDoseLabel(prescription: Prescription, now: Date = new Date()): string | null {
    const dispensed = prescription.items.filter((i) => i.dispensed);
    if (dispensed.length === 0) return null;

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let best: { minutes: number; drug: string } | null = null;

    for (const item of dispensed) {
        for (const hour of doseHoursFor(item.frequency)) {
            const minutes = hour * 60;
            if (minutes <= nowMinutes) continue;
            if (!best || minutes < best.minutes) best = { minutes, drug: item.drugName };
        }
    }
    if (!best) return null;

    const h = Math.floor(best.minutes / 60);
    const m = best.minutes % 60;
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const time = `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
    return `${best.drug} — next dose ${time}`;
}
