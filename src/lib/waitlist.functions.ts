import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Notify one promoted party, and tell the host it happened.
 *
 * Deliberately separate from the store write: the local promote is instant and
 * must never be blocked by mail, and tests can promote without sending
 * anything. Email goes through the one managed sender (demo-guarded, logged in
 * email_send_log). SMS is queued by the caller through the existing queueSms
 * path so consent, opt-out, tier cap and the demo guard all still apply.
 */
const input = z.object({
  eventId: z.string().min(1),
  guestId: z.string().min(1),
  guestName: z.string().default(""),
  email: z.string().default(""),
  eventName: z.string().default(""),
  partyPhrase: z.string().default(""),
  whenLine: z.string().default(""),
  venue: z.string().default(""),
  inviteUrl: z.string().default(""),
  heads: z.number().int().nonnegative().default(1),
  by: z.enum(["auto", "host"]).default("host"),
});

export const notifyWaitlistPromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(input, data, "waitlist.functions.ts:31"))
  .handler(async ({ data, context }) => {
    const out = { emailed: false, hostNotified: false, reason: "" as string };

    const email = data.email.trim().toLowerCase();
    if (email.includes("@")) {
      try {
        const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
        const res = await enqueueTransactionalEmailServer({
          templateName: "waitlist-promoted",
          recipientEmail: email,
          idempotencyKey: `waitlist-promoted-${data.eventId}-${data.guestId}`,
          label: "waitlist-promoted",
          eventId: data.eventId,
          guestId: data.guestId,
          templateData: {
            eventName: data.eventName,
            guestName: data.guestName,
            partyPhrase: data.partyPhrase,
            whenLine: data.whenLine,
            venue: data.venue,
            inviteUrl: data.inviteUrl,
          },
        });
        out.emailed = res.ok;
        if (!res.ok) out.reason = res.reason ?? "email_failed";
      } catch (err) {
        console.error("waitlist promotion email failed", err);
        out.reason = "email_exception";
      }
    } else {
      out.reason = "no_email";
    }

    // Host bell entry: the whole point of auto-promote is that it runs
    // unattended, so the host must be able to see what happened after the fact.
    try {
      const { error } = await context.supabase.from("host_notifications").insert({
        user_id: context.userId,
        event_id: data.eventId,
        kind: "waitlist_promoted",
        title: `${data.guestName || "A guest"} promoted from the waitlist`,
        body: `${data.heads} ${data.heads === 1 ? "person" : "people"} confirmed${data.by === "auto" ? " automatically" : ""}${out.emailed ? " and notified" : ""}.`,
        link: `/events/${data.eventId}?step=guests`,
      } as never);
      out.hostNotified = !error;
    } catch (err) {
      console.error("waitlist promotion host notification failed", err);
    }

    return out;
  });
