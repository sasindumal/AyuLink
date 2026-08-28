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
     *  genuinely still missing. The server decides this, not the app —
     *  both facts live in the database. */
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

export async function ayuStatus(): Promise<AyuStatus> {
    const res = await fetch(`${AGENT_API_URL}/ayu/status`, {
        headers: { Authorization: `Bearer ${await token()}` },
    });
    if (!res.ok) throw new Error(`Couldn't reach Ayu (${res.status})`);
    return (await res.json()) as AyuStatus;
}

export async function ayuSetEnabled(enabled: boolean): Promise<void> {
    await fetch(`${AGENT_API_URL}/ayu/enabled`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ enabled }),
    });
}

/** Records that the patient was nudged, so the next check-in is a month
 *  away instead of on every launch. */
export async function ayuSnooze(): Promise<void> {
    await fetch(`${AGENT_API_URL}/ayu/snooze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await token()}` },
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
 *  land back in the same conversation. */
export function ayuThreadId(patientId: string, mode: "INTAKE" | "CHECKIN"): string {
    const month = new Date().toISOString().slice(0, 7);
    return mode === "INTAKE" ? `ayu:${patientId}:intake` : `ayu:${patientId}:checkin:${month}`;
}
