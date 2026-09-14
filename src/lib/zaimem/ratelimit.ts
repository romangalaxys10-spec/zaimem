/**
 * ZaiMem in-memory rate limiter (v1.7.2 security audit hardening).
 *
 * Fixed-window counter per key. Suitable for the single-instance deployment;
 * swap for a Redis-backed limiter when scaling horizontally.
 */

const buckets = new Map<string, { count: number; resetAt: number }>();

/** true = allowed, false = rate limited */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (buckets.size > 50_000) prune(now);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

function prune(now: number) {
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

/** Best-effort client IP (proxy-aware); falls back to "local" for direct dev traffic. */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}
