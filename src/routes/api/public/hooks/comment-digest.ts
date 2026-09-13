import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Hourly digest of new invitation comments, one email per event owner.
 *
 * Only guest comments that have never been included in a digest are picked up
 * (notified_at is null), so a slow hour and a fast hour both behave. Removed
 * comments are skipped; hidden ones are included because the host is exactly
 * who needs to review them.
 */
export const Route = createFileRoute("/api/public/hooks/comment-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !serviceKey) {
          return Response.json({ error: "Server not configured" }, { status: 500 });
        }

        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
        const { enqueueTransactionalEmailServer } = await import(
          "@/lib/email/server-enqueue.server"
        );

        const { data: pending, error } = await admin
          .from("event_comments")
          .select("id,event_id,guest_name,body,visibility,created_at")
          .eq("author_role", "guest")
          .is("notified_at", null)
          .is("removed_at", null)
          .order("created_at", { ascending: true })
          .limit(500);
        if (error) return Response.json({ error: "Query failed" }, { status: 500 });

        const byEvent = new Map<string, any[]>();
        for (const row of pending ?? []) {
          const list = byEvent.get(row.event_id as string) ?? [];
          list.push(row);
          byEvent.set(row.event_id as string, list);
        }

        let emailsQueued = 0;
        let eventsProcessed = 0;
        const notifiedIds: string[] = [];

        for (const [eventId, rows] of byEvent) {
          const { data: ev } = await admin
            .from("events")
            .select("id,data,user_id,archived_at,is_demo")
            .eq("id", eventId)
            .maybeSingle();
          if (!ev || ev.archived_at || (ev as { is_demo?: boolean }).is_demo) {
            notifiedIds.push(...rows.map((r) => r.id as string));
            continue;
          }
          const data = (ev.data as Record<string, any>) || {};
          // Emails live in auth.users, not public.profiles.
          const { data: authUser } = await admin.auth.admin.getUserById(ev.user_id as string);
          const to = (authUser?.user?.email as string | undefined)?.trim().toLowerCase();
          if (!to) {
            notifiedIds.push(...rows.map((r) => r.id as string));
            continue;
          }

          eventsProcessed += 1;
          const res = await enqueueTransactionalEmailServer({
            templateName: "comment-digest",
            recipientEmail: to,
            idempotencyKey: `comment-digest-${eventId}-${rows[rows.length - 1].id}`,
            eventId,
            label: "comment-digest",
            templateData: {
              eventName: data.title || "your event",
              hostName:
                ((authUser?.user?.user_metadata as any)?.display_name as string) ||
                (to?.split("@")[0] ?? "there"),
              manageUrl: `https://thekenroecollective.com/events/${eventId}`,
              comments: rows.map((r) => ({
                name: r.guest_name || "A guest",
                body: r.body,
                visibility: r.visibility,
              })),
            },
          });
          if (res.ok) emailsQueued += 1;
          // Mark either way: a permanently suppressed or unsubscribed host
          // should not make the same comments retry forever.
          notifiedIds.push(...rows.map((r) => r.id as string));
        }

        if (notifiedIds.length) {
          await admin
            .from("event_comments")
            .update({ notified_at: new Date().toISOString() })
            .in("id", notifiedIds);
        }

        return Response.json({
          ok: true,
          pending: (pending ?? []).length,
          eventsProcessed,
          emailsQueued,
        });
      },
    },
  },
});
