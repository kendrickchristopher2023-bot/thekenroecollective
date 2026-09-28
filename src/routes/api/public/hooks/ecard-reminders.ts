import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-triggered Group eCard organizer reminder worker.
 * A few days before a card's reveal, the ORGANIZER gets one email nudging them
 * to re-share the contribution link. Contributors are anonymous and are never
 * emailed. Idempotent via ecards.reminder_sent_at.
 *
 * Auth: shared cron secret, same as the other hooks.
 */
export const Route = createFileRoute("/api/public/hooks/ecard-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { sendDueEcardReminders } = await import("@/lib/ecards-reminders.server");
        const result = await sendDueEcardReminders();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
