/**
 * Ad-hoc in-memory IP rate limiter for public server routes / server fns.
 *
 * Zero-dependency. Uses a Map<key, { count, resetAt }>. If the Worker
 * restarts the counter resets — acceptable for casual abuse prevention.
 * Do NOT use for security-critical throttling; layer real DB or upstream
 * limits when the endpoint is truly sensitive.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Best-effort caller IP from proxy headers. Falls back to a static key so
 *  we still enforce a global limit if headers are missing. */
export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export interface RateLimitOptions {
  /** Scope name — different endpoints should use different scopes. */
  scope: string;
  /** Max requests per window. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Optional extra key (e.g. eventId) to isolate buckets further. */
  key?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

export function checkRateLimit(clientKey: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const full = `${opts.scope}:${opts.key ?? ""}:${clientKey}`;
  const existing = buckets.get(full);
  if (!existing || existing.resetAt <= now) {
    buckets.set(full, { count: 1, resetAt: now + opts.windowMs });
    // Opportunistic GC when the map grows.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return { allowed: true, remaining: opts.max - 1, resetAt: now + opts.windowMs, retryAfterSec: 0 };
  }
  if (existing.count >= opts.max) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return {
    allowed: true,
    remaining: opts.max - existing.count,
    resetAt: existing.resetAt,
    retryAfterSec: 0,
  };
}

/** Convenience: check + return a 429 Response when blocked, else null. */
export function enforceIpRateLimit(request: Request, opts: RateLimitOptions): Response | null {
  const ip = getClientIp(request);
  const res = checkRateLimit(ip, opts);
  if (res.allowed) return null;
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      message: "You've made too many requests. Please try again in a moment.",
      retryAfterSec: res.retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "retry-after": String(res.retryAfterSec),
      },
    },
  );
}
