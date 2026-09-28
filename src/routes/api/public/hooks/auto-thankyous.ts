import * as React from "react";
import { render } from "@react-email/components";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { sendManagedEmail } from "@/lib/email/managed-send.server";



/**
 * Cron-triggered (and owner-callable) worker that auto-sends thank-you cards
 * for events whose date has passed by the card's `autoSendAfterHours` window
 * (default 48h). One card per event per fire — once `autoSentAt` is set on a
 * card, it's never re-sent.
 *
 * Auth: requires Supabase anon key in the `apikey` header (cron uses this).
 * No PII returned; safe for `/api/public/*`.
 */
export const Route = createFileRoute("/api/public/hooks/auto-thankyous")({
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
        const template = TEMPLATES["thank-you-card"];
        if (!template) {
          return Response.json({ error: "Template missing" }, { status: 500 });
        }

        const now = Date.now();
        // Scan events touched in the last 180 days so a card scheduled far ahead
        // on a quiet event still fires. Bounded by the row limit below.
        const sinceIso = new Date(now - 180 * 24 * 60 * 60 * 1000).toISOString();

        const { data: events, error: evErr } = await admin
          .from("events")
          .select("id, user_id, data, archived_at")
          .eq("is_demo", false)
          .neq("id", "showcase-wedding")
          .is("archived_at", null)
          .gte("updated_at", sinceIso)
          .limit(500);
        if (evErr) {
          console.error("auto-thankyous: events query failed", evErr);
          return Response.json({ error: "Query failed" }, { status: 500 });
        }

        let eventsProcessed = 0;
        let cardsFired = 0;
        let emailsQueued = 0;
        let emailsSuppressed = 0;
        let failures = 0;
        let cardsHeld = 0;

        for (const ev of events ?? []) {
          const { accountAddonAccess } = await import("@/lib/addon-access.server");
          if (!(await accountAddonAccess(admin, ev.user_id, "thank_you_cards"))) continue;
          const data = (ev.data as Record<string, any>) || {};
          const cards: any[] = Array.isArray(data.thankYouCards) ? data.thankYouCards : [];
          if (!cards.length) continue;

          const dateStr = data.date as string | undefined;
          const eventTime = dateStr ? Date.parse(dateStr) : NaN;

          let mutated = false;
          for (const card of cards) {
            if (!card || card.autoSentAt || card.sentAt) continue;
            // Scheduling IS the instruction to send. An absolute `scheduledFor`
            // wins; otherwise fall back to the "N hours after the event" window.
            // `autoSend` is still honoured for cards created before this change.
            let fireAt: number | null = null;
            const scheduledAt = card.scheduledFor ? Date.parse(card.scheduledFor) : NaN;
            if (Number.isFinite(scheduledAt)) {
              fireAt = scheduledAt;
            } else if (
              (card.autoSend || card.autoSendAfterHours != null) &&
              Number.isFinite(eventTime)
            ) {
              fireAt = eventTime + Number(card.autoSendAfterHours ?? 48) * 60 * 60 * 1000;
            }
            if (fireAt === null || now < fireAt) continue;
            if (card.channel && card.channel !== "email") continue;

            // An automated sender must never deliver copy the host did not write.
            // If the card was armed while still carrying our suggested template
            // (or with an empty message), hold it and tell the host instead.
            const messageText = typeof card.message === "string" ? card.message.trim() : "";
            if (card.hostAuthored === false || !messageText) {
              if (!card.heldAt) {
                card.heldAt = new Date().toISOString();
                card.heldReason = "not_host_authored";
                mutated = true;
                cardsHeld += 1;
                const { data: ownerRow } = await admin
                  .from("events")
                  .select("user_id")
                  .eq("id", ev.id)
                  .maybeSingle();
                if (ownerRow?.user_id) {
                  await admin.from("host_notifications").insert({
                    user_id: ownerRow.user_id,
                    event_id: ev.id,
                    kind: "thank_you_held",
                    title: "Thank-you card held, not sent",
                    body: "Your scheduled thank-you card still had our suggested wording, so we held it rather than send something generic in your name. Add your own message and sign-off, then schedule it again.",
                    link: `/events/${ev.id}`,
                  });
                }
              }
              continue;
            }

            // Recipients: yes guests with an email, intersected with the card's selection.
            const guestList: any[] = Array.isArray(data.guests) ? data.guests : [];
            const selectedIds: string[] = Array.isArray(card.recipientIds) ? card.recipientIds : [];
            const yesEmailed = guestList.filter(
              (g) =>
                g?.status === "yes" &&
                typeof g?.email === "string" &&
                g.email.includes("@") &&
                (selectedIds.length === 0 || selectedIds.includes(g.id)),
            );
            if (!yesEmailed.length) {
              card.autoSentAt = new Date().toISOString();
              mutated = true;
              cardsFired += 1;
              continue;
            }

            eventsProcessed += 1;
            cardsFired += 1;

            for (const g of yesEmailed) {
              const recipient = (g.email as string).toLowerCase();

              const messageId = crypto.randomUUID();
              const templateData = {
                eventTitle: data.title || "our celebration",
                message: card.message,
                signOff: card.signOff || "",
                gif: card.gif,
                photo: card.photo,
                pieceUrl: card.pieceUrl,
                pieceTitle: card.pieceTitle,
                pieceKind: card.pieceKind,
                recipientName: g.name,
              };
              const html = await render(
                React.createElement(template.component as React.ComponentType<any>, templateData),
              );
              const plain = await render(
                React.createElement(template.component as React.ComponentType<any>, templateData),
                { plainText: true },
              );
              const subject =
                typeof template.subject === "function"
                  ? template.subject(templateData)
                  : template.subject;

              const result = await sendManagedEmail({
                to: recipient,
                subject,
                html,
                text: plain,
                label: "thank-you-card",
                idempotencyKey: `auto-thanks-${ev.id}-${card.id}-${g.id}`,
                messageId,
              });

              async function logSend(status: "sent" | "suppressed" | "failed", errorMessage?: string) {
                const { error } = await admin.from("email_send_log").insert({
                  message_id: messageId,
                  template_name: "thank-you-card",
                  recipient_email: recipient,
                  status,
                  ...(errorMessage ? { error_message: errorMessage.slice(0, 1000) } : {}),
                });
                if (error) console.error("email_send_log insert failed", { code: error.code });
              }

              if (result.ok) {
                emailsQueued += 1;
                await logSend("sent");
              } else if (result.reason === "suppressed") {
                emailsSuppressed += 1;
                await logSend("suppressed");
              } else {
                failures += 1;
                await logSend("failed", result.error ?? result.reason);
              }
            }


            card.autoSentAt = new Date().toISOString();
            mutated = true;
          }

          if (mutated) {
            await admin.from("events").update({ data }).eq("id", ev.id);
          }
        }

        return Response.json({
          ok: true,
          scanned: (events ?? []).length,
          eventsProcessed,
          cardsFired,
          cardsHeld,
          emailsQueued,
          emailsSuppressed,
          failures,
        });
      },
    },
  },
});
