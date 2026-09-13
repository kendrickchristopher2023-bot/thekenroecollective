import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Thin server-function wrappers around src/lib/payment-messaging.server.ts.
 * All money, ownership and eligibility logic lives server-side there.
 */

const sendInput = z.object({
  eventId: z.string().min(1).max(120),
  guestIds: z.array(z.string().min(1).max(120)).min(1).max(500),
  kind: z.enum(["link", "reminder"]),
});

/** Preview exactly what would go out, without sending anything. */
export const previewPaymentMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(sendInput, data, "payment-messaging.functions.ts:19"))
  .handler(async ({ data, context }) => {
    const { resolvePaymentTargets } = await import("@/lib/payment-messaging.server");
    const { targets, skipped, title } = await resolvePaymentTargets({
      supabase: context.supabase,
      userId: context.userId,
      eventId: data.eventId,
      guestIds: data.guestIds,
      kind: data.kind,
    });
    return {
      title,
      subject:
        data.kind === "link"
          ? `Your payment link for ${title}`
          : `Balance still open for ${title}`,
      skipped,
      targets: targets.map((t) => ({
        guestId: t.guestId,
        guestName: t.guestName,
        email: t.email,
        phone: t.phone,
        amountDue: t.amountDue,
        amountPaid: t.amountPaid,
        payUrl: t.payUrl,
        smsBody: t.smsBody,
      })),
    };
  });

/** Actually queues the email (and returns per-guest SMS bodies for the outbox). */
export const sendPaymentMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(sendInput, data, "payment-messaging.functions.ts:52"))
  .handler(async ({ data, context }) => {
    const { resolvePaymentTargets, sendPaymentEmails } = await import(
      "@/lib/payment-messaging.server"
    );
    const { targets, skipped, title } = await resolvePaymentTargets({
      supabase: context.supabase,
      userId: context.userId,
      eventId: data.eventId,
      guestIds: data.guestIds,
      kind: data.kind,
    });

    const { data: row } = await context.supabase
      .from("events")
      .select("data")
      .eq("id", data.eventId)
      .maybeSingle();
    const ev = ((row as any)?.data as Record<string, any>) || {};

    const results = await sendPaymentEmails({
      eventId: data.eventId,
      kind: data.kind,
      hostName: String(ev?.hosts?.[0]?.name ?? ""),
      purpose: String(ev?.paymentPurpose ?? ""),
      title,
      targets,
    });

    return { results, skipped, title };
  });

/** Real per-message delivery state (email log + SMS outbox) for one event. */
export const getPaymentDeliveryStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({ eventId: z.string().min(1).max(120) }), data, "payment-messaging.functions.ts:88"),
  )
  .handler(async ({ data, context }) => {
    // Ownership check: the caller must be able to read the event under RLS.
    const { data: row, error } = await context.supabase
      .from("events")
      .select("id")
      .eq("id", data.eventId)
      .maybeSingle();
    if (error || !row) return { rows: [] };
    const { readPaymentDelivery } = await import("@/lib/payment-messaging.server");
    return { rows: await readPaymentDelivery(data.eventId) };
  });
