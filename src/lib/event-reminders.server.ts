// Event countdown reminders — server-only worker.
//
// The host ticks presets ("1 week before", "1 day before", "day of") on the
// event page. This worker turns those ticks into real email, sent to guests who
// already hold an invitation: everyone who said yes or maybe, plus anyone who
// hasn't answered. The RSVP-deadline chase is a separate job with a different
// job to do (pending guests only, keyed to the reply-by date).
//
// Idempotency lives in public.event_reminder_sends: one row per
// (event, guest, preset, channel), unique in the database, so a retry or an
// overlapping run can never double-send.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { canonicalPhone, phoneKeys } from "@/lib/phone-keys";
import { enqueueTransactionalEmailServer } from "@/lib/email/server-enqueue.server";
import { buildSenderName } from "@/lib/email/sender-name";
import { formatEventForMessage, eventInstant } from "@/lib/datetime";
import { personalInviteUrl } from "@/lib/invite-links";
import {
  calendarDaysUntilEvent,
  reminderTimeFor,
  resolveReminderSend,
} from "@/lib/reminder-schedule";



export const SITE_ORIGIN = "https://thekenroecollective.com";

/** Presets, mirrored from REMINDER_PRESETS in events-store (days before the event). */
export const REMINDER_PRESET_DAYS: Record<string, number> = {
  "1y": 365,
  "6m": 182,
  "2m": 60,
  "1m": 30,
  "2w": 14,
  "1w": 7,
  "2d": 2,
  "1d": 1,
  dayof: 0,
};

export type ReminderGuest = {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  status?: string;
};

export type ReminderEventData = {
  title?: string;
  date?: string;
  timezone?: string;
  venue?: string;
  address?: string;
  color?: string;
  senderName?: string;
  hosts?: Array<{ name?: string }>;
  guests?: ReminderGuest[];
  reminderPresetIds?: string[];
  /** Per-preset send times, "HH:MM" event-local, keyed by preset id. */
  reminderTimes?: Record<string, string>;
  /** Text the ticked reminders too, using the host's own template. */
  reminderSmsEnabled?: boolean;
  reminderSmsBody?: string;
};

export function adminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Human "in 1 week" / "tomorrow" / "today" for the subject line. */
export function whenLabelForDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days === 7) return "in 1 week";
  if (days < 30) return `in ${Math.round(days / 7)} weeks`;
  if (days < 60) return "in 1 month";
  if (days < 350) return `in ${Math.round(days / 30)} months`;
  return "in 1 year";
}

/** A reminder goes to guests who hold an invitation: yes, maybe, or no answer yet. */
export function isReminderAudience(guest: ReminderGuest): boolean {
  const status = guest.status || "pending";
  return status === "yes" || status === "maybe" || status === "pending";
}

/**
 * Whole days between now and the event start, rounded up. Uses the event's real
 * instant (a stored naive wall clock is resolved in the venue zone), so this is
 * never off by the venue's UTC offset.
 */
export function daysUntilEvent(dateIso: string | undefined, now = Date.now(), timezone?: string | null): number | null {
  if (!dateIso) return null;
  const t = eventInstant(dateIso, timezone).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - now) / 86_400_000);
}

/**
 * Presets that are due right now: their resolved event-local send moment has
 * passed and the event has not started yet. A preset the host ticked late still
 * goes out once, which is what "remind my guests" is expected to do.
 *
 * The worker enforces the same invariant as the UI: nothing is ever sent at or
 * after the event start, and a moment that resolved past the start has already
 * been moved to the evening before by resolveReminderSend().
 */
export function duePresetsAt(
  presetIds: string[],
  eventDate: string | undefined,
  timezone: string | null | undefined,
  now: Date = new Date(),
  times?: Record<string, string> | null,
): string[] {
  return presetIds.filter((id) => {
    const days = REMINDER_PRESET_DAYS[id];
    if (days === undefined) return false;
    const r = resolveReminderSend(eventDate, timezone, days, reminderTimeFor(id, times), now);
    if (!r.at || !r.eventStart) return false;
    // Never send at or after the party starts.
    if (r.at.getTime() >= r.eventStart.getTime()) return false;
    if (now.getTime() >= r.eventStart.getTime()) return false;
    return r.at.getTime() <= now.getTime();
  });
}

/** Legacy day-count form, kept for the countdown label and existing tests. */
export function duePresets(presetIds: string[], daysAway: number): string[] {
  return presetIds.filter((id) => {
    const days = REMINDER_PRESET_DAYS[id];
    if (days === undefined) return false;
    return daysAway <= days;
  });
}


export interface SendOutcome {
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Send one preset's reminder to a set of guests, claiming each guest in the
 * database first so a concurrent run cannot send the same message twice.
 */
export async function sendReminderBatch(args: {
  admin: SupabaseClient;
  eventId: string;
  eventData: ReminderEventData;
  guests: ReminderGuest[];
  presetId: string;
  /** Manual sends skip the claim table so a host can deliberately resend. */
  claim?: boolean;
  whenLabel?: string;
}): Promise<SendOutcome> {
  const { admin, eventId, eventData, guests, presetId } = args;
  const claim = args.claim !== false;
  const batchStamp = Date.now().toString(36);

  const out: SendOutcome = { sent: 0, skipped: 0, failed: 0 };
  const inviteBase = `${SITE_ORIGIN}/invite/${eventId}`;
  const hostName = eventData.hosts?.[0]?.name || "";
  const fromName = buildSenderName({
    override: eventData.senderName,
    hostName,
    eventTitle: eventData.title,
  });
  // Emails carry the zone label ("6:00 PM EDT") — an inbox in another zone has
  // no page context to correct a bare time.
  const { date: eventDate, timeWithZone: eventTime } = formatEventForMessage(
    eventData.date,
    eventData.timezone,
  );
  // Calendar days at the venue, so "today" / "tomorrow" match the guest's
  // reading of the invitation rather than a UTC day boundary.
  const daysAway = calendarDaysUntilEvent(eventData.date, eventData.timezone);
  const whenLabel =
    args.whenLabel ?? whenLabelForDays(daysAway === null ? REMINDER_PRESET_DAYS[presetId] ?? 0 : daysAway);


  for (const g of guests) {
    const email = typeof g.email === "string" ? g.email.trim().toLowerCase() : "";
    if (!g.id || !email.includes("@")) {
      out.skipped += 1;
      continue;
    }

    if (claim) {
      const { error: claimErr } = await admin.from("event_reminder_sends").insert({
        event_id: eventId,
        guest_id: g.id,
        preset_id: presetId,
        channel: "email",
      } as never);
      // Unique-violation means someone already sent this exact reminder.
      if (claimErr) {
        out.skipped += 1;
        continue;
      }
    }

    const r = await enqueueTransactionalEmailServer({
      templateName: "event-reminder",
      recipientEmail: email,
      // Scheduled sends are once-only per preset. A manual send is a deliberate
      // resend, so its key carries the send batch stamp or provider-level
      // idempotency would silently swallow the second attempt.
      idempotencyKey: claim
        ? `event-reminder-${eventId}-${g.id}-${presetId}`
        : `event-reminder-${eventId}-${g.id}-${presetId}-${batchStamp}`,
      label: "event-reminder",
      eventId,
      guestId: g.id,
      fromName,
      templateData: {
        guestName: g.name || "there",
        hostName,
        eventTitle: eventData.title || "your event",
        whenLabel,
        eventDate,
        eventTime,
        venue: eventData.venue || "",
        address: eventData.address || "",
        inviteUrl: personalInviteUrl(inviteBase, g.id),
        // Dropped automatically when it is not an inbox-safe absolute https URL.
        coverImage: (eventData as any).image || "",
        status: g.status || "pending",
        accentColor: eventData.color || "",
      },
    });

    if (r.ok) {
      out.sent += 1;
      // Manual sends skip the claim, but must still leave an audit row with the
      // channel recorded, so the host can see a genuine last-reminder time.
      if (!claim) {
        await admin.from("event_reminder_sends").upsert(
          {
            event_id: eventId,
            guest_id: g.id,
            preset_id: presetId,
            channel: "email",
            sent_at: new Date().toISOString(),
          } as never,
          { onConflict: "event_id,guest_id,preset_id,channel" },
        );
      }
    } else if (r.reason === "suppressed") out.skipped += 1;
    else {
      out.failed += 1;
      // A real failure must not consume the one-and-only claim.
      if (claim) {
        await admin
          .from("event_reminder_sends")
          .delete()
          .eq("event_id", eventId)
          .eq("guest_id", g.id)
          .eq("preset_id", presetId)
          .eq("channel", "email");
      }
    }
  }

  return out;
}

const OPT_OUT_DISCLOSURE =
  " Reply STOP to opt out. Msg & data rates may apply. The Kenroe Collective.";

function normalizePhoneDigits(raw: string): string {
  return canonicalPhone(raw);
}

export interface SmsQueueOutcome {
  queued: number;
  skipped: number;
}

/**
 * Queues the scheduled SMS reminder for one preset.
 *
 * Idempotency is the same claim table the email path uses, with channel "sms",
 * so a retry or an overlapping cron run can never text a guest twice for the
 * same preset. Delivery itself is the sms-outbox-drain worker's job: this only
 * writes `pending` rows, which means an unconfigured provider loses nothing.
 */
export async function queueReminderSmsBatch(args: {
  admin: SupabaseClient;
  eventId: string;
  ownerUserId: string;
  eventData: ReminderEventData;
  guests: ReminderGuest[];
  presetId: string;
  whenLabel?: string;
  claim?: boolean;
}): Promise<SmsQueueOutcome> {
  const { admin, eventId, ownerUserId, eventData, guests, presetId } = args;
  const claim = args.claim !== false;
  const out: SmsQueueOutcome = { queued: 0, skipped: 0 };

  const { renderReminderSms } = await import("@/lib/reminder-sms");
  const { resolveUserTier } = await import("@/lib/tier-guards.server");
  const { getEffectiveSmsCap, canSendSms, isUnlimited } = await import("@/lib/tier-limits");

  // The host's plan decides whether scheduled texts may go at all, and how many
  // per event. Same gate as the manual composer, so the two can never drift.
  const resolved = await resolveUserTier(admin, ownerUserId);
  const { data: profileRow } = await admin
    .from("profiles")
    .select("sms_pack_enabled")
    .eq("id", ownerUserId)
    .maybeSingle();
  const smsPackPaid =
    resolved.isOwner ||
    resolved.isAdmin ||
    !!(profileRow as { sms_pack_enabled?: boolean } | null)?.sms_pack_enabled;
  if (!canSendSms(resolved.tier, smsPackPaid)) {
    return { queued: 0, skipped: guests.length };
  }

  let remainingCap = Infinity;
  const cap = getEffectiveSmsCap(resolved.tier, smsPackPaid);
  if (!isUnlimited(cap)) {
    const { count: already } = await admin
      .from("sms_outbox")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .neq("status", "failed");
    remainingCap = Math.max(0, cap - (already ?? 0));
  }

  const daysAway = calendarDaysUntilEvent(eventData.date, eventData.timezone);
  const whenLabel =
    args.whenLabel ??
    whenLabelForDays(daysAway === null ? REMINDER_PRESET_DAYS[presetId] ?? 0 : daysAway);
  const hostName = eventData.hosts?.[0]?.name || "";

  const candidates = guests
    .map((g) => ({
      guest: g,
      raw: typeof g.phone === "string" ? g.phone.replace(/\s+/g, "") : "",
      norm: typeof g.phone === "string" ? normalizePhoneDigits(g.phone) : "",
    }))
    .filter((c) => !!c.guest.id && /\+?\d[\d\-()]{5,}/.test(c.raw) && c.norm.length >= 7);
  out.skipped += guests.length - candidates.length;
  if (!candidates.length) return out;

  // The consent table holds the same US number in both a 10 and an 11 digit
  // form, so every stored variant is looked up and an opt-out on any of them
  // blocks the send.
  const lookupKeys = Array.from(new Set(candidates.flatMap((c) => phoneKeys(c.raw))));
  const { data: consent } = await admin
    .from("sms_consent_log")
    .select("phone_number, opted_out")
    .in("phone_number", lookupKeys);
  const consentMap = new Map<string, boolean>();
  for (const row of consent ?? []) {
    const key = canonicalPhone((row as any).phone_number as string);
    consentMap.set(key, consentMap.get(key) === true || !!(row as any).opted_out);
  }

  const inviteBase = `${SITE_ORIGIN}/invite/${eventId}`;
  const newConsent: Array<{ phone_number: string }> = [];
  const rows: Array<Record<string, unknown>> = [];
  const claimed: string[] = [];

  for (const c of candidates) {
    if (consentMap.get(c.norm) === true) {
      out.skipped += 1;
      continue;
    }
    if (rows.length >= remainingCap) {
      out.skipped += 1;
      continue;
    }
    if (claim) {
      const { error: claimErr } = await admin.from("event_reminder_sends").insert({
        event_id: eventId,
        guest_id: c.guest.id,
        preset_id: presetId,
        channel: "sms",
      } as never);
      if (claimErr) {
        out.skipped += 1;
        continue;
      }
      claimed.push(c.guest.id as string);
    }

    const body = renderReminderSms(eventData.reminderSmsBody, {
      eventTitle: eventData.title,
      whenLabel,
      guestName: c.guest.name,
      hostName,
      link: `${SITE_ORIGIN}/s/${eventId}`,
    });
    const isFirstEver = consentMap.get(c.norm) === undefined;
    if (isFirstEver) {
      newConsent.push({ phone_number: c.norm });
      consentMap.set(c.norm, false);
    }
    rows.push({
      event_id: eventId,
      user_id: ownerUserId,
      to_phone: c.raw,
      guest_id: c.guest.id,
      guest_name: c.guest.name ?? null,
      body: isFirstEver ? `${body}${OPT_OUT_DISCLOSURE}` : body,
      status: "pending",
      provider: "twilio",
    });
  }

  if (!rows.length) return out;
  if (newConsent.length) {
    await admin
      .from("sms_consent_log")
      .upsert(newConsent as never, { onConflict: "phone_number", ignoreDuplicates: true });
  }

  const { error: insertErr } = await admin.from("sms_outbox").insert(rows as never);
  if (insertErr) {
    // Nothing was queued, so the claims must not be consumed.
    if (claimed.length) {
      await admin
        .from("event_reminder_sends")
        .delete()
        .eq("event_id", eventId)
        .eq("preset_id", presetId)
        .eq("channel", "sms")
        .in("guest_id", claimed);
    }
    out.skipped += rows.length;
    return out;
  }
  out.queued += rows.length;
  // `inviteBase` stays the email path's personal link; SMS uses the short link
  // so the message fits a segment.
  void inviteBase;
  return out;
}



/**
 * Cron entry point. Scans upcoming events, and for every preset the host ticked
 * that is now due, emails the guests who haven't had that preset yet.
 */
export async function sendDueEventReminders(): Promise<{
  eventsProcessed: number;
  sent: number;
  skipped: number;
  failed: number;
  smsQueued: number;
  smsSkipped: number;
}> {
  const empty = { eventsProcessed: 0, sent: 0, skipped: 0, failed: 0, smsQueued: 0, smsSkipped: 0 };
  const admin = adminClient();
  if (!admin) return empty;

  const now = Date.now();
  const { data: events, error } = await admin
    .from("events")
    .select("id, user_id, data, archived_at")
    .eq("is_demo", false)
    .neq("id", "showcase-wedding")
    .is("archived_at", null)
    .limit(500);
  if (error || !events) return empty;

  let eventsProcessed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let smsQueued = 0;
  let smsSkipped = 0;


  for (const row of events) {
    const eventData = ((row as any).data || {}) as ReminderEventData;
    const presetIds = Array.isArray(eventData.reminderPresetIds) ? eventData.reminderPresetIds : [];
    if (!presetIds.length) continue;

    const daysAway = daysUntilEvent(eventData.date, now, eventData.timezone);
    // Past events, and events whose start is more than a year out, are skipped.
    if (daysAway === null || daysAway < 0 || daysAway > 366) continue;

    // Due means: the preset's resolved event-local moment has passed and the
    // party has not started. The send hour is baked into the resolved instant,
    // so no separate night-time gate is needed. A run that misses the hour
    // picks the send up later, and the claim table keeps it once-only.
    const due = duePresetsAt(
      presetIds,
      eventData.date,
      eventData.timezone,
      new Date(now),
      eventData.reminderTimes,
    );
    if (!due.length) continue;


    const guests = (Array.isArray(eventData.guests) ? eventData.guests : []).filter(isReminderAudience);
    if (!guests.length) continue;

    eventsProcessed += 1;

    // Only the nearest due preset sends in one run, so a late-ticked schedule
    // cannot fire four emails at once.
    const nearest = due.reduce((best, id) =>
      (REMINDER_PRESET_DAYS[id] ?? 999) < (REMINDER_PRESET_DAYS[best] ?? 999) ? id : best,
    );

    const res = await sendReminderBatch({
      admin,
      eventId: (row as any).id as string,
      eventData,
      guests,
      presetId: nearest,
    });
    sent += res.sent;
    skipped += res.skipped;
    failed += res.failed;

    // Scheduled SMS rides the same due window and the same claim table, only on
    // the "sms" channel, so email and text can never cannibalise each other.
    if (eventData.reminderSmsEnabled && (row as any).user_id) {
      const smsRes = await queueReminderSmsBatch({
        admin,
        eventId: (row as any).id as string,
        ownerUserId: (row as any).user_id as string,
        eventData,
        guests,
        presetId: nearest,
      });
      smsQueued += smsRes.queued;
      smsSkipped += smsRes.skipped;
    }
  }

  return { eventsProcessed, sent, skipped, failed, smsQueued, smsSkipped };
}
