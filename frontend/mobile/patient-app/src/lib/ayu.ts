// ==============================================
// AyuLink Patient - Ayu client
//
// Ayu is a second agent with its own graph and its own /ayu/* endpoints.
// It shares the SSE transport with the diagnosis chat but nothing else —
// different thread namespace, different interrupt vocabulary.
// ==============================================

import { fetch } from "expo/fetch";
import { AGENT_API_URL } from "./agentConfig";
import { supabase } from "./supabase";
import type { AgentEvent } from "./agentChat";
import {
    completeness,
    getMyHealthProfile,
    missingCount,
    saveMyHealthProfile,
    type HealthProfile,
} from "./healthProfile";

export type AyuInterrupt =
    | {
          type: "ayu_language";
          message: string;
          options: { value: string; label: string }[];
      }
    | {
          type: "ayu_question";
          question: string;
          step: number;
          total: number;
          section: string;
      }
    | { type: "ayu_report"; report: string; message: string };

export interface AyuStatus {
    enabled: boolean;
    language: "EN" | "SI" | "TA";
    everCompleted: boolean;
    missingCount: number;
    totalQuestions: number;
    /** True when it's been a month since the last nudge AND something is
     *  genuinely still missing. Derived from PatientProfile, so it is
     *  available whenever Supabase is — the agent backend is not
     *  involved. */
    dueForCheckin: boolean;
}

async function token(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const t = data.session?.access_token;
    if (!t) throw new Error("Not signed in");
    return t;
}

async function streamSSE(response: Response, onEvent: (e: AgentEvent) => void): Promise<void> {
    if (!response.ok || !response.body) throw new Error(`Ayu request failed (${response.status})`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, i);
            buffer = buffer.slice(i + 2);
            let name = "message";
            let data = "";
            for (const line of raw.split("\n")) {
                if (line.startsWith("event:")) name = line.slice(6).trim();
                else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (!data) continue;
            try {
                onEvent({ event: name, data: JSON.parse(data) } as AgentEvent);
            } catch {
                /* ignore malformed chunk */
            }
        }
    }
}

export async function ayuStart(
    threadId: string,
    mode: "INTAKE" | "CHECKIN",
    onEvent: (e: AgentEvent) => void
): Promise<void> {
    const res = await fetch(`${AGENT_API_URL}/ayu/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ thread_id: threadId, mode }),
    });
    await streamSSE(res as unknown as Response, onEvent);
}

export async function ayuResume(
    threadId: string,
    value: unknown,
    onEvent: (e: AgentEvent) => void
): Promise<void> {
    const res = await fetch(`${AGENT_API_URL}/ayu/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ thread_id: threadId, value }),
    });
    await streamSSE(res as unknown as Response, onEvent);
}

const CHECKIN_INTERVAL_DAYS = 30;

/** Ayu's on/off state and how much is left to ask.
 *
 *  Read from SUPABASE, not from the agent backend, even though
 *  /ayu/status computes exactly the same thing. Every value here already
 *  lives on PatientProfile, and routing the question through the agent
 *  made the controls depend on that service being awake: a sleeping or
 *  undeployed backend returned an error, the caller fell back to null,
 *  and both the bubble AND the off-switch vanished — leaving someone who
 *  had turned Ayu off with no way to turn it back on.
 *
 *  The backend is still needed for the conversation itself. It is not
 *  needed to draw a toggle. /ayu/status remains for anything server-side
 *  that wants the same answer. */
export async function ayuStatus(): Promise<AyuStatus> {
    return statusFrom(await getMyHealthProfile());
}

export function statusFrom(profile: HealthProfile): AyuStatus {
    const c = profile.profile ?? {};
    const { total } = completeness(profile);
    const missing = missingCount(profile);
    const enabled = c.ayu_enabled !== false;
    const everCompleted = !!c.profile_completed_at;

    let due = false;
    if (enabled && missing > 0) {
        if (!everCompleted || !c.ayu_last_prompted_at) {
            due = true;
        } else {
            const last = new Date(c.ayu_last_prompted_at).getTime();
            due =
                Number.isNaN(last) ||
                last < Date.now() - CHECKIN_INTERVAL_DAYS * 86400000;
        }
    }

    return {
        enabled,
        language: (c.preferred_language as AyuStatus["language"]) ?? "EN",
        everCompleted,
        missingCount: missing,
        // Derived, not fixed: the interview is planned per patient, and the
        // female-only sections are not part of anyone else's total.
        totalQuestions: total,
        dueForCheckin: due,
    };
}

export async function ayuSetEnabled(enabled: boolean): Promise<void> {
    await saveMyHealthProfile({ profile: { ayuEnabled: enabled } });
}

/** Change the language Ayu speaks.
 *
 *  Two things happen, and both are needed for the change to be visible:
 *
 *  1. `preferred_language` is persisted, so the next run opens in it.
 *  2. `ayu_last_prompted_at` is CLEARED, bringing the next check-in
 *     forward. The last nudge was in a language the patient has just told
 *     us they don't want, so it should not still be holding the clock —
 *     otherwise dismissing the bubble once would keep Ayu quiet for a
 *     month after the switch. (Clearing only works from migration
 *     20260919000000 onward; before it, the null was silently ignored.)
 *
 *  The thread id carries the language too (see `ayuThreadId`), so an
 *  interview started in the old language is never resumed in the new one —
 *  Ayu opens a fresh conversation and re-reads the health profile. */
export async function ayuSetLanguage(language: "EN" | "SI"): Promise<void> {
    await saveMyHealthProfile({
        profile: { preferredLanguage: language, ayuLastPromptedAt: null },
    });
}

/** Records that the patient was nudged, so the next check-in is a month
 *  away instead of on every launch. */
export async function ayuSnooze(): Promise<void> {
    await saveMyHealthProfile({
        profile: { ayuLastPromptedAt: new Date().toISOString() },
    }).catch(() => {});
}

export async function ayuHistory(threadId: string) {
    const res = await fetch(
        `${AGENT_API_URL}/ayu/history?thread_id=${encodeURIComponent(threadId)}`,
        { headers: { Authorization: `Bearer ${await token()}` } }
    );
    if (!res.ok) throw new Error(`Couldn't load the conversation (${res.status})`);
    return (await res.json()) as {
        messages: { role: "user" | "assistant"; content: string }[];
        interrupt: AyuInterrupt | null;
        started: boolean;
        saved?: boolean;
    };
}

/** One stable thread per patient per purpose. Ayu is a single ongoing
 *  relationship, not a series of unrelated chats, so reopening it must
 *  land back in the same conversation.
 *
 *  The language is part of the id. A thread's language is fixed in its
 *  checkpoint the first time `start` runs, so resuming one after the
 *  patient switched languages would carry on in the old one — the setting
 *  would look like it had done nothing. Keying on it means a switch opens
 *  a fresh conversation that re-reads the health profile and asks in the
 *  new language, which is the whole point of changing it. */
export function ayuThreadId(
    patientId: string,
    mode: "INTAKE" | "CHECKIN",
    language?: string
): string {
    const month = new Date().toISOString().slice(0, 7);
    const lang = language ? `:${language.toLowerCase()}` : "";
    return mode === "INTAKE"
        ? `ayu:${patientId}:intake${lang}`
        : `ayu:${patientId}:checkin:${month}${lang}`;
}
