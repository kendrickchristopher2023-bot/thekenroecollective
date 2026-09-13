// Daily backup watchdog. A backup that fails quietly is worse than no backup,
// because it produces false confidence. This route reads public.backup_health()
// and routes a stale result to the existing owner alert channel (email + SMS),
// deduped once per kind per day.
//
// The database-side cron also calls public.record_stale_backup_notices(), which
// writes an owner notice with no dependency on this worker being reachable, so a
// miss is recorded even if the site itself is down.
import { createFileRoute } from "@tanstack/react-router";

type HealthRow = {
  kind: string;
  last_success_at: string | null;
  hours_since: number | null;
  table_count: number;
  row_count: number;
  object_count: number;
  bytes: number;
  stale: boolean;
};

export const Route = createFileRoute("/api/public/hooks/backup-watchdog")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("backup_health" as never);
        if (error) {
          console.error("[backup-watchdog] health check failed", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const rows = (data ?? []) as unknown as HealthRow[];
        const stale = rows.filter((r) => r.stale);
        const alerted: string[] = [];

        if (stale.length) {
          const { sendOwnerAlert } = await import("@/lib/owner-alerts.server");
          const today = new Date().toISOString().slice(0, 10);
          for (const r of stale) {
            const label = r.kind === "storage" ? "File backup" : "Database backup";
            await sendOwnerAlert({
              kind: "backup_stale",
              dedupeKey: `backup-stale-alert-${r.kind}-${today}`,
              title: `${label} has not completed`,
              lines: [
                r.last_success_at
                  ? `Last successful run: ${r.last_success_at} (about ${r.hours_since} hours ago).`
                  : "No successful run has ever been recorded.",
                r.kind === "storage"
                  ? "Uploaded songs and photos may not have a second copy right now."
                  : "Table exports may be missing for the most recent day.",
                "Open Owner console, Backups to see the run history.",
              ],
              link: "/owner?tab=backups",
              sms: `${label} has not completed in over 26 hours. Check Owner console, Backups.`,
            });
            alerted.push(r.kind);
          }
        }

        // Access-rule drift. Five times a vendor/RFQ table lost the privileges
        // its own policies depend on, and every time it was found by hand. This
        // makes the system the one that notices.
        let drift: Array<{ object: string; issue: string }> = [];
        const { data: driftData, error: driftError } = await supabaseAdmin.rpc("access_drift" as never);
        if (driftError) {
          console.error("[backup-watchdog] access drift check failed", driftError);
        } else {
          drift = (driftData ?? []) as unknown as Array<{ object: string; issue: string }>;
          if (drift.length) {
            const { sendOwnerAlert } = await import("@/lib/owner-alerts.server");
            const today = new Date().toISOString().slice(0, 10);
            await sendOwnerAlert({
              kind: "access_drift",
              dedupeKey: `access-drift-${today}`,
              title: "Database access rules have drifted",
              lines: [
                `${drift.length} problem${drift.length === 1 ? "" : "s"} found:`,
                ...drift.slice(0, 8).map((d) => `${d.object}: ${d.issue}`),
                "Until this is corrected, part of the app may be refused access, or private vendor details may be readable.",
              ],
              link: "/owner",
              sms: `Database access rules have drifted (${drift.length} problem${drift.length === 1 ? "" : "s"}). Check the owner console.`,
            });
          }
        }

        return Response.json({
          ok: true,
          checked: rows.length,
          stale: alerted,
          health: rows,
          accessDrift: drift,
        });

      },
    },
  },
});
