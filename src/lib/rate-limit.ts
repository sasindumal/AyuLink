// ==============================================
// AyuLink - In-Memory Rate Limiter
// Fixed-window counter keyed by caller-defined key
// (e.g. "login:<ip>:<nic>"). Per-instance only —
// swap for Redis (e.g. @upstash/ratelimit) when
// deploying across multiple serverless instances.
// ==============================================

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Purge expired buckets occasionally so the map doesn't grow forever
let lastCleanup = Date.now();
function cleanup(now: number) {
    if (now - lastCleanup < 60_000) return;
    lastCleanup = now;
    for (const [key, bucket] of buckets) {
        if (bucket.resetAt < now) buckets.delete(key);
    }
}

/**
 * Returns true if the call is allowed, false if the limit is exceeded.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    cleanup(now);

    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }

    bucket.count++;
    return bucket.count <= limit;
}

/** Best-effort client IP from proxy headers. */
export function clientIp(headers: Headers | Record<string, string | string[] | undefined>): string {
    const get = (name: string): string | undefined => {
        if (headers instanceof Headers) return headers.get(name) ?? undefined;
        const value = headers[name];
        return Array.isArray(value) ? value[0] : value;
    };

    const forwarded = get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return get("x-real-ip") ?? "unknown";
}
