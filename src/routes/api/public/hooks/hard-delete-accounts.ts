// Hard-deletes accounts that have been in the 30-day soft-delete grace period.
// Called on a schedule via pg_cron. `/api/public/*` bypasses auth, so we guard
// with the Supabase apikey header (the pattern documented in schedule-jobs-modern).
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/hard-delete-accounts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find profiles whose deletion window has elapsed (>30 days).
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: rows, error } = await supabaseAdmin
          .from("profiles")
          .select("id, deletion_requested_at")
          .not("deletion_requested_at", "is", null)
          .lt("deletion_requested_at", cutoff)
          .limit(50);
        if (error) {
          console.error("[hard-delete] query failed", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: { userId: string; ok: boolean; error?: string }[] = [];
        for (const row of rows ?? []) {
          try {
            const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(row.id);
            if (delErr) {
              results.push({ userId: row.id, ok: false, error: delErr.message });
              continue;
            }
            results.push({ userId: row.id, ok: true });
          } catch (e) {
            results.push({
              userId: row.id,
              ok: false,
              error: (e instanceof Error ? e.message : String(e)),
            });
          }
        }

        return Response.json({
          ok: true,
          processed: results.length,
          succeeded: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          cutoff,
        });
      },
    },
  },
});
