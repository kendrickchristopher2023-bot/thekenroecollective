import { createFileRoute } from "@tanstack/react-router";

/**
 * Cron-triggered event countdown reminder worker.
 *
 * Sends the reminder presets a host ticked ("1 week before", "1 day before",
 * "day of") to guests who already hold an invitation. Separate from the RSVP
 * deadline chase, which only nudges guests who have not replied.
 *
 * Auth: shared cron secret, same as the other hooks.
 * Idempotent: public.event_reminder_sends holds one row per guest per preset.
 */
export const Route = createFileRoute("/api/public/hooks/event-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { sendDueEventReminders } = await import("@/lib/event-reminders.server");
        const result = await sendDueEventReminders();
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
