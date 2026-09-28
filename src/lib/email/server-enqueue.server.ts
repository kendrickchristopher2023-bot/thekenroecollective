import * as React from "react";
import { render } from "@react-email/render";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TEMPLATES } from "@/lib/email-templates/registry";


function adminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface EnqueueArgs {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData?: Record<string, unknown>;
  label?: string;
  /** Optional event this message belongs to — recorded in email_send_log.metadata
   *  so the owner messaging report can filter by event. */
  eventId?: string;
  /** Optional guest this message belongs to — recorded in email_send_log.metadata
   *  so per-guest delivery status can be shown on the host's payment panel. */
  guestId?: string;
  /**
   * Display name for the From: header, e.g. "Christopher Kendrick (Kendrick
   * Family Reunion)". Guest-facing sends should always set this — an unknown
   * platform name is the single biggest trust problem in the inbox. The address
   * and signing domain never change, so DMARC alignment is unaffected.
   */
  fromName?: string;
}

/**
 * Single server-side send path for every app email.
 *
 * Delivery, retries, rate limits, suppression and unsubscribe handling all run
 * on Lovable's side; this function renders the registered template, sends it,
 * and records the outcome in email_send_log so the owner messaging report and
 * the host's per-guest delivery chips keep working.
 *
 * A per-send From display name is why this uses the email API directly rather
 * than the shared template helper.
 *
 * Failures are logged and swallowed — never break the calling flow.
 */
export async function enqueueTransactionalEmailServer(args: EnqueueArgs): Promise<{ ok: boolean; reason?: string }> {
  try {
    // Demo guard, same contract as queueSms and sendTransactionalEmailFn: the
    // demo host account holds a real Supabase session, so a demo visitor could
    // otherwise add a real address as a guest and trigger a real send. Every
    // server-side sender funnels through here, so gating it once covers event
    // invites, RFQ fan-out, PM invites, contact/guest-privacy flows and the
    // caller-facing send server function. Returns ok so demo flows still look
    // successful.
    //
    // The check is identity-aware: it fires for the demo account's session
    // whatever the cookie says. Sends tied to the showcase event, or to any
    // demo-owned event, are refused even from scheduled jobs that carry no
    // request at all.
    const { isDemoRequest, logDemoGuard } = await import("@/lib/demo-mode.server");
    if (await isDemoRequest()) {
      await logDemoGuard("send_email", { template: args.templateName, label: args.label ?? null, eventId: args.eventId ?? null });
      return { ok: true, reason: "demo" };
    }
    if (args.eventId) {
      const { isShowcaseEvent } = await import("@/lib/showcase");
      if (isShowcaseEvent(args.eventId)) return { ok: true, reason: "demo" };
      const admin = adminClient();
      if (admin) {
        const { data: ev } = await admin.from("events").select("is_demo").eq("id", args.eventId).maybeSingle();
        if ((ev as { is_demo?: boolean } | null)?.is_demo) return { ok: true, reason: "demo" };
      }
    }

    const recipient = args.recipientEmail.trim().toLowerCase();
    if (!recipient.includes("@")) return { ok: false, reason: "invalid_email" };

    const template = TEMPLATES[args.templateName];
    if (!template) return { ok: false, reason: "unknown_template" };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false, reason: "no_api_key" };

    // Any image that is not an absolute, publicly reachable https URL renders
    // in the browser preview and then vanishes in the inbox. Drop it here
    // rather than shipping a broken-image placeholder to the guest.
    const { sanitizeEmailImageData } = await import("@/lib/email/image-url");
    const supabaseHost = (() => {
      try {
        return new URL(process.env.SUPABASE_URL as string).hostname;
      } catch {
        return undefined;
      }
    })();
    const { data, dropped } = sanitizeEmailImageData(args.templateData ?? {}, supabaseHost);
    if (dropped.length) {
      console.warn("email image dropped (not inbox-safe)", {
        template: args.templateName,
        keys: dropped,
      });
    }
    const element = React.createElement(template.component as React.ComponentType<any>, data);

    const html = await render(element);
    const text = await render(element, { plainText: true });
    const subject =
      typeof template.subject === "function"
        ? (template.subject as (d: Record<string, any>) => string)(data)
        : (template.subject as string);

    const to = template.to ?? recipient;
    const messageId = crypto.randomUUID();
    const admin = adminClient();
    const metadata = {
      subject,
      ...(args.eventId ? { event_id: args.eventId } : {}),
      ...(args.guestId ? { guest_id: args.guestId } : {}),
    };

    async function log(status: "sent" | "suppressed" | "failed", errorMessage?: string) {
      if (!admin) return;
      const { error } = await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: args.templateName,
        recipient_email: to,
        status,
        ...(errorMessage ? { error_message: errorMessage.slice(0, 1000) } : {}),
        metadata,
      } as any);
      if (error) console.error("email_send_log insert failed", { code: error.code, message: error.message });
    }

    const { sendManagedEmail } = await import("@/lib/email/managed-send.server");
    const sent = await sendManagedEmail({
      to,
      subject,
      html,
      text,
      label: args.label ?? args.templateName,
      // Suffixed with a fresh id per attempt: a caller key reused verbatim
      // after a transient rejection can never recover, since the same key
      // keeps resolving to the failed attempt. The caller's identifier is
      // kept as the prefix for log correlation.
      idempotencyKey: `${args.idempotencyKey}-${messageId}`,
      messageId,
      fromName: args.fromName,
    });

    if (!sent.ok) {
      if (sent.reason === "suppressed") {
        await log("suppressed");
        return { ok: false, reason: "suppressed" };
      }
      await log("failed", sent.error ?? sent.reason);
      return { ok: false, reason: sent.reason };
    }

    await log("sent");
    return { ok: true };

  } catch (err) {
    console.error("enqueueTransactionalEmailServer failed", err);
    return { ok: false, reason: "exception" };
  }
}
