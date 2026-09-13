import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  OWNER_ALERT_DASHBOARD_URL,
  OWNER_ALERT_EMAILS,
  OWNER_ALERT_PHONE,
  OWNER_ALERT_SMS_PREFIX,
} from "@/lib/owner-alerts.config";

/**
 * Owner alerts: internal notifications to Christopher about important activity
 * across the ventures.
 *
 * Rules:
 *  - Payments send BOTH an SMS and an email. Inbound messages send email only.
 *  - Routine automated outbound mail (invites, reminders, receipts) stays silent.
 *  - Every failure here is logged and swallowed. An alert must never break a
 *    payment, a contact submission, or any other underlying action.
 *  - Owner contact details live in src/lib/owner-alerts.config.ts, nowhere else.
 */

function adminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Idempotency guard. Returns true when this alert has not been sent before and
 * the caller should proceed. Backed by the unique dedupe_key on
 * owner_alert_log, so Stripe webhook redeliveries never double-alert.
 * If the log is unavailable we return true (better one extra alert than none).
 */
async function claimAlert(dedupeKey: string, kind: string): Promise<boolean> {
  const admin = adminClient();
  if (!admin) return true;
  const { error } = await admin
    .from("owner_alert_log")
    .insert({ dedupe_key: dedupeKey, kind } as never);
  if (!error) return true;
  // 23505 = unique violation: already alerted.
  if ((error as { code?: string }).code === "23505") return false;
  console.error("[owner-alerts] claim failed, sending anyway", error.message);
  return true;
}

/** Direct Twilio send, same API path the SMS outbox drain uses. Never throws. */
export async function sendOwnerSms(body: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { isDemoRequest } = await import("@/lib/demo-mode.server");
    if (await isDemoRequest()) return { ok: true, reason: "demo" };
  } catch {
    // demo check unavailable, continue
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) {
    console.error("[owner-alerts] SMS skipped, Twilio not configured");
    return { ok: false, reason: "unconfigured" };
  }

  try {
    const params = new URLSearchParams({ To: OWNER_ALERT_PHONE, Body: body });
    if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
    else params.set("From", fromNumber as string);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );
    if (!res.ok) {
      const text = await res.text();
      console.error(`[owner-alerts] SMS failed [${res.status}]: ${text}`);
      return { ok: false, reason: `twilio_${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[owner-alerts] SMS threw", e);
    return { ok: false, reason: "exception" };
  }
}

export interface OwnerAlertArgs {
  /** Machine label, for example payment_received or inbound_message. */
  kind: string;
  /** Stable key per underlying event, for example the Stripe session id. */
  dedupeKey: string;
  title: string;
  lines: string[];
  /** Dashboard path or absolute URL. */
  link?: string;
  /** When set, also text the owner phone. Payments only. */
  sms?: string;
}

/**
 * Sends the owner alert on every configured channel. Never throws.
 *
 * Returns false when this exact alert was already claimed, so a caller can tell
 * "sent" from "skipped as a duplicate" instead of guessing.
 */
export async function sendOwnerAlert(args: OwnerAlertArgs): Promise<boolean> {
  try {
    const fresh = await claimAlert(args.dedupeKey, args.kind);
    if (!fresh) return false;

    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    for (const email of OWNER_ALERT_EMAILS) {
      try {
        const result = await enqueueTransactionalEmailServer({
          templateName: "owner-alert",
          recipientEmail: email,
          idempotencyKey: `owner-alert-${args.dedupeKey}-${email}`,
          label: `owner-alert-${args.kind}`,
          templateData: {
            kind: args.kind,
            title: args.title,
            lines: args.lines,
            link: args.link ?? OWNER_ALERT_DASHBOARD_URL,
          },
        });
        if (!result.ok) console.error("[owner-alerts] email not queued", email, result.reason);
      } catch (e) {
        console.error("[owner-alerts] email threw", email, e);
      }
    }

    if (args.sms) {
      await sendOwnerSms(`${OWNER_ALERT_SMS_PREFIX}: ${args.sms}`);
    }
    return true;
  } catch (e) {
    console.error("[owner-alerts] sendOwnerAlert failed", e);
    return false;
  }
}
