import { createFileRoute } from "@tanstack/react-router";

/**
 * Nightly demo reset.
 *
 * Deletes the demo host account's data and re-seeds the fixed fake dataset so
 * the demo environment is always clean for the next prospect. Only touches
 * rows owned by DEMO_ACCOUNT_EMAIL.
 *
 * Auth: `x-cron-secret` header, verified against the vault-managed shared
 * secret (same scheme as the other maintenance hooks).
 */
export const Route = createFileRoute("/api/public/hooks/demo-reset")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { resetDemoData } = await import("@/lib/demo-seed.server");
        const result = await resetDemoData();
        return Response.json(result, { status: result.ok ? 200 : 500 });
      },
    },
  },
});
