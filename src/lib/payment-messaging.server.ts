/**
 * Real delivery for host-triggered payment messages.
 *
 * Why this file exists: the host UI used to "send" payment links and payment
 * reminders by opening `mailto:` / `sms:` deep links on the host's own device,
 * and the one code path that did attempt a real email
 * (`resendPaymentReminder` -> sendTransactionalEmail) posted to
 * /lovable/email/transactional/send, whose CALLER_SENDABLE allow-list does not
 * contain "payment-reminder" — so every attempt 403'd and the failure was
 * swallowed by a .catch(console.error). Nothing was ever actually sent.
 *
 * Everything here runs server-side with the caller's identity verified, uses
 * the SAME infrastructure the RSVP nudges use (enqueueTransactionalEmailServer
 * -> transactional_emails queue for email, sms_outbox for text), and recomputes
 * money and eligibility from the stored event so a tampered client cannot
 * inflate an amount, skip the 72h spacing or exceed the 3-send cap.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { attendanceFare } from "@/lib/party-fare";

export const PAYMENT_REMINDER_MAX = 3;
export const PAYMENT_REMINDER_MIN_GAP_MS = 72 * 60 * 60 * 1000;

export type PaymentSendKind = "link" | "reminder";

export interface PaymentSendTarget {
  guestId: string;
  guestName: string;
  email: string | null;
  phone: string | null;
  amountDue: number;
  amountPaid: number;
  payUrl: string;
  locale: "en" | "es";
  /** Ready-to-queue SMS text; the client hands this to queueSms. */
  smsBody: string;
}

export interface PaymentSendResult {
  guestId: string;
  guestName: string;
  emailStatus: "queued" | "skipped" | "failed";
  emailReason?: string;
  phone: string | null;
  smsBody: string | null;
}

function admin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function money(n: number): string {
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

/** Shared fare contract (src/lib/party-fare.ts): adults + kids at their rates. */
function owedFor(data: any, g: any): number {
  return attendanceFare(data, g);
}

/** Net money on file, honouring the append-only history (refunds are negative). */
function collectedFor(data: any, g: any): number {
  const hist = Array.isArray(g?.payment?.history) ? g.payment.history : [];
  if (hist.length) return hist.reduce((s: number, h: any) => s + Number(h?.amount ?? 0), 0);
  const legacy = Number(g?.payment?.paidAmount ?? NaN);
  if (Number.isFinite(legacy)) return Math.max(0, legacy);
  return g?.payment?.status === "paid" ? owedFor(data, g) : 0;
}

const SITE_ORIGIN = "https://thekenroecollective.com";

function payUrlFor(eventId: string, g: any): string {
  const link = typeof g?.payment?.link === "string" ? g.payment.link.trim() : "";
  if (/^https:\/\//i.test(link)) return link;
  return `${SITE_ORIGIN}/invite/${eventId}`;
}

function smsBodyFor(kind: PaymentSendKind, title: string, g: any, due: number, url: string): string {
  const first = String(g?.name ?? "").split(" ")[0] || "there";
  return kind === "link"
    ? `Hi ${first}, here's your payment link for ${title}: ${url} (${money(due)} due)`
    : `Hi ${first}, a friendly reminder: ${money(due)} is still due for ${title}. Pay here: ${url}`;
}

/**
 * Loads the event, verifies the caller may message its guests, and resolves the
 * requested guests into fully-costed send targets. Reminder sends additionally
 * enforce the cap + 72h spacing server-side.
 */
export async function resolvePaymentTargets(opts: {
  supabase: SupabaseClient;
  userId: string;
  eventId: string;
  guestIds: string[];
  kind: PaymentSendKind;
  now?: number;
}): Promise<{ title: string; targets: PaymentSendTarget[]; skipped: Array<{ guestId: string; reason: string }> }> {
  const now = opts.now ?? Date.now();
  // RLS scopes this select to events the caller may read (own events; owners see all).
  const { data: row, error } = await opts.supabase
    .from("events")
    .select("id, data, user_id")
    .eq("id", opts.eventId)
    .maybeSingle();
  if (error || !row) throw new Error("Event not found.");

  const data = ((row as any).data as Record<string, any>) || {};
  if (!data.paymentEnabled) throw new Error("Payment collection is off for this event.");

  const guests: any[] = Array.isArray(data.guests) ? data.guests : [];
  const wanted = new Set(opts.guestIds);
  const targets: PaymentSendTarget[] = [];
  const skipped: Array<{ guestId: string; reason: string }> = [];

  for (const g of guests) {
    if (!g || !wanted.has(g.id)) continue;
    const p = g.payment ?? {};
    const owed = owedFor(data, g);
    const paid = Math.max(0, collectedFor(data, g));
    const due = owed - paid;

    if (owed <= 0) {
      skipped.push({ guestId: g.id, reason: "no amount set" });
      continue;
    }
    if (due <= 0) {
      skipped.push({ guestId: g.id, reason: "already settled" });
      continue;
    }
    if (opts.kind === "reminder") {
      if (p.status === "paid" || p.status === "refunded" || p.status === "canceled") {
        skipped.push({ guestId: g.id, reason: `status is ${p.status}` });
        continue;
      }
      if (g.status !== "yes" && !(g.status === "maybe" && p.remindersOptIn)) {
        skipped.push({ guestId: g.id, reason: "not a confirmed guest" });
        continue;
      }
      if (Number(p.remindersSent ?? 0) >= PAYMENT_REMINDER_MAX) {
        skipped.push({ guestId: g.id, reason: "reminder limit reached" });
        continue;
      }
      const last = p.lastReminderAt ? Date.parse(p.lastReminderAt) : NaN;
      if (Number.isFinite(last) && now - last < PAYMENT_REMINDER_MIN_GAP_MS) {
        skipped.push({ guestId: g.id, reason: "reminded in the last 72 hours" });
        continue;
      }
    }

    const email = typeof g.email === "string" ? g.email.trim().toLowerCase() : "";
    const phone = typeof g.phone === "string" ? g.phone.trim() : "";
    if (!email.includes("@") && phone.replace(/\D/g, "").length < 10) {
      skipped.push({ guestId: g.id, reason: "no email or phone on file" });
      continue;
    }

    const url = payUrlFor(opts.eventId, g);
    const title = String(data.title ?? "your event");
    targets.push({
      guestId: g.id,
      guestName: String(g.name ?? "Guest"),
      email: email.includes("@") ? email : null,
      phone: phone.replace(/\D/g, "").length >= 10 ? phone : null,
      amountDue: due,
      amountPaid: paid,
      payUrl: url,
      locale: g.preferredLanguage === "es" ? "es" : "en",
      smsBody: smsBodyFor(opts.kind, title, g, due, url),
    });
  }

  return { title: String(data.title ?? "your event"), targets, skipped };
}

/** Queues the real email for each target through the same path RSVP mail uses. */
export async function sendPaymentEmails(opts: {
  eventId: string;
  kind: PaymentSendKind;
  hostName: string;
  purpose: string;
  title: string;
  targets: PaymentSendTarget[];
}): Promise<PaymentSendResult[]> {
  const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
  const templateName = opts.kind === "link" ? "payment-request" : "payment-reminder";
  const out: PaymentSendResult[] = [];

  for (const t of opts.targets) {
    const base: PaymentSendResult = {
      guestId: t.guestId,
      guestName: t.guestName,
      emailStatus: "skipped",
      emailReason: "no email on file",
      phone: t.phone,
      smsBody: t.phone ? t.smsBody : null,
    };
    if (!t.email) {
      out.push(base);
      continue;
    }
    const res = await enqueueTransactionalEmailServer({
      templateName,
      recipientEmail: t.email,
      idempotencyKey: `${templateName}-${opts.eventId}-${t.guestId}-${Date.now()}`,
      label: templateName,
      eventId: opts.eventId,
      guestId: t.guestId,
      templateData: {
        guestName: t.guestName,
        hostName: opts.hostName,
        eventTitle: opts.title,
        amountDue: money(t.amountDue),
        amountPaid: t.amountPaid > 0 ? money(t.amountPaid) : "",
        purpose: opts.purpose,
        payUrl: t.payUrl,
        locale: t.locale,
      },
    });
    out.push({
      ...base,
      emailStatus: res.ok ? "queued" : "failed",
      emailReason: res.ok ? undefined : res.reason,
    });
  }
  return out;
}

export interface PaymentDeliveryRow {
  channel: "email" | "sms";
  to: string;
  guestId: string | null;
  status: string;
  error: string | null;
  at: string;
}

/** Real per-message delivery state from the email log and the SMS outbox. */
export async function readPaymentDelivery(eventId: string): Promise<PaymentDeliveryRow[]> {
  const db = admin();
  if (!db) return [];
  const rows: PaymentDeliveryRow[] = [];

  const { data: emails } = await db
    .from("email_send_log")
    .select("message_id, recipient_email, status, error_message, created_at, metadata, template_name")
    .in("template_name", ["payment-reminder", "payment-request"])
    .order("created_at", { ascending: false })
    .limit(1000);

  // The queue writes later status rows (sent / failed) for the SAME message_id
  // WITHOUT metadata, so the event/guest link only exists on the first row.
  // Resolve the link per message_id first, then keep the NEWEST status row for
  // it — otherwise a delivered message keeps showing its original "pending".
  const link = new Map<string, { guestId: string | null }>();
  for (const r of (emails ?? []) as any[]) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    if (meta.event_id !== eventId) continue;
    const key = String(r.message_id ?? "");
    if (!key) continue;
    if (!link.has(key)) {
      link.set(key, { guestId: typeof meta.guest_id === "string" ? meta.guest_id : null });
    }
  }

  const seen = new Set<string>();
  for (const r of (emails ?? []) as any[]) {
    const key = String(r.message_id ?? "");
    const l = link.get(key);
    if (!l || seen.has(key)) continue;
    seen.add(key);
    rows.push({
      channel: "email",
      to: String(r.recipient_email ?? ""),
      guestId: l.guestId,
      status: String(r.status ?? "pending"),
      error: (r.error_message as string) ?? null,
      at: String(r.created_at ?? ""),
    });
  }

  const { data: sms } = await db
    .from("sms_outbox")
    .select("to_phone, guest_id, status, error, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(500);
  for (const r of (sms ?? []) as any[]) {
    rows.push({
      channel: "sms",
      to: String(r.to_phone ?? ""),
      guestId: (r.guest_id as string) ?? null,
      status: String(r.status ?? "pending"),
      error: (r.error as string) ?? null,
      at: String(r.created_at ?? ""),
    });
  }

  return rows;
}
