import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

/**
 * One-time follow-up nudge for join requests that have sat unanswered.
 *
 * A real person is waiting on the other end, so 48 hours after a request comes
 * in the same people who got the original alert (owner + co-hosts) get a single
 * reminder. `reminded_at` makes it exactly one: a host deliberately sitting on a
 * decision is never nagged again.
 */
export const Route = createFileRoute("/api/public/hooks/join-request-reminders")({
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
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await admin
          .from("event_guest_requests")
          .select("id, event_id, name, contact, note, party_size, created_at")
          .eq("status", "pending")
          .is("reminded_at", null)
          .lt("created_at", cutoff)
          .order("created_at", { ascending: true })
          .limit(200);
        if (error) return Response.json({ error: "Query failed" }, { status: 500 });

        const { notifyHostsOfJoinRequest } = await import("@/lib/host-notify.server");
        const { committedHeadcount } = await import("@/lib/events-store");
        const origin = new URL(request.url).origin;

        let reminded = 0;
        let skipped = 0;

        for (const row of rows ?? []) {
          const { data: ev } = await admin
            .from("events")
            .select("id, data, archived_at, is_demo")
            .eq("id", row.event_id as string)
            .maybeSingle();
          const stamp = async () =>
            admin
              .from("event_guest_requests")
              .update({ reminded_at: new Date().toISOString() })
              .eq("id", row.id as string);

          if (!ev || (ev as any).archived_at || (ev as any).is_demo) {
            skipped += 1;
            await stamp();
            continue;
          }
          const eventData = (((ev as any).data) || {}) as Record<string, any>;
          // A request for an event that already happened has nothing left to answer.
          const when = Date.parse(String(eventData.date ?? ""));
          if (Number.isFinite(when) && when < Date.now() - 24 * 60 * 60 * 1000) {
            skipped += 1;
            await stamp();
            continue;
          }

          try {
            await notifyHostsOfJoinRequest(admin, {
              requestId: row.id as string,
              eventId: row.event_id as string,
              eventData,
              guestName: row.name as string,
              contact: row.contact as string,
              note: (row.note as string | null) ?? null,
              partySize: Number(row.party_size ?? 1),
              origin,
              reminder: true,
              committed: committedHeadcount(eventData as any),
            });
            reminded += 1;
          } catch (err) {
            console.error("join-request reminder failed", err);
          }
          await stamp();
        }

        return Response.json({ ok: true, reminded, skipped, scanned: (rows ?? []).length });
      },
    },
  },
});
