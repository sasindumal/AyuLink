// ==============================================
// AyuLink Mobile - Agent Chat SSE Client
//
// Talks to the LangGraph FastAPI backend over
// Server-Sent Events. Uses expo/fetch (not the
// global fetch) because React Native's built-in
// fetch doesn't expose an incrementally-readable
// response body — expo/fetch does.
// ==============================================

import { fetch } from "expo/fetch";
import { AGENT_API_URL } from "./agentConfig";
import { supabase } from "./supabase";

export interface DoctorCard {
    doctor_id?: string;
    first_name?: string;
    last_name?: string;
    specialty?: string;
    rating?: number | null;
    channeling_center_id?: string;
    channeling_center_name?: string;
    address?: string;
    city?: string | null;
    doctor_schedule_id?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
}

export type AgentEvent =
    | { event: "token"; data: { content: string } }
    | { event: "thinking"; data: { message: string } }
    | { event: "node"; data: { node: string } }
    | { event: "cards"; data: { doctors: DoctorCard[] } }
    | { event: "interrupt"; data: InterruptPayload }
    | { event: "done"; data: Record<string, never> }
    | { event: "error"; data: { message: string } };

export type InterruptPayload =
    | { type: "ask_followup"; question: string }
    | { type: "offer_doctor"; condition: string; message: string }
    | { type: "ask_location_time"; default: string; message: string }
    | { type: "present_top5"; doctors: DoctorCard[] };

async function getAccessToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Not signed in");
    return token;
}

async function streamSSE(
    response: Response,
    onEvent: (evt: AgentEvent) => void
): Promise<void> {
    if (!response.ok || !response.body) {
        throw new Error(`Agent request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIndex: number;
        while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + 2);

            let eventName = "message";
            let dataLine = "";
            for (const line of rawEvent.split("\n")) {
                if (line.startsWith("event:")) eventName = line.slice(6).trim();
                else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
            }
            if (!dataLine) continue;
            try {
                const data = JSON.parse(dataLine);
                onEvent({ event: eventName, data } as AgentEvent);
            } catch {
                // ignore malformed chunks
            }
        }
    }
}

export async function sendMessage(
    threadId: string,
    message: string,
    onEvent: (evt: AgentEvent) => void
): Promise<void> {
    const token = await getAccessToken();
    const response = await fetch(`${AGENT_API_URL}/chat`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ thread_id: threadId, message }),
    });
    await streamSSE(response as unknown as Response, onEvent);
}

export async function resumeChat(
    threadId: string,
    value: unknown,
    onEvent: (evt: AgentEvent) => void
): Promise<void> {
    const token = await getAccessToken();
    const response = await fetch(`${AGENT_API_URL}/chat/resume`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ thread_id: threadId, value }),
    });
    await streamSSE(response as unknown as Response, onEvent);
}

export async function sendPdf(
    threadId: string,
    fileUri: string,
    fileName: string,
    onEvent: (evt: AgentEvent) => void
): Promise<void> {
    const token = await getAccessToken();
    const form = new FormData();
    form.append("thread_id", threadId);
    form.append("file", {
        uri: fileUri,
        name: fileName,
        type: "application/pdf",
    } as unknown as Blob);

    const response = await fetch(`${AGENT_API_URL}/chat/pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    await streamSSE(response as unknown as Response, onEvent);
}

export async function sendImage(
    threadId: string,
    fileUri: string,
    fileName: string,
    mimeType: string,
    onEvent: (evt: AgentEvent) => void
): Promise<void> {
    const token = await getAccessToken();
    const form = new FormData();
    form.append("thread_id", threadId);
    form.append("file", {
        uri: fileUri,
        name: fileName,
        type: mimeType,
    } as unknown as Blob);

    const response = await fetch(`${AGENT_API_URL}/chat/image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    await streamSSE(response as unknown as Response, onEvent);
}

// Fire-and-forget "wake up" ping for a sleeping free-tier backend (e.g.
// Render's free instance spins down after 15 min idle and pays a ~30-60s
// cold-start penalty on the next request). Call this once on app launch
// so that penalty lands during normal app navigation instead of when the
// patient actually opens the Assistant tab. Never throws and is never
// awaited by the caller — if it fails, the real request later just
// cold-starts normally, same as if this didn't exist. No auth needed,
// /health doesn't require it.
export function warmUpBackend(): void {
    fetch(`${AGENT_API_URL}/health`).catch(() => {});
}

export interface ChatHistory {
    messages: { role: "user" | "assistant"; content: string }[];
    interrupt: InterruptPayload | null;
}

export async function fetchHistory(threadId: string): Promise<ChatHistory> {
    const token = await getAccessToken();
    const response = await fetch(
        `${AGENT_API_URL}/chat/history?thread_id=${encodeURIComponent(threadId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
        throw new Error(`Could not load conversation history (${response.status})`);
    }
    return (await response.json()) as ChatHistory;
}
