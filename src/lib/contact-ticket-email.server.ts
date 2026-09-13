import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SUPPORT_RECIPIENT = "support@thekenroecollective.com";
const TEMPLATE_NAME = "contact-ticket";

interface ContactTicketNotificationArgs {
  supabase: SupabaseClient<Database>;
  ticketId: string;
  contactEmail: string;
  contactName?: string;
  subject: string;
  message: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function contactLine(name: string | undefined, email: string): string {
  const trimmedName = name?.trim();
  return trimmedName ? `${trimmedName} <${email}>` : email;
}

async function recordEmailStatus(
  supabase: SupabaseClient<Database>,
  messageId: string,
  status: "sent" | "failed" | "suppressed",
  errorMessage?: string,
) {
  const { error } = await supabase.from("email_send_log").insert({
    message_id: messageId,
    template_name: TEMPLATE_NAME,
    recipient_email: SUPPORT_RECIPIENT,
    status,
    error_message: errorMessage,
  } as never);
  if (error) {
    console.error("email_send_log insert failed", { code: error.code, message: error.message });
  }
}

/**
 * Admin alert for a new contact ticket.
 *
 * Composed inline rather than through the template registry because the body is
 * plain escaped ticket text, and sent through Lovable's managed email API —
 * delivery, retries, suppression and the unsubscribe footer are handled there.
 */
export async function enqueueContactTicketNotification({
  supabase,
  ticketId,
  contactEmail,
  contactName,
  subject,
  message,
}: ContactTicketNotificationArgs): Promise<{ ok: boolean; reason?: string }> {
  // Demo environment never sends real mail (mirrors queueSms / sendTransactionalEmailFn).
  const { isDemoRequest } = await import("@/lib/demo-mode.server");
  if (await isDemoRequest()) return { ok: true, reason: "demo" };

  const messageId = crypto.randomUUID();
  const from = contactLine(contactName, contactEmail);
  const title = `New contact message: ${subject}`;
  const body = `From: ${from}\n\n${message}`;
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replace(/\n/g, "<br />");

  const { sendManagedEmail } = await import("@/lib/email/managed-send.server");
  const result = await sendManagedEmail({
    to: SUPPORT_RECIPIENT,
    subject: `[The Kenroe Collective] ${title}`,
    html: `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,sans-serif;color:#111111;"><div style="max-width:560px;margin:0 auto;padding:24px 16px;"><div style="padding:28px;border:1px solid #ececec;border-radius:14px;background:#fafaf7;"><p style="margin:0 0 12px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#6b6b6b;">The Kenroe Collective • Admin alert</p><h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#111111;">${safeTitle}</h1><p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#333333;">${safeBody}</p><a href="https://thekenroecollective.com/owner" style="display:inline-block;background:#3B82F6;color:#ffffff;padding:10px 18px;border-radius:999px;font-size:13px;text-decoration:none;">Open in dashboard</a></div><p style="margin-top:20px;text-align:center;font-size:11px;color:#999999;">You're receiving this because you're an admin of The Kenroe Collective.</p></div></body></html>`,
    text: `${title}\n\n${body}\n\nOpen in dashboard: https://thekenroecollective.com/owner`,
    label: TEMPLATE_NAME,
    idempotencyKey: `${TEMPLATE_NAME}-${ticketId}-${messageId}`,
    messageId,
  });

  if (!result.ok) {
    if (result.reason === "suppressed") {
      await recordEmailStatus(supabase, messageId, "suppressed");
      return { ok: false, reason: "suppressed" };
    }
    await recordEmailStatus(supabase, messageId, "failed", result.error ?? result.reason);
    return { ok: false, reason: result.reason };
  }

  await recordEmailStatus(supabase, messageId, "sent");
  return { ok: true };
}
