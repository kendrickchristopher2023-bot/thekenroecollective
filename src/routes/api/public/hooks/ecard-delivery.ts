import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-triggered Group eCard delivery worker.
 * Emails the reveal link to recipients of paid cards whose reveal moment has
 * passed, then marks them delivered so nothing is ever sent twice.
 *
 * Auth: shared cron secret, same as the other hooks.
 */
export const Route = createFileRoute("/api/public/hooks/ecard-delivery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { deliverDueEcards } = await import("@/lib/ecards-delivery.server");
        const result = await deliverDueEcards();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
