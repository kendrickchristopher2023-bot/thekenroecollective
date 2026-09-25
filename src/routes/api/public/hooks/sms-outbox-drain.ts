import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { canonicalPhone, phoneKeys } from "@/lib/phone-keys";

/**
 * SMS outbox drain worker.
 *
 * - Reads pending sms_outbox rows (oldest first, batch of 50).
 * - Sends each via Twilio Messages API using TWILIO_MESSAGING_SERVICE_SID
 *   (preferred) or TWILIO_PHONE_NUMBER.
 * - Marks rows sent (with provider_sid) or failed (with error).
 * - Uses a pending -> sending -> sent/failed transition for idempotency:
 *   only rows currently 'pending' are claimed and flipped to 'sending' with
 *   a conditional UPDATE before we call Twilio, so concurrent runs cannot
 *   double-send the same row.
 * - Final opt-out guard against sms_consent_log; blocked rows are marked
 *   failed with error='opted_out'.
 * - If Twilio secrets are missing, returns { ok: true, skipped: 'unconfigured' }
 *   without touching rows.
 *
 * Auth: Supabase anon/publishable key in the `apikey` header (pg_cron
 * sends this).
 */
export const Route = createFileRoute("/api/public/hooks/sms-outbox-drain")({
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

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;
        if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) {
          return Response.json({
            ok: true,
            skipped: "unconfigured",
            has: {
              accountSid: !!accountSid,
              authToken: !!authToken,
              messagingServiceSid: !!messagingServiceSid,
              fromNumber: !!fromNumber,
            },
          });
        }

        const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

        const { data: pendingAll, error: readErr } = await admin
          .from("sms_outbox")
          .select("id,to_phone,body,event_id,user_id")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(50);
        if (readErr) {
          return Response.json({ error: readErr.message }, { status: 500 });
        }
        if (!pendingAll || pendingAll.length === 0) {
          return Response.json({ ok: true, drained: 0 });
        }

        // Demo and showcase rows never reach Twilio, whichever path queued
        // them. They are parked as `skipped_demo` so they are not re-read.
        const { skipDemoOutboxRows } = await import("@/lib/demo-jobs.server");
        type OutboxRow = { id: string; to_phone: string; body: string; event_id: string | null; user_id: string | null };
        const pending = await skipDemoOutboxRows(admin, pendingAll as unknown as OutboxRow[]);
        if (pending.length === 0) {
          return Response.json({ ok: true, drained: 0, skippedDemo: pendingAll.length });
        }

        // Opt-outs are stored in more than one digit form for the same number,
        // so match on every variant and compare on the canonical one.
        const normalize = (raw: string) => canonicalPhone(raw);
        const phones = Array.from(
          new Set(pending.flatMap((r) => phoneKeys(r.to_phone as string))),
        );
        const { data: optRows } = await admin
          .from("sms_consent_log")
          .select("phone_number, opted_out")
          .in("phone_number", phones);
        const optedOut = new Set(
          (optRows ?? [])
            .filter((r) => (r as any).opted_out)
            .map((r) => canonicalPhone((r as any).phone_number as string)),
        );

        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const auth = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

        // Absolute status callback URL — derived from the incoming request so
        // it points at whichever host Twilio can reach (preview vs production).
        // Fixed, public https address. Built from the incoming request before,
        // which gave Twilio an address that did not match what the webhook
        // later checked the signature against, so every callback was refused.
        const statusCallbackUrl =
          "https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/sms-status-webhook";

        let sent = 0;
        let failed = 0;
        let blocked = 0;
        const eventsMarkedForMaterialUse = new Set<string>();

        for (const row of pending) {
          const id = row.id as string;
          const to = row.to_phone as string;
          const body = row.body as string;
          const eventId = (row as any).event_id as string | null;

          // Claim: pending -> sending (only if still pending).
          const { data: claimed, error: claimErr } = await admin
            .from("sms_outbox")
            .update({ status: "sending" })
            .eq("id", id)
            .eq("status", "pending")
            .select("id")
            .maybeSingle();
          if (claimErr || !claimed) continue;

          // Final opt-out guard.
          if (optedOut.has(normalize(to))) {
            blocked += 1;
            await admin
              .from("sms_outbox")
              .update({ status: "failed", error: "opted_out" })
              .eq("id", id);
            continue;
          }

          try {
            const params = new URLSearchParams({ To: to, Body: body });
            if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
            else if (fromNumber) params.set("From", fromNumber);
            params.set("StatusCallback", statusCallbackUrl);

            const res = await fetch(twilioUrl, {
              method: "POST",
              headers: {
                Authorization: auth,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: params.toString(),
            });
            const payload = (await res.json().catch(() => ({}))) as {
              sid?: string;
              message?: string;
              code?: number;
            };

            if (!res.ok) {
              failed += 1;
              await admin
                .from("sms_outbox")
                .update({
                  status: "failed",
                  error: `twilio_${res.status}: ${payload.message ?? "send failed"}`.slice(0, 500),
                })
                .eq("id", id);
              continue;
            }

            sent += 1;
            await admin
              .from("sms_outbox")
              .update({
                status: "sent",
                provider: "twilio",
                provider_sid: payload.sid ?? null,
                sent_at: new Date().toISOString(),
                error: null,
              })
              .eq("id", id);

            // First successful SMS for this event → stamp material-use so the
            // refund engine treats the pass as consumed. Non-blocking.
            if (eventId && !eventsMarkedForMaterialUse.has(eventId)) {
              eventsMarkedForMaterialUse.add(eventId);
              try {
                await admin.rpc("mark_pass_material_use_by_event", {
                  _event_id: eventId,
                  _reason: "sms_sent",
                });
              } catch {
                // ignore — never fail the send on material-use bookkeeping
              }
            }
          } catch (err: any) {
            failed += 1;
            await admin
              .from("sms_outbox")
              .update({ status: "failed", error: String(err?.message ?? err).slice(0, 500) })
              .eq("id", id);
          }
        }

        return Response.json({ ok: true, drained: pending.length, sent, failed, blocked });
      },
    },
  },
});
