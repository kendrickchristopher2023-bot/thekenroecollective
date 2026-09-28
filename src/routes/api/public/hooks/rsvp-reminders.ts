import * as React from "react";
import { render } from "@react-email/components";
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { isDaytimeInZone, localHourInZone, reminderTimeZone } from "@/lib/reminder-window";
import { REMINDER_SEND_HOUR } from "@/lib/reminder-schedule";
import { describePlan, describeSkipped, planWaitlistPromotions } from "@/lib/waitlist";


import { sendManagedEmail } from "@/lib/email/managed-send.server";
import { buildSenderName } from "@/lib/email/sender-name";
import { formatDateOnlyLong } from "@/lib/date-only";
import { personalInviteUrl, oneTapRsvpUrls } from "@/lib/invite-links";
const DEFAULT_OFFSETS = [14, 7, 2];


/**
 * Cron-triggered auto-nudge worker for RSVP reminders.
 * Scans events with an rsvpDeadline, and for each pending guest with an email,
 * sends up to N reminders — one per configured offset day threshold — in the
 * guest's preferred language. Idempotent: guest.reminderCount tracks progress.
 *
 * Auth: Supabase anon key in the `apikey` header (cron sends this).
 */
export const Route = createFileRoute("/api/public/hooks/rsvp-reminders")({
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
        const template = TEMPLATES["rsvp-reminder"];
        if (!template) {
          return Response.json({ error: "Template missing" }, { status: 500 });
        }

        const now = Date.now();
        const oneDayAgoIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();

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
          const deadlineStr = data.rsvpDeadline as string | undefined;
          if (!deadlineStr) continue;
          const deadline = Date.parse(deadlineStr);
          if (!Number.isFinite(deadline)) continue;
          // Skip events whose deadline passed > 1 day ago (final chase already had its chance).
          if (deadline < Date.parse(oneDayAgoIso)) continue;

          const guestList: any[] = Array.isArray(data.guests) ? data.guests : [];
          if (!guestList.length) continue;

          const offsets = (Array.isArray(data.rsvpReminderOffsetDays) && data.rsvpReminderOffsetDays.length
            ? data.rsvpReminderOffsetDays
            : DEFAULT_OFFSETS) as number[];
          const offsetsSorted = [...offsets].sort((a, b) => b - a); // e.g. [14,7,2,0]
          const triggered = offsetsSorted.filter((d) => deadline - d * 86400000 <= now).length;
          if (triggered === 0) continue;

          // Guest time zones are never collected, so gate on the event's venue
          // zone, or the default zone when the host did not set one. The chase
          // follows the same event-local rule as the ticked reminder presets: it
          // never sends before the standard morning send hour, and never at
          // night. Overnight and early-morning runs are held for a later hourly
          // run, and guest.reminderCount still guarantees each guest gets each
          // reminder at most once.
          const eventZone = reminderTimeZone(data.timezone as string | undefined);
          const localHour = localHourInZone(eventZone, new Date(now));
          if (localHour < REMINDER_SEND_HOUR) continue;
          if (!isDaytimeInZone(data.timezone as string | undefined)) continue;

          const deadlineLabel = formatDateOnlyLong(deadlineStr);
          const daysLeft = Math.max(0, Math.ceil((deadline - now) / 86400000));

          let mutated = false;
          eventsProcessed += 1;

          for (const g of guestList) {
            if (!g) continue;
            if (g.status && g.status !== "pending") continue;
            const email = typeof g.email === "string" ? g.email.trim().toLowerCase() : "";
            if (!email.includes("@")) continue;
            const already = Number(g.reminderCount ?? 0);
            if (already >= triggered) continue;

            const locale = (g.preferredLanguage as string) === "es" ? "es" : "en";
            const reminderFromName = buildSenderName({
              override: (data as any).senderName,
              hostName: (data.hosts?.[0]?.name as string) || "",
              eventTitle: data.title || "",
            });
            const templateData = {
              guestName: g.name || "there",
              hostName: (data.hosts?.[0]?.name as string) || "",
              eventTitle: data.title || "your event",
              deadlineLabel,
              daysLeft,
              inviteUrl: personalInviteUrl(`https://thekenroecollective.com/invite/${ev.id}`, g.id as string),
              ...oneTapRsvpUrls(`https://thekenroecollective.com/invite/${ev.id}`, g.id as string),
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
              typeof template.subject === "function"
                ? template.subject(templateData)
                : template.subject;

            const messageId = crypto.randomUUID();
            const result = await sendManagedEmail({
              to: email,
              subject,
              html,
              text: plain,
              label: "rsvp-reminder",
              idempotencyKey: `rsvp-reminder-${ev.id}-${g.id}-${already + 1}`,
              messageId,
              fromName: reminderFromName,
            });

            const logSend = async (status: "sent" | "suppressed" | "failed", errorMessage?: string) => {
              const { error } = await admin.from("email_send_log").insert({
                message_id: messageId,
                template_name: "rsvp-reminder",
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
            g.reminderCount = already + 1;
            g.lastReminderAt = new Date().toISOString();
            mutated = true;

          }

          // Waitlist auto-promote. The decision itself lives in
          // src/lib/waitlist.ts, the same module the host card previews, so the
          // unattended outcome always matches what the host was shown: whole
          // parties only, people (not rows) counted, host-set order respected,
          // skip-or-hold per the host's policy, and never after the event has
          // started. A deliberate over-capacity override means nobody is
          // waitlisted in the first place, so there is nothing to promote.
          if (!data.allowOverCapacity) {
            const plan = planWaitlistPromotions(data as any);
            for (const entry of plan.promote) {
              const g = (guestList as any[]).find((row) => row?.id === entry.guest.id);
              if (!g) continue;
              const head = entry.heads;
              {
                g.status = "yes";
                g.waitlistPromotedAt = new Date().toISOString();
                g.waitlistPosition = undefined;
                data.waitlistLog = [
                  ...((data.waitlistLog as any[]) ?? []),
                  {
                    at: g.waitlistPromotedAt,
                    guestId: g.id,
                    guestName: g.name || "Guest",
                    heads: head,
                    by: "auto",
                    note: [describePlan(plan), describeSkipped(plan)].filter(Boolean).join(" "),
                  },
                ].slice(-200);
                mutated = true;
                emailsQueued += 1;

                // Send "you're in" email if we have their address.
                const email = typeof g.email === "string" ? g.email.trim().toLowerCase() : "";
                if (email.includes("@")) {
                  const locale = (g.preferredLanguage as string) === "es" ? "es" : "en";
                  const subject = locale === "es"
                    ? `Buenas noticias: se abrió un lugar para ${data.title || "el evento"}`
                    : `Good news — a spot opened for ${data.title || "your event"}`;
                  const inviteUrl = personalInviteUrl(`https://thekenroecollective.com/invite/${ev.id}`, g.id as string);
                  const bodyText = locale === "es"
                    ? `¡Hola ${g.name || ""}! Se liberó un lugar para ${data.title}. Confirma aquí: ${inviteUrl}`
                    : `Hi ${g.name || ""}, a spot opened up for ${data.title}. Confirm here: ${inviteUrl}`;
                  const html = `<p>${bodyText}</p><p><a href="${inviteUrl}">${inviteUrl}</a></p>`;
                  const messageId = crypto.randomUUID();
                  const promoted = await sendManagedEmail({
                    to: email,
                    subject,
                    html,
                    text: bodyText,
                    label: "waitlist-promoted",
                    idempotencyKey: `waitlist-promoted-${ev.id}-${g.id}-${g.waitlistPromotedAt}`,
                    messageId,
                    fromName: buildSenderName({
                      override: (data as any).senderName,
                      hostName: (data.hosts?.[0]?.name as string) || "",
                      eventTitle: data.title || "",
                    }),
                  });
                  const { error: logErr } = await admin.from("email_send_log").insert({
                    message_id: messageId,
                    template_name: "waitlist-promoted",
                    recipient_email: email,
                    status: promoted.ok ? "sent" : promoted.reason === "suppressed" ? "suppressed" : "failed",
                    ...(promoted.ok || promoted.reason === "suppressed"
                      ? {}
                      : { error_message: (promoted.error ?? promoted.reason).slice(0, 1000) }),
                  });
                  if (logErr) console.error("email_send_log insert failed", { code: logErr.code });

                }
              }
            }
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
