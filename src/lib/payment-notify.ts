import { toast } from "sonner";
import { sendPaymentMessages, previewPaymentMessages } from "@/lib/payment-messaging.functions";
import { queueSms } from "@/lib/sms.functions";

/**
 * Client orchestrator for real payment sends.
 *
 * Email is queued server-side (same transactional queue the RSVP mail uses).
 * SMS goes through the existing queueSms server function per guest, because the
 * text is personalised (name + amount owed) and queueSms takes one body per
 * call — this reuses the real outbox, consent log, opt-out list, tier cap and
 * demo guard exactly as the SMS reminders panel does, rather than a new path.
 */

export type PaymentSendKind = "link" | "reminder";

export interface PaymentSendSummary {
  emailsQueued: number;
  textsQueued: number;
  emailsFailed: number;
  skipped: Array<{ guestId: string; reason: string }>;
  reachedGuestIds: string[];
}

export async function previewPaymentSend(args: {
  eventId: string;
  guestIds: string[];
  kind: PaymentSendKind;
}) {
  return previewPaymentMessages({ data: args });
}

export async function sendPaymentSend(args: {
  eventId: string;
  guestIds: string[];
  kind: PaymentSendKind;
}): Promise<PaymentSendSummary> {
  const res = await sendPaymentMessages({ data: args });

  let emailsQueued = 0;
  let emailsFailed = 0;
  let textsQueued = 0;
  const reachedGuestIds: string[] = [];

  for (const r of res.results) {
    if (r.emailStatus === "queued") emailsQueued += 1;
    if (r.emailStatus === "failed") emailsFailed += 1;

    if (r.phone && r.smsBody) {
      try {
        const sms = await queueSms({
          data: {
            eventId: args.eventId,
            body: r.smsBody,
            recipients: [{ phone: r.phone, guestId: r.guestId, guestName: r.guestName }],
          },
        });
        textsQueued += sms.queued ?? 0;
      } catch {
        // SMS is best-effort: tier gate, opt-out or cap. Email still counts.
      }
    }

    if (r.emailStatus === "queued" || r.phone) reachedGuestIds.push(r.guestId);
  }

  return { emailsQueued, textsQueued, emailsFailed, skipped: res.skipped, reachedGuestIds };
}

/** One consistent toast for both the single-guest and bulk flows. */
export function reportPaymentSend(summary: PaymentSendSummary, who: string) {
  const parts: string[] = [];
  if (summary.emailsQueued) parts.push(`${summary.emailsQueued} email${summary.emailsQueued === 1 ? "" : "s"}`);
  if (summary.textsQueued) parts.push(`${summary.textsQueued} text${summary.textsQueued === 1 ? "" : "s"}`);
  if (parts.length === 0) {
    toast.error(
      summary.skipped.length
        ? `Nothing sent to ${who}: ${summary.skipped[0]!.reason}.`
        : `Nothing sent to ${who} — no valid email or phone on file.`,
    );
    return;
  }
  toast.success(`Sent ${parts.join(" and ")} to ${who}.`);
  if (summary.emailsFailed) {
    toast.warning(`${summary.emailsFailed} email${summary.emailsFailed === 1 ? "" : "s"} could not be queued.`);
  }
  if (summary.skipped.length) {
    toast.info(
      `${summary.skipped.length} guest${summary.skipped.length === 1 ? "" : "s"} skipped (${summary.skipped[0]!.reason}).`,
    );
  }
}
