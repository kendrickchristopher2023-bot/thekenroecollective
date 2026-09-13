import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { validateTwilioFormSignature } from "@/lib/twilio-signature.server";

/**
 * Twilio message status callback.
 *
 * Twilio POSTs delivery status updates (queued/sent/delivered/undelivered/
 * failed) to this endpoint whenever a message state changes. Signed with
 * TWILIO_AUTH_TOKEN via X-Twilio-Signature; unsigned/invalid requests are
 * rejected with 403.
 *
 * We match the update to a row in sms_outbox by provider_sid (MessageSid)
 * and persist delivered / undelivered / failed with any Twilio ErrorCode.
 * Terminal 'sent' from the drain worker stays as 'sent' until Twilio
 * upgrades it to 'delivered' (or downgrades to 'undelivered'/'failed').
 */

const TERMINAL_STATUSES = new Set(["delivered", "undelivered", "failed", "sent"]);

export const Route = createFileRoute("/api/public/hooks/sms-status-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!url || !serviceKey) {
          return Response.json({ error: "Server not configured" }, { status: 500 });
        }
        if (!authToken) {
          return Response.json({ error: "Twilio not configured" }, { status: 503 });
        }

        const rawBody = await request.text();
        const params = new URLSearchParams(rawBody);
        const ok = validateTwilioFormSignature({
          authToken,
          signatureHeader: request.headers.get("x-twilio-signature"),
          url: request.url,
          params,
        });
        if (!ok) {
          return new Response("Invalid signature", { status: 403 });
        }

        const messageSid = params.get("MessageSid") ?? params.get("SmsSid") ?? "";
        const messageStatus = (params.get("MessageStatus") ?? params.get("SmsStatus") ?? "").toLowerCase();
        const errorCode = params.get("ErrorCode") ?? "";
        const errorMessage = params.get("ErrorMessage") ?? "";

        if (!messageSid || !messageStatus) {
          return Response.json({ ok: true, ignored: "missing_fields" });
        }
        if (!TERMINAL_STATUSES.has(messageStatus) && messageStatus !== "sending" && messageStatus !== "queued") {
          return Response.json({ ok: true, ignored: "non_terminal", messageStatus });
        }

        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Map Twilio status → our sms_outbox.status vocabulary.
        // sent/delivered → 'sent' (kept as success). Row also gets a delivered_at when delivered.
        // undelivered/failed → 'failed' with the Twilio error code.
        const isFailure = messageStatus === "undelivered" || messageStatus === "failed";
        const update: Record<string, unknown> = {};
        if (isFailure) {
          update.status = "failed";
          update.error = `twilio_${messageStatus}${errorCode ? `_${errorCode}` : ""}${
            errorMessage ? `: ${errorMessage}` : ""
          }`.slice(0, 500);
        } else if (messageStatus === "delivered") {
          update.status = "sent";
          update.error = null;
        } else {
          // 'sent', 'queued', 'sending' — leave row as-is if it's already sent.
          return Response.json({ ok: true, ignored: "in_flight", messageStatus });
        }

        const { error } = await admin
          .from("sms_outbox")
          .update(update)
          .eq("provider_sid", messageSid);
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        return Response.json({ ok: true, messageSid, messageStatus });
      },
    },
  },
});
