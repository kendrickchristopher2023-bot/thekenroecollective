// Owner Command Center, Phase 3: actionable issues plus SAFE actions only.
//
// Every action here is reversible or additive. There is deliberately no delete,
// no refund, no reveal-now, no bulk operation, and nothing that can touch a
// customer's message content. The four supported actions are:
//   1. mark an error group resolved   (reversible: resolved_at can be cleared)
//   2. stop emailing an address       (reversible: remove the suppression row)
//   3. retry one failed text          (re-queues the same body, sends nothing new)
//   4. remind one organizer by email  (never charges, reveals, or edits a card)
import { withoutAccounts } from "@/lib/owner-account-filter";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueTransactionalEmailServer } from "@/lib/email/server-enqueue.server";
import { ECARD_EMAIL_FALLBACK_TZ, ECARD_SITE_ORIGIN } from "@/lib/ecards-delivery.server";
import { formatDateTimeInZone } from "@/lib/ecards-time";
import {
  VENTURE_EMAIL_PREFIXES,
  VENTURE_ROUTE_PREFIXES,
  type VentureId,
} from "@/lib/owner-ventures";


export type IssueAction =
  | { kind: "resolve_error"; key: string }
  | { kind: "suppress_email"; key: string }
  | { kind: "retry_sms"; key: string }
  | { kind: "remind_ecard"; key: string }
  | { kind: "none" };

export type ActionableIssue = {
  id: string;
  area: "Errors" | "Email bounces" | "Text failures" | "Stuck eCards";
  title: string;
  explanation: string;
  count: number;
  lastSeen: string | null;
  recommendation: string;
  action: IssueAction;
  actionLabel: string | null;
};

async function admin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

function short(text: string | null | undefined, max = 120): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "no detail recorded";
  return t.length > max ? `${t.slice(0, max)}...` : t;
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const head = name.slice(0, 2);
  return `${head}${name.length > 2 ? "***" : ""}@${domain}`;
}

/** Digits only, then require a plausible US or international length. */
export function isRetryablePhone(raw: string | null | undefined): boolean {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return false;
  // Obvious test or placeholder patterns are never retried.
  if (/^(\d)\1+$/.test(digits)) return false;
  if (digits.startsWith("1555") || digits.startsWith("555")) return false;
  return true;
}

function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 4 ? `xxx-xxx-${digits.slice(-4)}` : "unknown number";
}

/**
 * Read only. Builds the owner-facing issue list for the window, each row with a
 * stable key the matching safe action can act on. When a venture is selected,
 * only issues with a clear signal for that venture are listed: errors by page
 * route, bounces by email template, texts for Events only, stuck cards for
 * Group eCards only.
 */
export async function loadActionableIssues(
  since: string,
  until: string,
  venture: VentureId = "all",
): Promise<ActionableIssue[]> {
  const sb = await admin();
  const out: ActionableIssue[] = [];
  const all = venture === "all";
  const routePrefixes = (VENTURE_ROUTE_PREFIXES as any)[venture] as string[] | undefined;
  const templatePrefixes = (VENTURE_EMAIL_PREFIXES as any)[venture] as string[] | undefined;
  const matches = (value: string | null | undefined, prefixes: string[] | undefined) => {
    if (all) return true;
    if (!prefixes || prefixes.length === 0) return false;
    const v = String(value ?? "").toLowerCase();
    return prefixes.some((p) => v.startsWith(p.toLowerCase()));
  };



  // Demo and sample-account rows are our own material, never a customer issue.
  const { getDemoUserIds } = await import("@/lib/demo-accounts.server");
  const systemIds = await getDemoUserIds().catch(() => [] as string[]);
  const notSystem = (q: any, col: string) => withoutAccounts(q, col, systemIds);

  const [errors, bounces, smsFails, suppressed, unpaid] = await Promise.all([
    notSystem(
      sb
        .from("app_error_logs")
        .select("fingerprint,error_name,message,route,created_at")
        .gte("created_at", since)
        .lt("created_at", until)
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(400),
      "user_id",
    ),
    sb
      .from("email_send_log")
      .select("recipient_email,template_name,error_message,created_at")
      .gte("created_at", since)
      .lt("created_at", until)
      .eq("status", "bounced")
      .limit(400),
    notSystem(
      sb
        .from("sms_outbox")
        .select("id,to_phone,error,created_at,status")
        .gte("created_at", since)
        .lt("created_at", until)
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(100),
      "user_id",
    ),
    sb.from("suppressed_emails").select("email").limit(2000),
    notSystem(
      sb
        .from("ecards")
        .select("id,occasion,recipient_name,created_at,public_slug")
        .gte("created_at", since)
        .lt("created_at", until)
        .is("paid_at", null)
        .is("delivered_at", null)
        .limit(500),
      "organizer_user_id",
    ),
  ]);

  // 1. Unresolved errors, grouped by fingerprint.
  const errorGroups = new Map<
    string,
    { name: string; message: string; route: string | null; count: number; last: string }
  >();
  for (const r of (errors.data as any[]) ?? []) {
    if (!matches(r.route, routePrefixes)) continue;
    const g = errorGroups.get(r.fingerprint);

    if (!g) {
      errorGroups.set(r.fingerprint, {
        name: r.error_name || "Error",
        message: r.message,
        route: r.route ?? null,
        count: 1,
        last: r.created_at,
      });
      continue;
    }
    g.count += 1;
    if (r.created_at > g.last) g.last = r.created_at;
  }
  for (const [fingerprint, g] of [...errorGroups.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)) {
    out.push({
      id: `error:${fingerprint}`,
      area: "Errors",
      title: `${g.name} on ${g.route || "an unknown page"}`,
      explanation: `Something went wrong for a visitor on this page. Details recorded: ${short(g.message, 140)}`,
      count: g.count,
      lastSeen: g.last,
      recommendation:
        "Review the page, then mark this resolved once you are satisfied. You can reopen it later.",
      action: { kind: "resolve_error", key: fingerprint },
      actionLabel: "Mark resolved",
    });
  }

  // 2. Bounced addresses, skipping any already suppressed.
  const suppressedSet = new Set(
    ((suppressed.data as any[]) ?? []).map((r) => String(r.email).toLowerCase()),
  );
  const bounceGroups = new Map<
    string,
    { count: number; last: string; reason: string; template: string }
  >();
  for (const r of (bounces.data as any[]) ?? []) {
    const email = String(r.recipient_email ?? "").toLowerCase();
    if (!email || suppressedSet.has(email)) continue;
    if (!matches(r.template_name, templatePrefixes)) continue;
    const g = bounceGroups.get(email);

    if (!g) {
      bounceGroups.set(email, {
        count: 1,
        last: r.created_at,
        reason: short(r.error_message, 90),
        template: r.template_name || "email",
      });
      continue;
    }
    g.count += 1;
    if (r.created_at > g.last) g.last = r.created_at;
  }
  for (const [email, g] of [...bounceGroups.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8)) {
    out.push({
      id: `bounce:${email}`,
      area: "Email bounces",
      title: `Email keeps bouncing for ${maskEmail(email)}`,
      explanation: `A ${g.template} email could not be delivered. Reason given: ${g.reason}. Repeated bounces hurt delivery for everyone.`,
      count: g.count,
      lastSeen: g.last,
      recommendation:
        "Stop emailing this address. It joins the do not email list and can be removed later.",
      action: { kind: "suppress_email", key: email },
      actionLabel: "Stop emailing this address",
    });
  }

  // 3. Failed texts, one row per message so a retry is precise.
  // Texts are only used by Events & Gatherings, so other ventures show none.
  const showSms = all || venture === "events";
  for (const r of showSms ? ((smsFails.data as any[]) ?? []) : []) {
    const retryable = isRetryablePhone(r.to_phone);

    out.push({
      id: `sms:${r.id}`,
      area: "Text failures",
      title: `Text did not send to ${maskPhone(String(r.to_phone ?? ""))}`,
      explanation: `The carrier or provider rejected this message. Reason given: ${short(r.error, 110)}`,
      count: 1,
      lastSeen: r.created_at,
      recommendation: retryable
        ? "Retry this one message. The same wording is re-queued, nothing new is written."
        : "This number does not look valid, so a retry is not offered. No action needed.",
      action: retryable ? { kind: "retry_sms", key: r.id } : { kind: "none" },
      actionLabel: retryable ? "Retry send" : null,
    });
  }

  // 4. Stuck unpaid cards older than 3 days that already collected messages.
  // Cards belong to Group eCards only.
  const showEcards = all || venture === "ecards";
  const stuckCutoff = Date.now() - 3 * 86_400_000;
  const stuck = showEcards
    ? ((unpaid.data as any[]) ?? []).filter(
        (r) => new Date(r.created_at).getTime() < stuckCutoff,
      )
    : [];

  if (stuck.length) {
    const ids = stuck.map((r) => r.id);
    const counts = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await sb
        .from("ecard_contributions")
        .select("ecard_id")
        .in("ecard_id", ids.slice(i, i + 100))
        .limit(2000);
      for (const c of (data as any[]) ?? []) {
        counts.set(c.ecard_id, (counts.get(c.ecard_id) ?? 0) + 1);
      }
    }
    for (const card of stuck) {
      const messages = counts.get(card.id) ?? 0;
      if (!messages) continue;
      out.push({
        id: `ecard:${card.id}`,
        area: "Stuck eCards",
        title: `Card for ${card.recipient_name} has ${messages} ${messages === 1 ? "message" : "messages"} but was never sent`,
        explanation:
          "The organizer collected messages, then stopped before sending. A friendly reminder usually finishes it.",
        count: messages,
        lastSeen: card.created_at,
        recommendation:
          "Email the organizer a reminder. Nothing is charged, revealed, or changed on the card.",
        action: { kind: "remind_ecard", key: card.id },
        actionLabel: "Send the organizer a reminder",
      });
    }
  }

  return out;
}

/** Minimal who, what, when record in the existing admin audit table. */
async function audit(
  actorUserId: string,
  actorEmail: string | null,
  action: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    const sb = await admin();
    await sb.from("admin_audit_log").insert({
      actor_user_id: actorUserId,
      actor_email: actorEmail,
      action,
      details,
    } as any);
  } catch {
    // Auditing must never block or fail a safe action.
  }
}

type Actor = { userId: string; email: string | null };

/** Reversible: clears back to unresolved from the error monitoring panel. */
export async function markErrorGroupResolved(
  actor: Actor,
  fingerprint: string,
): Promise<{ ok: true; updated: number }> {
  const sb = await admin();
  const { data, error } = await sb
    .from("app_error_logs")
    .update({ resolved_at: new Date().toISOString(), resolved_by: actor.userId } as any)
    .eq("fingerprint", fingerprint)
    .is("resolved_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  const updated = ((data as any[]) ?? []).length;
  await audit(actor.userId, actor.email, "owner_issue.resolve_error", { fingerprint, updated });
  return { ok: true, updated };
}

/** Additive: one row on the do not email list, removable later. */
export async function suppressEmailAddress(
  actor: Actor,
  email: string,
): Promise<{ ok: true; alreadySuppressed: boolean }> {
  const sb = await admin();
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await sb
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalized)
    .limit(1);
  if (((existing as any[]) ?? []).length) return { ok: true, alreadySuppressed: true };

  const { error } = await sb.from("suppressed_emails").insert({
    email: normalized,
    reason: "bounced",
    frequency: "permanent",
    metadata: { added_by: "owner_command_center", actor_email: actor.email },
  } as any);
  if (error) throw new Error(error.message);
  await audit(actor.userId, actor.email, "owner_issue.suppress_email", { email: normalized });
  return { ok: true, alreadySuppressed: false };
}

/** Re-queues the existing message only. No content is created or edited. */
export async function retryFailedSms(
  actor: Actor,
  id: string,
): Promise<{ ok: boolean; reason?: string }> {
  const sb = await admin();
  const { data: row, error } = await sb
    .from("sms_outbox")
    .select("id,to_phone,status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { ok: false, reason: "not_found" };
  if ((row as any).status !== "failed") return { ok: false, reason: "not_failed" };
  if (!isRetryablePhone((row as any).to_phone)) return { ok: false, reason: "invalid_number" };

  const { error: upErr } = await sb
    .from("sms_outbox")
    .update({ status: "pending", error: null, provider_sid: null } as any)
    .eq("id", id)
    .eq("status", "failed");
  if (upErr) throw new Error(upErr.message);
  await audit(actor.userId, actor.email, "owner_issue.retry_sms", { sms_id: id });
  return { ok: true };
}

/**
 * Sends the existing organizer reminder email for one card. It does not stamp
 * the automatic reminder columns, does not charge, does not reveal, and does
 * not touch the card or any message.
 */
export async function remindStuckEcardOrganizer(
  actor: Actor,
  ecardId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const sb = await admin();
  const { data: card, error } = await sb
    .from("ecards")
    .select(
      "id,occasion,recipient_name,public_slug,organizer_user_id,reveal_date,organizer_timezone,delivered_at",
    )
    .eq("id", ecardId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!card) return { ok: false, reason: "not_found" };
  if ((card as any).delivered_at) return { ok: false, reason: "already_sent" };

  let organizerEmail: string | null = null;
  try {
    const { data } = await (sb as any).auth.admin.getUserById((card as any).organizer_user_id);
    organizerEmail = data?.user?.email ?? null;
  } catch {
    organizerEmail = null;
  }
  if (!organizerEmail) return { ok: false, reason: "no_organizer_email" };

  const count = await sb
    .from("ecard_contributions")
    .select("id", { count: "exact", head: true })
    .eq("ecard_id", ecardId);

  const revealIso = (card as any).reveal_date as string;
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(revealIso).getTime() - Date.now()) / 86_400_000),
  );
  const today = new Date().toISOString().slice(0, 10);

  const sent = await enqueueTransactionalEmailServer({
    templateName: "ecard-reminder",
    recipientEmail: organizerEmail,
    idempotencyKey: `ecard-reminder-owner-${ecardId}-${today}`,
    templateData: {
      recipientName: (card as any).recipient_name,
      occasion: (card as any).occasion,
      messageCount: count.count ?? 0,
      revealDateLabel: formatDateTimeInZone(
        revealIso,
        (card as any).organizer_timezone || ECARD_EMAIL_FALLBACK_TZ,
      ),
      daysLeft,
      shareUrl: `${ECARD_SITE_ORIGIN}/c/${(card as any).public_slug}`,
      dashboardUrl: `${ECARD_SITE_ORIGIN}/ecards/${ecardId}`,
    },
    label: "ecard-reminder-owner",
  });
  if (!sent.ok) return { ok: false, reason: sent.reason ?? "send_failed" };

  await audit(actor.userId, actor.email, "owner_issue.remind_ecard_organizer", {
    ecard_id: ecardId,
  });
  return { ok: true };
}
