// Problem alerting.
//
// Runs hourly. Two jobs in one route:
//  - Every run: look at the last hour of production faults and text + email the
//    owner about any single fault that hit several visits. Deduped per fault per
//    hour, so a long outage sends one text an hour, not one per report.
//  - Once a day (the run passing digest=true): email a plain summary of the
//    previous 24 hours, with no text message.
//
// A dropped connection never pages. See src/lib/error-alerts.ts for the rule.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/error-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return new Response("Unauthorized", { status: 401 });
        }

        let digest = false;
        let dryRun = false;
        try {
          const body = (await request.json()) as
            | { digest?: boolean; dryRun?: boolean }
            | null;
          digest = !!body?.digest;
          // A dry run does every read and builds the summary, but sends
          // nothing. It exists so the daily summary can be proven to work
          // without waiting a day or texting anybody.
          dryRun = !!body?.dryRun;
        } catch {
          /* empty body is a normal hourly run */
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const {
          groupErrors,
          selectPageWorthy,
          pageAlert,
          digestAlert,
          isConnectionNoise,
        } = await import("@/lib/error-alerts");
        const { sendOwnerAlert } = await import("@/lib/owner-alerts.server");
        const { getDemoUserIds } = await import("@/lib/demo-accounts.server");

        const now = new Date();
        const sinceHour = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
        const demoUserIds = await getDemoUserIds();

        let hourQuery = supabaseAdmin
          .from("app_error_logs")
          .select("fingerprint, error_name, message, route, source, user_id, created_at")
          .eq("environment", "production")
          .is("resolved_at", null)
          .gte("created_at", sinceHour)
          .limit(2000);
        for (const id of demoUserIds) hourQuery = hourQuery.neq("user_id", id);
        const { data: hourRows, error } = await hourQuery;
        if (error) {
          console.error("[error-alerts] read failed", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const groups = groupErrors((hourRows ?? []) as never[]);
        const paged: string[] = [];
        const hourKey = now.toISOString().slice(0, 13);
        for (const g of selectPageWorthy(groups)) {
          const alert = pageAlert(g);
          if (!dryRun) {
            await sendOwnerAlert({
              kind: "error_spike",
              dedupeKey: `error-spike-${g.fingerprint}-${hourKey}`,
              title: alert.title,
              lines: alert.lines,
              link: "/owner?tab=errors",
              sms: alert.sms,
            });
          }
          paged.push(g.fingerprint);
        }

        let digested = 0;
        let digestSent = false;
        let digestTitle: string | null = null;
        if (digest) {
          const sinceDay = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          let dayQuery = supabaseAdmin
            .from("app_error_logs")
            .select("fingerprint, error_name, message, route, source, user_id, created_at")
            .eq("environment", "production")
            .gte("created_at", sinceDay.toISOString())
            .limit(5000);
          for (const id of demoUserIds) dayQuery = dayQuery.neq("user_id", id);
          const { data: dayRows, error: dayError } = await dayQuery;
          if (dayError) {
            console.error("[error-alerts] digest read failed", dayError);
            // A failed read used to be swallowed and reported as a healthy run,
            // which is how a silent alerting gap starts. It now fails loudly.
            return Response.json(
              { ok: false, stage: "digest", error: dayError.message },
              { status: 500 },
            );
          }
          const dayGroups = groupErrors((dayRows ?? []) as never[]).filter(
            (g) => !isConnectionNoise(g),
          );
          const summary = digestAlert(dayGroups, sinceDay.toISOString().slice(0, 10));
          digestTitle = summary.title;
          if (!dryRun) {
            // Keyed on the day being summarised AND the hour the schedule fires,
            // so a hand-run test earlier in the day can no longer swallow the
            // real 11:25 run. That collision is why this summary never arrived.
            const sent = await sendOwnerAlert({
              kind: "error_digest",
              dedupeKey: `error-digest-${sinceDay.toISOString().slice(0, 10)}-h${now
                .toISOString()
                .slice(11, 13)}`,
              title: summary.title,
              lines: summary.lines,
              link: "/owner?tab=errors",
            });
            digestSent = sent !== false;
          }
          digested = dayGroups.length;
        }

        return Response.json({
          ok: true,
          dryRun,
          ranDigest: digest,
          groups: groups.length,
          paged,
          digested,
          digestSent,
          digestTitle,
        });
      },
    },
  },
});
