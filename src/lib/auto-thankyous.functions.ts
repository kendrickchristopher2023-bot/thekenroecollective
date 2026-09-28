import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Owner-callable manual trigger for the auto-thank-you cron worker.
 * Useful when the owner wants to fire any pending auto-sends right now
 * (e.g. for a same-day event) without waiting for the hourly cron.
 *
 * Forwards to /api/public/hooks/auto-thankyous so the logic lives in one place.
 */
export const runPendingThankYousNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isOwner) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Owner or admin only");
    }

    const { getCronSharedSecret } = await import("@/lib/cron-auth.server");
    const cronSecret = await getCronSharedSecret();
    if (!cronSecret) throw new Error("Server misconfigured");

    // Resolve our own host from the request — falls back to the published preview URL.
    const siteOrigin =
      process.env.SITE_ORIGIN ||
      "https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app";

    const r = await fetch(`${siteOrigin}/api/public/hooks/auto-thankyous`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
      body: "{}",
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((json as any)?.error || `Worker failed (${r.status})`);
    return json;
  });
