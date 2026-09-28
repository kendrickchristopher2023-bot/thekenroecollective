import * as React from "react";
import { render } from "@react-email/components";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { isDaytimeInZone } from "@/lib/reminder-window";
import { sendManagedEmail } from "@/lib/email/managed-send.server";
import { attendanceFare } from "@/lib/party-fare";

/** Own counters and caps so payment nudges never collide with RSVP nudges. */
const MAX_SENDS = 3;
const MIN_GAP_MS = 72 * 60 * 60 * 1000;


function money(n: number) {
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

/** Net money on file for a guest, honouring the append-only history. */
function netPaid(g: any): number {
  const hist = Array.isArray(g?.payment?.history) ? g.payment.history : [];
  if (hist.length) return hist.reduce((s: number, h: any) => s + Number(h?.amount ?? 0), 0);
  const legacy = Number(g?.payment?.paidAmount ?? NaN);
  if (Number.isFinite(legacy)) return Math.max(0, legacy);
  return 0;
}

/**
 * Per-party amount owed. Uses the shared fare contract so a nudge quotes the
 * same number the invite page and the host report show (kids at the child rate,
 * named plus-ones billed as adults).
 */
function owedAmount(data: any, g: any): number {
  return attendanceFare(data, g);
}

/**
 * Cron-triggered payment nudge worker. Targets guests who answered "yes"
 * (and "maybe" guests who opted in) with an open balance, stops on
 * paid/refunded/canceled, caps at 3 sends per guest with 72h minimum spacing.
 * Idempotent via guest.payment.remindersSent + lastReminderAt.
 */
export const Route = createFileRoute("/api/public/hooks/payment-reminders")({
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
        const template = TEMPLATES["payment-reminder"];
        if (!template) {
          return Response.json({ error: "Template missing" }, { status: 500 });
        }

        const now = Date.now();
        const { data: events, error: evErr } = await admin
          .from("events")
          .select("id, data, archived_at")
          .eq("is_demo", false)
          .neq("id", "showcase-wedding")
          .is("archived_at", null)
          .gte("updated_at", new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString())
          .limit(500);
        if (evErr) {
          return Response.json({ error: "Query failed" }, { status: 500 });
        }

        let eventsProcessed = 0;
        let emailsQueued = 0;
        let emailsSuppressed = 0;
        let failures = 0;

        for (const ev of events ?? []) {
          const data = (ev.data as Record<string, any>) || {};
          if (!data.paymentEnabled) continue;
          const guestList: any[] = Array.isArray(data.guests) ? data.guests : [];
          if (!guestList.length) continue;
          if (!isDaytimeInZone(data.timezone as string | undefined)) continue;

          let mutated = false;
          eventsProcessed += 1;

          for (const g of guestList) {
            if (!g) continue;
            const p = g.payment;
            if (!p || p.status === "not_sent") continue;
            if (p.status === "paid" || p.status === "refunded" || p.status === "canceled") continue;
            // "yes" guests always, "maybe" guests only when they opted in.
            if (g.status !== "yes" && !(g.status === "maybe" && p.remindersOptIn)) continue;

            const owed = owedAmount(data, g);
            if (owed <= 0) continue;
            const paid = netPaid(g);
            if (paid >= owed) continue;

            const sentCount = Number(p.remindersSent ?? 0);
            if (sentCount >= MAX_SENDS) continue;
            const last = p.lastReminderAt ? Date.parse(p.lastReminderAt) : NaN;
            if (Number.isFinite(last) && now - last < MIN_GAP_MS) continue;

            const email = typeof g.email === "string" ? g.email.trim().toLowerCase() : "";
            if (!email.includes("@")) continue;

            const locale = (g.preferredLanguage as string) === "es" ? "es" : "en";
            const templateData = {
              guestName: g.name || "there",
              hostName: (data.hosts?.[0]?.name as string) || "",
              eventTitle: data.title || "your event",
              amountDue: money(owed - paid),
              amountPaid: paid > 0 ? money(paid) : "",
              purpose: (data.paymentPurpose as string) || "",
              payUrl: (p.link as string) || (data.paymentLink as string) || `https://thekenroecollective.com/invite/${ev.id}`,
              locale,
            };
            const html = await render(
              React.createElement(template.component as React.ComponentType<any>, templateData),
            );
            const plain = await render(
              React.createElement(template.component as React.ComponentType<any>, templateData),
              { plainText: true },
            );
            const subject =
              typeof template.subject === "function" ? template.subject(templateData) : template.subject;

            const messageId = crypto.randomUUID();
            const result = await sendManagedEmail({
              to: email,
              subject,
              html,
              text: plain,
              label: "payment-reminder",
              idempotencyKey: `payment-reminder-${ev.id}-${g.id}-${sentCount + 1}`,
              messageId,
            });

            const logSend = async (status: "sent" | "suppressed" | "failed", errorMessage?: string) => {
              const { error } = await admin.from("email_send_log").insert({
                message_id: messageId,
                template_name: "payment-reminder",
                recipient_email: email,
                status,
                ...(errorMessage ? { error_message: errorMessage.slice(0, 1000) } : {}),
              });
              if (error) console.error("email_send_log insert failed", { code: error.code });
            };

            if (!result.ok) {
              if (result.reason === "suppressed") {
                emailsSuppressed += 1;
                await logSend("suppressed");
              } else {
                failures += 1;
                await logSend("failed", result.error ?? result.reason);
              }
              continue;
            }

            await logSend("sent");
            emailsQueued += 1;
            g.payment = {
              ...p,
              remindersSent: sentCount + 1,
              lastReminderAt: new Date().toISOString(),
            };
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
          emailsQueued,
          emailsSuppressed,
          failures,
        });
      },
    },
  },
});
