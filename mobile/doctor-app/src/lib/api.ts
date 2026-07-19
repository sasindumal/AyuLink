// ==============================================
// AyuLink Mobile - API Client
// Thin JSON fetch wrapper with Bearer auth
// ==============================================

import { API_URL } from "./config";

export class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

interface RequestOptions {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: unknown;
    token?: string | null;
}

export async function api<T>(
    path: string,
    { method = "GET", body, token }: RequestOptions = {}
): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${API_URL}${path}`, {
            method,
            headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new ApiError(
            "Cannot reach the AyuLink server. Check your connection and the API URL in src/lib/config.ts.",
            0
        );
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const message =
            typeof (data as { error?: string })?.error === "string"
                ? (data as { error: string }).error
                : `Request failed (${res.status})`;
        throw new ApiError(message, res.status);
    }
    return data as T;
}
