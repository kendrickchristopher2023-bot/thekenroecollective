// Daily eviction for vendor_search_cache.
//
// Two independent reasons this has to run, not just be nice-to-have:
// 1. Cost — every row past its TTL is dead weight; nothing else prunes this
//    table, so it grows unbounded.
// 2. Google's Places API ToS caps how long Place data may be cached at 30
//    days (place IDs may be kept indefinitely, but names/addresses/photos/
//    ratings may not) — rows older than that are a compliance problem, not
//    just a cost one.
import { createFileRoute } from "@tanstack/react-router";

const MAX_AGE_DAYS = 30;

export const Route = createFileRoute("/api/public/hooks/vendor-search-cache-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const { error, count } = await supabaseAdmin
          .from("vendor_search_cache")
          .delete({ count: "exact" })
          .lt("fetched_at", cutoff);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        return Response.json({ ok: true, deleted: count ?? 0 });
      },
    },
  },
});
