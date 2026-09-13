// Daily digest of demo-guard activity.
//
// Reports guard rows logged in the last 24 hours (attempts to write demo data
// into production paths, etc.) plus how many events the demo accounts created
// in the same window. Quiet unless something happened: any guard rows, or
// more than 5 demo-account event creations in a day.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/demo-guard-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { getDemoUserIds } = await import("@/lib/demo-accounts.server");
        const { sendOwnerAlert } = await import("@/lib/owner-alerts.server");

        const now = new Date();
        const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

        const { data: guardRows, error } = await supabaseAdmin
          .from("demo_guard_log")
          .select("kind, created_at")
          .gte("created_at", since)
          .limit(2000);
        if (error) {
          console.error("[demo-guard-digest] read failed", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const demoUserIds = await getDemoUserIds();
        let createCount = 0;
        if (demoUserIds.length) {
          const { count } = await supabaseAdmin
            .from("events")
            .select("id", { count: "exact", head: true })
            .in("user_id", demoUserIds)
            .gte("created_at", since);
          createCount = count ?? 0;
        }

        const rows = guardRows ?? [];
        if (rows.length === 0 && createCount <= 5) {
          return Response.json({ ok: true, quiet: true });
        }

        const byKind = new Map<string, number>();
        for (const row of rows) {
          const kind = (row as { kind: string }).kind;
          byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
        }
        const lines = [
          `${rows.length} guard event(s) in the last 24h`,
          ...Array.from(byKind.entries()).map(([kind, n]) => `- ${kind}: ${n}`),
          `Demo-account events created: ${createCount}`,
        ];

        const dayKey = now.toISOString().slice(0, 10);
        const sent = await sendOwnerAlert({
          kind: "demo_guard_digest",
          dedupeKey: `demo-guard-digest-${dayKey}`,
          title: "Demo guard daily digest",
          lines,
          link: "/owner",
        });

        return Response.json({
          ok: true,
          quiet: false,
          guardRows: rows.length,
          createCount,
          sent: sent !== false,
        });
      },
    },
  },
});
