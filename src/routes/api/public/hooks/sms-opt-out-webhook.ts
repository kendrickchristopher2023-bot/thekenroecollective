import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { validateTwilioFormSignature } from "@/lib/twilio-signature.server";

/**
 * Inbound SMS webhook for STOP / START / HELP handling (TCPA compliance).
 *
 * Twilio POSTs application/x-www-form-urlencoded with `From` and `Body`.
 * Requests are authenticated via the X-Twilio-Signature header signed with
 * TWILIO_AUTH_TOKEN — invalid signatures are rejected with 403.
 *
 * Twilio itself also honors STOP automatically on managed numbers; this
 * endpoint keeps the app's own consent state in sync and covers HELP.
 */

const HELP_MESSAGE =
  "The Kenroe Collective event reminders. Msg&data rates may apply. Reply STOP to opt out. Contact: support@thekenroecollective.com";

function twiml(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</Message></Response>`;
  return new Response(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function emptyTwiml(): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/hooks/sms-opt-out-webhook")({
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
          // Refuse to process unsigned webhooks in production — this is the
          // consent audit trail. Return 503 so Twilio retries once secrets land.
          return Response.json({ error: "Twilio not configured" }, { status: 503 });
        }

        // Twilio always POSTs form-encoded; validate on the raw body.
        const rawBody = await request.text();
        const params = new URLSearchParams(rawBody);
        const signatureHeader = request.headers.get("x-twilio-signature");
        // Twilio signs the exact public address it called (the messaging
        // service's inbound URL). Behind the hosting edge request.url can
        // differ, so the signature is checked against each known address.
        const candidates = new Set<string>([request.url]);
        try {
          const u = new URL(request.url);
          const fwdHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
          candidates.add(`https://${fwdHost || u.host}${u.pathname}${u.search}`);
        } catch { /* ignore */ }
        candidates.add("https://thekenroecollective.com/api/public/hooks/sms-opt-out-webhook");
        candidates.add("https://project--c5d156bb-c400-47bc-93a7-1a8a2490a6ed.lovable.app/api/public/hooks/sms-opt-out-webhook");
        const ok = [...candidates].some((u) => validateTwilioFormSignature({ authToken, signatureHeader, url: u, params }));
        if (!ok) {
          return new Response("Invalid signature", { status: 403 });
        }

        const from = params.get("From") ?? params.get("from") ?? "";
        const body = params.get("Body") ?? params.get("body") ?? "";

        const normalized = from.replace(/\D/g, "");
        const cleaned = body.trim().toLowerCase();
        if (!normalized || normalized.length < 7) return emptyTwiml();

        const admin = createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        if (
          cleaned === "stop" ||
          cleaned === "stopall" ||
          cleaned === "unsubscribe" ||
          cleaned === "cancel" ||
          cleaned === "end" ||
          cleaned === "quit"
        ) {
          await admin.rpc("sms_mark_opt_out", { _phone: normalized });
          // Twilio blocklists the sender the moment it sees STOP, so any reply we
          // return here fails with error 21610. Twilio's own Advanced Opt-Out
          // confirmation delivers the unsubscribe acknowledgement instead; we only
          // keep our consent state in sync.
          return emptyTwiml();
        }

        // Opt-in and help keywords come right after STOP, unchanged. "yes" is
        // not here: it is an answer first, and only re-subscribes further down.
        if (cleaned === "start" || cleaned === "unstop") {
          await admin.rpc("sms_mark_opt_in", { _phone: normalized });
          return twiml(
            "The Kenroe Collective: You are re-subscribed to event reminders. Msg & data rates may apply. For help, reply HELP. To opt-out, reply STOP.",
          );
        }
        if (cleaned === "help" || cleaned === "info") {
          return twiml(HELP_MESSAGE);
        }

        // Answers. Schedules first decides whether the reply belongs to a
        // schedule or an event (most recent text wins, ambiguous gets a link).
        // Its confirmation goes out through the outbox, so the TwiML is empty.
        {
          const { parseReplyAnswer } = await import("@/lib/schedule-messages");
          const { parseSmsAnswer, recordSmsRsvp } = await import("@/lib/sms-rsvp.server");
          const schedAnswer = parseReplyAnswer(body);
          let eventKnown: import("@/lib/sms-rsvp.server").EventCandidate | null | undefined;
          if (schedAnswer) {
            try {
              const { handleScheduleReply } = await import("@/lib/schedule-sms-reply.server");
              const out = await handleScheduleReply(admin as any, from, schedAnswer);
              if (out.route !== "event") {
                if (schedAnswer === "yes") await admin.rpc("sms_mark_opt_in", { _phone: normalized });
                return emptyTwiml();
              }
              eventKnown = out.event;
            } catch (e) {
              console.error("schedule sms reply failed", e);
            }
          }
          const answer = parseSmsAnswer(body);
          if (answer) {
            try {
              const rsvp = await recordSmsRsvp(admin, from, answer, eventKnown);
              if (rsvp.matched && rsvp.reply) {
                if (answer === "yes") await admin.rpc("sms_mark_opt_in", { _phone: normalized });
                return twiml(rsvp.reply);
              }
            } catch (e) {
              console.error("sms rsvp reply failed", e);
            }
          }
        }

        if (cleaned === "yes") {
          await admin.rpc("sms_mark_opt_in", { _phone: normalized });
          return twiml(
            "The Kenroe Collective: You are re-subscribed to event reminders. Msg & data rates may apply. For help, reply HELP. To opt-out, reply STOP.",
          );
        }

        // Any other inbound reply is a real person messaging Christopher.
        // Owner alert, email only, non-fatal.
        try {
          const { sendOwnerAlert } = await import("@/lib/owner-alerts.server");
          await sendOwnerAlert({
            kind: "inbound_sms",
            dedupeKey: `inbound-sms:${params.get("MessageSid") ?? `${normalized}:${Date.now()}`}`,
            title: `New text message from ${from}`,
            lines: [`From: ${from}`, body],
            link: "/owner",
          });
        } catch (e) {
          console.error("inbound SMS owner alert failed", e);
        }

        return emptyTwiml();
      },
    },
  },
});
