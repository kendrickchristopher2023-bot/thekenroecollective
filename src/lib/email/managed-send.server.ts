import { EmailAPIError, sendLovableEmail } from "@lovable.dev/email-js";

import { SITE_NAME, SENDER_DOMAIN, FROM_DOMAIN } from "@/lib/email/sender-domain";
import { sanitizeSenderName } from "@/lib/email/sender-name";

export interface ManagedSendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Log/label for this message class, e.g. the template name. */
  label: string;
  /** Stable per-send key so a retry of the same logical send is deduped. */
  idempotencyKey: string;
  messageId?: string;
  /** From: display name. Address and signing domain never change. */
  fromName?: string;
  replyTo?: string;
}

export type ManagedSendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "suppressed" | "no_api_key" | "send_failed"; error?: string; messageId: string };

/**
 * Sends one already-rendered email through Lovable's managed email API.
 *
 * Delivery, retries, rate limiting, bounce/complaint suppression and the
 * unsubscribe footer are all handled by Lovable, so there is nothing to queue,
 * schedule or suppress here. Callers own their own logging.
 */
export async function sendManagedEmail(args: ManagedSendArgs): Promise<ManagedSendResult> {
  const messageId = args.messageId ?? crypto.randomUUID();
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { ok: false, reason: "no_api_key", messageId };

  try {
    await sendLovableEmail(
      {
        to: args.to,
        from: `${sanitizeSenderName(args.fromName || "") || SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: args.subject,
        html: args.html,
        text: args.text,
        purpose: "transactional",
        label: args.label,
        idempotency_key: args.idempotencyKey,
        message_id: messageId,
        reply_to: args.replyTo,
      } as never,
      { apiKey, sendUrl: process.env.LOVABLE_SEND_URL },
    );
  } catch (err) {
    if (err instanceof EmailAPIError && err.code === "recipient_suppressed") {
      return { ok: false, reason: "suppressed", messageId };
    }
    const error = (err instanceof Error ? err.message : String(err));
    if (err instanceof EmailAPIError && err.status === 429) {
      console.error("managed email rate limited", { retryAfter: err.retryAfterSeconds ?? 60 });
    }
    return { ok: false, reason: "send_failed", error, messageId };
  }

  return { ok: true, messageId };
}
