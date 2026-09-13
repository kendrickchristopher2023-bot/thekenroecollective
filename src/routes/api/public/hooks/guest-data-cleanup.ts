// Weekly guest-data cleanup.
// - Job 1: anonymize guest PII on events whose access window expired
//          (event date + 90 days AND no active/trialing subscription for the host).
// - Job 2: process guest_privacy_requests marked 'deletion_requested' older than
//          48 hours — anonymize matching guests across all events, email guest
//          and host, mark 'completed'.
//
// Idempotent: already-anonymized guests are detected by name === 'Deleted Guest'.
// /api/public/* bypasses auth on the published site, so we guard with the
// Supabase publishable apikey header (schedule-jobs-modern pattern).
import { createFileRoute } from "@tanstack/react-router";

const ANONYMIZED_NAME = "Deleted Guest";
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function anonymizeGuest(guest: unknown): { changed: boolean; guest: Record<string, unknown> } {
  if (!guest || typeof guest !== "object") return { changed: false, guest: guest as any };
  const g = { ...(guest as Record<string, unknown>) };
  if (g.name === ANONYMIZED_NAME && g.email == null && g.phone == null && g.address == null) {
    return { changed: false, guest: g };
  }
  g.name = ANONYMIZED_NAME;
  g.email = null;
  g.phone = null;
  g.address = null;
  g.mailingAddress = null;
  return { changed: true, guest: g };
}

export const Route = createFileRoute("/api/public/hooks/guest-data-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { enqueueTransactionalEmailServer } = await import(
          "@/lib/email/server-enqueue.server"
        );

        const errors: { where: string; message: string }[] = [];
        let autoExpiredEvents = 0;
        let autoExpiredGuests = 0;
        let deletionRequestsProcessed = 0;

        // ------------------------------------------------------------------
        // JOB 1: auto-expire
        // ------------------------------------------------------------------
        try {
          // Pull a bounded page of non-archived events; filter in JS since event
          // date lives in jsonb data. This is fine for weekly cadence.
          const { data: events, error } = await supabaseAdmin
            .from("events")
            .select("id, user_id, data")
            .eq("is_demo", false)
            .neq("id", "showcase-wedding")
            .is("archived_at", null)
            .limit(1000);
          if (error) throw error;

          const now = Date.now();
          // Cache host subscription status to avoid duplicate queries.
          const hostActive = new Map<string, boolean>();

          for (const ev of events ?? []) {
            try {
              const data = (ev as any).data as Record<string, unknown> | null;
              if (!data || !Array.isArray((data as any).guests)) continue;
              const dateStr = typeof (data as any).date === "string" ? (data as any).date : null;
              if (!dateStr) continue;
              const eventTs = Date.parse(dateStr);
              if (!Number.isFinite(eventTs)) continue;
              if (eventTs + NINETY_DAYS_MS > now) continue;

              // Check host still has an active/trialing subscription that extends
              // the window (per spec: expire = date+90d OR sub end, whichever later).
              const hostId = (ev as any).user_id as string | null;
              if (hostId) {
                if (!hostActive.has(hostId)) {
                  const { data: subs } = await supabaseAdmin
                    .from("subscriptions")
                    .select("status, current_period_end")
                    .eq("user_id", hostId)
                    .in("status", ["active", "trialing"]);
                  const active = (subs ?? []).some((s: any) => {
                    if (!s.current_period_end) return true;
                    return Date.parse(s.current_period_end) > now;
                  });
                  hostActive.set(hostId, active);
                }
                if (hostActive.get(hostId)) continue;
              }

              const guests = (data as any).guests as unknown[];
              let changedCount = 0;
              const newGuests = guests.map((g) => {
                const r = anonymizeGuest(g);
                if (r.changed) changedCount += 1;
                return r.guest;
              });
              if (changedCount === 0) continue;

              const newData = { ...data, guests: newGuests };
              const { error: upErr } = await supabaseAdmin
                .from("events")
                .update({ data: newData } as any)
                .eq("id", (ev as any).id);
              if (upErr) throw upErr;

              await supabaseAdmin.from("data_cleanup_log").insert({
                event_id: (ev as any).id,
                guests_anonymized: changedCount,
                cleanup_type: "auto_expire",
              } as any);

              autoExpiredEvents += 1;
              autoExpiredGuests += changedCount;
            } catch (e) {
              errors.push({
                where: `auto_expire:${(ev as any).id}`,
                message: (e instanceof Error ? e.message : String(e)),
              });
            }
          }
        } catch (e) {
          errors.push({
            where: "auto_expire:list",
            message: (e instanceof Error ? e.message : String(e)),
          });
        }

        // ------------------------------------------------------------------
        // JOB 2: process deletion requests
        // ------------------------------------------------------------------
        try {
          const cutoff = new Date(Date.now() - FORTY_EIGHT_HOURS_MS).toISOString();
          const { data: requests, error } = await supabaseAdmin
            .from("guest_privacy_requests")
            .select("id, email, created_at, status")
            .eq("status", "deletion_requested")
            .lt("created_at", cutoff)
            .limit(200);
          if (error) throw error;

          for (const req of requests ?? []) {
            try {
              const targetEmail = String((req as any).email ?? "").trim().toLowerCase();
              if (!targetEmail) continue;

              const { data: events, error: evErr } = await supabaseAdmin
                .from("events")
                .select("id, user_id, data")
                .limit(5000);
              if (evErr) throw evErr;

              const affectedHosts: { hostId: string; eventName: string }[] = [];

              for (const ev of events ?? []) {
                const data = (ev as any).data as Record<string, unknown> | null;
                if (!data || !Array.isArray((data as any).guests)) continue;
                const guests = (data as any).guests as unknown[];
                let changed = 0;
                const newGuests = guests.map((g) => {
                  if (!g || typeof g !== "object") return g;
                  const email = String((g as any).email ?? "").trim().toLowerCase();
                  if (!email || email !== targetEmail) return g;
                  const r = anonymizeGuest(g);
                  if (r.changed) changed += 1;
                  return r.guest;
                });
                if (changed === 0) continue;

                const newData = { ...data, guests: newGuests };
                const { error: upErr } = await supabaseAdmin
                  .from("events")
                  .update({ data: newData } as any)
                  .eq("id", (ev as any).id);
                if (upErr) throw upErr;

                await supabaseAdmin.from("data_cleanup_log").insert({
                  event_id: (ev as any).id,
                  guests_anonymized: changed,
                  cleanup_type: "deletion_request",
                } as any);

                const hostId = (ev as any).user_id as string | null;
                const eventName =
                  (typeof (data as any).name === "string" && (data as any).name) ||
                  (typeof (data as any).title === "string" && (data as any).title) ||
                  "your event";
                if (hostId) affectedHosts.push({ hostId, eventName });
              }

              // Notify the guest.
              await enqueueTransactionalEmailServer({
                templateName: "guest-privacy-deleted",
                recipientEmail: targetEmail,
                idempotencyKey: `guest-priv-del-${(req as any).id}`,
                templateData: {},
              });

              // Notify affected hosts (dedup by host+event).
              const seen = new Set<string>();
              for (const h of affectedHosts) {
                const key = `${h.hostId}::${h.eventName}`;
                if (seen.has(key)) continue;
                seen.add(key);
                try {
                  const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(h.hostId);
                  const hostEmail = userRes?.user?.email;
                  if (!hostEmail) continue;
                  await enqueueTransactionalEmailServer({
                    templateName: "guest-privacy-host-notice",
                    recipientEmail: hostEmail,
                    idempotencyKey: `guest-priv-host-${(req as any).id}-${key}`,
                    templateData: { eventName: h.eventName },
                  });
                } catch (e) {
                  errors.push({
                    where: `deletion_request:notify:${(req as any).id}`,
                    message: (e instanceof Error ? e.message : String(e)),
                  });
                }
              }

              await supabaseAdmin
                .from("guest_privacy_requests")
                .update({ status: "completed" } as any)
                .eq("id", (req as any).id);

              deletionRequestsProcessed += 1;
            } catch (e) {
              errors.push({
                where: `deletion_request:${(req as any).id}`,
                message: (e instanceof Error ? e.message : String(e)),
              });
            }
          }
        } catch (e) {
          errors.push({
            where: "deletion_request:list",
            message: (e instanceof Error ? e.message : String(e)),
          });
        }

        return Response.json({
          ok: true,
          auto_expired_events: autoExpiredEvents,
          auto_expired_guests: autoExpiredGuests,
          deletion_requests_processed: deletionRequestsProcessed,
          errors,
        });
      },
    },
  },
});
