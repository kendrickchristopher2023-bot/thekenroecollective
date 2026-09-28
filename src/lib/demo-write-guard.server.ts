/**
 * Guard for public (unauthenticated) invitation writes: RSVP, quick RSVP,
 * check-in, walk-in, well wishes, comments, bring-list claims/suggestions,
 * photo uploads.
 *
 * Rules:
 *  - The showcase event refuses every public write, always (existing DB
 *    triggers already block it; this returns a friendly error before the
 *    database is touched).
 *  - Any other event flagged `is_demo` refuses the write UNLESS the verified
 *    signed-in caller is the demo account. A hostname or caller-controlled
 *    cookie can add restrictions, but can never authorize a write.
 *
 * Server-only.
 */
import { isShowcaseEvent, showcaseRefusal, SHOWCASE_READONLY_MESSAGE } from "@/lib/showcase";

export const DEMO_EVENT_WRITE_MESSAGE =
  "This is a demo event, so posts stay switched off outside the demo.";

export type PublicWriteGuardResult = { ok: true } | { ok: false; error: string };

/**
 * Checks whether a public write against `eventId` should proceed. Callers
 * that return a refusal shape (rather than throwing) can `return` this
 * directly when `ok` is false, mirroring `showcaseRefusal()`.
 */
export async function checkPublicWriteAllowed(
  eventId: string | null | undefined,
): Promise<PublicWriteGuardResult> {
  if (isShowcaseEvent(eventId)) return { ok: false, error: SHOWCASE_READONLY_MESSAGE };
  if (!eventId) return { ok: true };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("events")
      .select("is_demo")
      .eq("id", eventId)
      .maybeSingle();
    const isDemo = !!(data as { is_demo?: boolean } | null)?.is_demo;
    if (!isDemo) return { ok: true };
    const { isDemoCaller } = await import("@/lib/demo-mode.server");
    if (await isDemoCaller()) return { ok: true };
    return { ok: false, error: DEMO_EVENT_WRITE_MESSAGE };
  } catch {
    // If the check itself fails, do not block a real host's real event.
    return { ok: true };
  }
}

/** Throws instead of returning, for handlers that only ever throw on refusal. */
export async function assertPublicWriteAllowed(eventId: string | null | undefined): Promise<void> {
  const result = await checkPublicWriteAllowed(eventId);
  if (!result.ok) throw new Error(result.error);
}

export { showcaseRefusal };
