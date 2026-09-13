import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import { isDemoHostname, DEMO_BLOCKED_MESSAGE, DEMO_COOKIE, DEMO_ACCOUNT_EMAIL } from "@/lib/demo-mode";

/**
 * Server-side demo detection.
 *
 * Demo mode is decided by WHO is signed in first, and only then by the
 * browser's cookie or hostname. The cookie and host can add restrictions; they
 * can never remove them. So a visitor who clears `kenroe_demo` while still
 * holding the shared demo account's session stays fully restricted: no email,
 * no SMS, no live Stripe, no invites, no exports, no generation.
 *
 * On Cloudflare Workers the request context binds per-request — never cache
 * a per-request answer at module scope.
 */

/** Known id of the shared demo host; refreshed by lookup if it ever drifts. */
const KNOWN_DEMO_USER_ID = "7d036969-831d-4dd8-a219-1c493d7aacb4";

/** The showcase's locked system account (no password, banned, never handed out). */
export const SHOWCASE_SYSTEM_EMAIL = "showcase-system@thekenroecollective.com";

type BearerClaims = {
  sub?: string;
  email?: string;
  user_metadata?: { is_demo?: unknown } | null;
  app_metadata?: { system_account?: unknown } | null;
};

/**
 * Decodes (without verifying) the JWT on the current request. Unverified is
 * fine here: a forged claim can only ever ADD demo restrictions to the
 * caller, never lift them, and every real authorization decision still runs
 * through the verified `requireSupabaseAuth` middleware.
 */
export function readBearerClaims(): BearerClaims | null {
  try {
    const header = getRequestHeader("authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as BearerClaims;
  } catch {
    return null;
  }
}

/** True when a set of token claims belongs to the demo or showcase accounts. */
export function claimsAreDemo(claims: BearerClaims | null | undefined): boolean {
  if (!claims) return false;
  const email = String(claims.email ?? "").toLowerCase();
  if (email === DEMO_ACCOUNT_EMAIL || email === SHOWCASE_SYSTEM_EMAIL) return true;
  if (claims.sub === KNOWN_DEMO_USER_ID) return true;
  if (claims.user_metadata?.is_demo === true) return true;
  if (claims.app_metadata?.system_account === "showcase") return true;
  return false;
}

/** Synchronous demo check for code paths that cannot await (Stripe client factory). */
export function isDemoRequestSync(): boolean {
  try {
    if (process.env["DEMO_MODE"] === "true") return true;
    if (claimsAreDemo(readBearerClaims())) return true;
    if (getCookie(DEMO_COOKIE) === "1") return true;
    const host = getRequestHeader("x-forwarded-host") ?? getRequestHeader("host") ?? null;
    return isDemoHostname(host);
  } catch {
    // Called outside a request context (e.g. a cron worker) — not demo.
    return false;
  }
}

/** True when the given user id is the demo host or the showcase system account. */
export async function isDemoUserId(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if (userId === KNOWN_DEMO_USER_ID) return true;
  try {
    const { getDemoUserId, getShowcaseUserId } = await import("@/lib/demo-accounts.server");
    const [demoId, showcaseId] = await Promise.all([getDemoUserId(), getShowcaseUserId()]);
    return userId === demoId || (!!showcaseId && userId === showcaseId);
  } catch {
    return false;
  }
}

/**
 * Is this request a demo request? True when the caller is signed in as the
 * demo/showcase account (whatever the cookie says), or when the browser has
 * opted into the demo, or when the hostname is a demo host.
 */
export async function isDemoRequest(): Promise<boolean> {
  if (isDemoRequestSync()) return true;
  try {
    const claims = readBearerClaims();
    if (claims?.sub && (await isDemoUserId(claims.sub))) return true;
  } catch {
    /* no request context */
  }
  return false;
}

/**
 * Is the SIGNED-IN caller the demo account? Unlike isDemoRequest this ignores
 * the cookie and host, so it is the right check for "this account may never
 * do X" rules. Pass the verified middleware context when you have it.
 */
export async function isDemoCaller(ctx?: { userId?: string; claims?: unknown }): Promise<boolean> {
  const claims = (ctx?.claims as BearerClaims | undefined) ?? readBearerClaims();
  if (claimsAreDemo(claims)) return true;
  const sub = ctx?.userId ?? claims?.sub;
  return isDemoUserId(sub);
}

/**
 * Hard block for destructive or cross-tenant actions in the demo environment.
 * Throws so the calling server function aborts before touching real data.
 * Every refusal is recorded in demo_guard_log for the daily owner alert.
 */
export async function assertNotDemo(action?: string): Promise<void> {
  if (await isDemoRequest()) {
    const a = (action ?? "").toLowerCase();
    const kind: DemoGuardKind =
      a.includes("export") || a.includes("report") ? "export"
      : a.includes("generate") ? "generate"
      : a.includes("invit") ? "invite"
      : "copy_blocked";
    await logDemoGuard(kind, { action: action ?? null });
    throw new Error(
      action ? `${DEMO_BLOCKED_MESSAGE} (${action})` : DEMO_BLOCKED_MESSAGE,
    );
  }
}

export type DemoGuardKind =
  | "send_email"
  | "send_sms"
  | "payment"
  | "invite"
  | "export"
  | "generate"
  | "event_create"
  | "copy_blocked"
  | "sign_in";

/**
 * Records a blocked (or notable) demo attempt for the daily owner alert.
 * Best effort: logging must never break the guarded action.
 */
export async function logDemoGuard(
  kind: DemoGuardKind,
  detail: Record<string, unknown> = {},
  actorUserId?: string | null,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const actor = actorUserId ?? readBearerClaims()?.sub ?? null;
    await supabaseAdmin
      .from("demo_guard_log")
      .insert({ kind, actor_user_id: actor, detail: detail as never });
  } catch {
    /* ignore */
  }
}

/**
 * Refuses an action for the demo account and logs the attempt. Use this for
 * the things a demo visitor must never be able to do: send, pay live, invite,
 * export guest data, spend generation credit.
 */
export async function assertNotDemoCaller(
  kind: DemoGuardKind,
  ctx?: { userId?: string; claims?: unknown },
  detail: Record<string, unknown> = {},
): Promise<void> {
  if (await isDemoCaller(ctx)) {
    await logDemoGuard(kind, detail, ctx?.userId ?? null);
    throw new Error(DEMO_BLOCKED_MESSAGE);
  }
}

/**
 * Coerce a Stripe environment to `sandbox` whenever the caller is on the demo
 * host or signed in as the demo account. The demo must never be able to reach
 * the live Stripe account, even if a crafted request body asks for it.
 */
export async function resolveDemoSafeStripeEnv(
  requested: "sandbox" | "live",
): Promise<"sandbox" | "live"> {
  return (await isDemoRequest()) ? "sandbox" : requested;
}
