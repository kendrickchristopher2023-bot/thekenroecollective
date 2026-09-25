import { createFileRoute } from "@tanstack/react-router";

/**
 * Schedules engine hook, called by pg_cron on the published app.
 *   POST (no body)          -> 5-minute tick: queue due reminders
 *   POST {"job":"topup"}    -> nightly: extend occurrences 90 days ahead and
 *                              delete contact-import files older than 24 hours
 * Requires the shared x-cron-secret header, like every other hook.
 */
export const Route = createFileRoute("/api/public/hooks/schedule-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const body = (await request.json().catch(() => ({}))) as { job?: string };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const engine = await import("@/lib/schedules-engine.server");
        try {
          if (body.job === "topup") {
            const n = await engine.topUpAll(supabaseAdmin as any);
            const { purgeOldImports } = await import("@/lib/contact-import.server");
            const purged = await purgeOldImports(supabaseAdmin as any);
            return Response.json({ ok: true, toppedUp: n, purged });
          }
          const r = await engine.runTick(supabaseAdmin as any);
          return Response.json({ ok: true, ...r });
        } catch (e) {
          console.error("schedule-reminders failed", e);
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }
      },
    },
  },
});
