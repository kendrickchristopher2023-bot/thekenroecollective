/**
 * Host-side alerts for join requests.
 *
 * Everyone who actually works the guest list is told: the event owner plus every
 * accepted co-host. Viewer collaborators are skipped because they cannot approve
 * anything. Channels: email (default on), the in-app bell (default on) and SMS
 * (opt-in, existing Host+/SMS-pack gate).
 *
 * Both the live submit path and the 48-hour reminder job call through here, so
 * the wording, recipients and idempotency rules can never drift apart.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { joinRequestPrefs, type JoinRequestPrefs } from "@/lib/join-request-prefs";
import {
  capacityVerdict,
  formatMoney,
  normalizeParty,
  partyLabel,
  requestOwed,
} from "@/lib/guest-request-review";

export interface GuestManager {
  userId: string;
  email: string | null;
  phone: string | null;
  smsOptIn: boolean;
  tier: string;
  smsPackPaid: boolean;
  prefs: JoinRequestPrefs;
  isOwner: boolean;
}

/** Owner + accepted co-hosts for one event, with the prefs each one set. */
export async function resolveGuestManagers(
  admin: SupabaseClient,
  eventId: string,
): Promise<GuestManager[]> {
  const { data: ev } = await admin
    .from("events")
    .select("user_id")
    .eq("id", eventId)
    .maybeSingle();
  const ownerId = (ev as { user_id?: string } | null)?.user_id;
  if (!ownerId) return [];

  const { data: members } = await admin
    .from("event_members")
    .select("user_id, role, status")
    .eq("event_id", eventId)
    .eq("role", "cohost")
    .eq("status", "accepted");

  const ids = [ownerId, ...((members ?? []).map((m: any) => m.user_id).filter(Boolean) as string[])];
  const unique = Array.from(new Set(ids));

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, phone, sms_opt_in, tier, sms_pack_enabled, notification_prefs")
    .in("id", unique);
  const byId = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));

  const out: GuestManager[] = [];
  for (const userId of unique) {
    const p = byId.get(userId) ?? {};
    let email: string | null = null;
    try {
      const { data: u } = await admin.auth.admin.getUserById(userId);
      email = (u?.user?.email ?? null)?.toLowerCase() ?? null;
    } catch {
      email = null;
    }
    out.push({
      userId,
      email,
      phone: (p.phone as string | null) ?? null,
      smsOptIn: !!p.sms_opt_in,
      tier: (p.tier as string) ?? "free",
      smsPackPaid: !!p.sms_pack_enabled,
      prefs: joinRequestPrefs(p.notification_prefs),
      isOwner: userId === ownerId,
    });
  }
  return out;
}

export interface JoinRequestAlert {
  requestId: string;
  eventId: string;
  eventData: Record<string, any>;
  guestName: string;
  contact: string;
  note?: string | null;
  partySize: number;
  origin: string;
  /** True for the 48-hour follow-up nudge. */
  reminder?: boolean;
  /** Host-facing committed headcount, when the caller can compute it. */
  committed?: number;
}

export interface AlertSummary {
  recipients: number;
  emails: number;
  inApp: number;
  sms: number;
}

/** Plain-language party/fee/capacity lines shared by every channel. */
export function alertLines(alert: JoinRequestAlert) {
  const heads = normalizeParty(alert.partySize);
  const owed = requestOwed(alert.eventData, heads);
  const cap = capacityVerdict(alert.eventData, alert.committed ?? 0, heads);
  return {
    heads,
    party: partyLabel(alert.guestName, heads),
    owedLabel: owed > 0 ? formatMoney(owed) : "",
    capacityLabel:
      cap.remaining === null
        ? ""
        : cap.verdict === "fits"
          ? `Fits, ${cap.remaining} of your cap left`
          : cap.verdict === "waitlist"
            ? "Would be waitlisted, over your cap"
            : "Over your cap, approving would exceed capacity",
    eventName: (alert.eventData.title as string) || "your event",
  };
}

/**
 * Fan out one join request to every guest manager on the event. Safe to call
 * more than once for the same request: the caller stamps notified_at /
 * reminded_at, and the email queue is keyed on the request id so a retry cannot
 * double-send.
 */
export async function notifyHostsOfJoinRequest(
  admin: SupabaseClient,
  alert: JoinRequestAlert,
): Promise<AlertSummary> {
  const managers = await resolveGuestManagers(admin, alert.eventId);
  const lines = alertLines(alert);
  // Demo and showcase events never text anyone. The email leg is refused inside
  // enqueueTransactionalEmailServer; the SMS leg is refused here because it
  // writes to sms_outbox directly.
  {
    const { isShowcaseEvent } = await import("@/lib/showcase");
    const { data: evRow } = await admin.from("events").select("is_demo").eq("id", alert.eventId).maybeSingle();
    if (isShowcaseEvent(alert.eventId) || (evRow as { is_demo?: boolean } | null)?.is_demo) {
      alert.eventData = { ...alert.eventData, isDemo: true };
    }
  }
  const manageUrl = `${alert.origin}/events/${alert.eventId}?step=guests`;
  const summary: AlertSummary = { recipients: managers.length, emails: 0, inApp: 0, sms: 0 };
  if (!managers.length) return summary;

  const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
  const { canSendSms } = await import("@/lib/tier-limits");

  const title = alert.reminder
    ? `Still waiting: ${lines.party}`
    : `${lines.party} asked to join`;
  const bodyBits = [
    `${lines.eventName}`,
    lines.owedLabel ? `Owes ${lines.owedLabel}` : "",
    lines.capacityLabel,
  ].filter(Boolean);

  const bellRows: any[] = [];

  for (const m of managers) {
    if (m.prefs.join_requests_inapp) {
      bellRows.push({
        user_id: m.userId,
        event_id: alert.eventId,
        kind: alert.reminder ? "join_request_reminder" : "join_request",
        title,
        body: bodyBits.join(" · "),
        link: `/events/${alert.eventId}?step=guests`,
      });
    }

    if (m.prefs.join_requests_email && m.email) {
      try {
        await enqueueTransactionalEmailServer({
          templateName: alert.reminder ? "guest-request-reminder" : "guest-request-notice",
          recipientEmail: m.email,
          idempotencyKey: `join-request-${alert.reminder ? "reminder" : "new"}-${alert.requestId}-${m.userId}`,
          label: alert.reminder ? "join-request-reminder" : "join-request-notice",
          eventId: alert.eventId,
          templateData: {
            eventName: lines.eventName,
            guestName: alert.guestName,
            partyLabel: lines.party,
            contact: alert.contact,
            note: alert.note || "",
            owed: lines.owedLabel,
            capacityNote: lines.capacityLabel,
            manageUrl,
          },
        });
        summary.emails += 1;
      } catch (err) {
        console.error("join-request host email failed", err);
      }
    }

    if (
      m.prefs.join_requests_sms &&
      m.phone &&
      m.smsOptIn &&
      canSendSms(m.tier as any, m.smsPackPaid) &&
      !alert.eventData.isDemo
    ) {
      try {
        const digits = m.phone.replace(/\D/g, "");
        const { data: consent } = await admin
          .from("sms_consent_log")
          .select("opted_out")
          .eq("phone_number", digits)
          .maybeSingle();
        if ((consent as any)?.opted_out) continue;
        const { error } = await admin.from("sms_outbox").insert({
          event_id: alert.eventId,
          user_id: m.userId,
          to_phone: m.phone,
          guest_name: alert.guestName,
          body: `${title} for ${lines.eventName}. Review: ${manageUrl}`,
          status: "pending",
          provider: "twilio",
        });
        if (!error) summary.sms += 1;
      } catch (err) {
        console.error("join-request host SMS failed", err);
      }
    }
  }

  if (bellRows.length) {
    const { error } = await admin.from("host_notifications").insert(bellRows);
    if (error) console.error("join-request bell insert failed", error);
    else summary.inApp = bellRows.length;
  }

  return summary;
}
