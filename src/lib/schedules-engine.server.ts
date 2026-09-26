// Schedules engine: keeps occurrences materialized 90 days ahead and turns due
// reminder steps into sends through the existing pipes (sms_outbox + drain for
// texts, enqueueTransactionalEmailServer for email). Never a second sender.
//
// Idempotency: every send is first claimed by inserting a
// schedule_reminder_sends row with a unique (occurrence, person, step, channel)
// key. Only a row this call actually inserted is ever sent, so a retry or two
// overlapping ticks cannot double-send.

import type { SupabaseClient } from "@supabase/supabase-js";
import { expandOccurrences, type ScheduleRule, type ScheduleException } from "@/lib/schedule-rrule";
import {
  renderTemplate,
  firstName,
  whenLabel,
  quietHoursSendAt,
  DAILY_SMS_CAP,
  complianceIntro,
  STOP_LINE,
  inQuietHours,
  DEFAULT_STEPS,
  hostFromSchedule,
  hostSmsLine,
  prettyPhone,
} from "@/lib/schedule-messages";
import { phoneKeys, canonicalPhone } from "@/lib/phone-keys";

export const SCHEDULE_SITE_ORIGIN = "https://thekenroecollective.com";
const HORIZON_DAYS = 90;
const LATE_WINDOW_MS = 30 * 60_000;
const MAX_LEAD_MS = 31 * 86_400_000;

type Admin = SupabaseClient<any, any, any>;

export function calendarLink(token: string): string {
  return `${SCHEDULE_SITE_ORIGIN}/api/public/schedule-calendar/${token}`;
}
export function personPageLink(token: string): string {
  return `${SCHEDULE_SITE_ORIGIN}/sc/${token}`;
}

/** Rebuild occurrences from now - 1 day to now + 90 days. */
export async function materializeSchedule(admin: Admin, scheduleId: string, now = new Date()) {
  const { data: s } = await admin.from("schedules").select("*").eq("id", scheduleId).maybeSingle();
  if (!s) return { ok: false, reason: "not_found" };
  const { data: exRows } = await admin.from("schedule_exceptions").select("*").eq("schedule_id", scheduleId);
  const from = new Date(now.getTime() - 86_400_000);
  const to = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
  const occ = expandOccurrences(s as ScheduleRule, (exRows ?? []) as ScheduleException[], from, to);
  const rows = occ.map((o) => ({
    schedule_id: scheduleId,
    occurrence_local: o.occurrence_local,
    start_local: o.start_local,
    starts_at: o.starts_at.toISOString(),
    ends_at: o.ends_at.toISOString(),
    status: o.status,
  }));
  if (rows.length) {
    const { error } = await admin.from("schedule_occurrences").upsert(rows, { onConflict: "schedule_id,occurrence_local" });
    if (error) throw new Error(`materialize failed: ${error.message}`);
  }
  // Future slots the rule no longer produces (series edited or ended) are cancelled, never deleted.
  const keep = new Set(rows.map((r) => r.occurrence_local));
  const { data: existing } = await admin
    .from("schedule_occurrences")
    .select("id,occurrence_local,status")
    .eq("schedule_id", scheduleId)
    .gte("starts_at", now.toISOString());
  const stale = (existing ?? []).filter(
    (r: any) => !keep.has(String(r.occurrence_local).slice(0, 16).replace(" ", "T")) && r.status !== "cancelled",
  );
  if (stale.length) {
    await admin.from("schedule_occurrences").update({ status: "cancelled" }).in("id", stale.map((r: any) => r.id));
  }
  await admin.from("schedules").update({ horizon_until: to.toISOString() }).eq("id", scheduleId);
  return { ok: true, count: rows.length };
}

/** Nightly: extend every active series so open-ended ones keep going forever. */
export async function topUpAll(admin: Admin, now = new Date()) {
  const { data } = await admin.from("schedules").select("id").neq("status", "ended");
  let n = 0;
  for (const r of data ?? []) {
    await materializeSchedule(admin, (r as any).id, now);
    n++;
  }
  return n;
}


export interface TickResult {
  considered: number;
  claimed: number;
  queued: number;
  blocked: number;
  held: number;
  skipped: number;
  welcomes: number;
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Shared guards and delivery. The automatic tick and "Send now" both go
// through guardFor() and deliverClaimed(), so the checks run in one order.
// ---------------------------------------------------------------------------

export interface OwnerInfo {
  entitled: boolean;
  demo: boolean;
  host: string;
  isOwner: boolean;
}

export function makeOwnerCache(admin: Admin, now: Date) {
  const cache = new Map<string, OwnerInfo>();
  const smsToday = new Map<string, number>();
  async function info(uid: string): Promise<OwnerInfo> {
    let v = cache.get(uid);
    if (!v) {
      const [{ data: can }, { data: demo }, { data: prof }, { data: own }] = await Promise.all([
        admin.rpc("can_use_schedules", { _uid: uid }),
        admin.rpc("is_demo_user", { _user_id: uid }),
        admin.from("profiles").select("display_name").eq("id", uid).maybeSingle(),
        admin.rpc("has_role", { _user_id: uid, _role: "owner" }),
      ]);
      v = {
        entitled: can === true,
        demo: demo === true,
        host: ((prof as any)?.display_name as string) || "your host",
        isOwner: own === true,
      };
      cache.set(uid, v);
      // Manual and automatic texts share this table, so both count toward the cap.
      const since = new Date(now.getTime() - 86_400_000).toISOString();
      const { count } = await admin
        .from("schedule_reminder_sends")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", uid)
        .eq("channel", "sms")
        .in("status", ["queued", "sent", "delivered"])
        .gte("sent_at", since);
      smsToday.set(uid, count ?? 0);
    }
    return v;
  }
  return { info, smsToday };
}

/** Every stored form of every number, checked against the shared opt-out record. */
export async function loadOptOuts(admin: Admin, phones: (string | null | undefined)[]): Promise<Set<string>> {
  const all = new Set<string>();
  for (const ph of phones) if (ph) for (const k of phoneKeys(ph)) { all.add(k); all.add(`+${k}`); }
  const out = new Set<string>();
  if (all.size) {
    const { data } = await admin.from("sms_consent_log").select("phone_number,opted_out").in("phone_number", [...all]);
    for (const r of data ?? []) if ((r as any).opted_out) out.add(canonicalPhone((r as any).phone_number));
  }
  return out;
}

export type GuardResult = { status: "dry_run" | "paused" | "blocked" | "held"; reason: string } | null;

/** The one ordered list of checks. null means the send may go. */
export function guardFor(args: {
  schedule: any;
  person: any;
  channel: "email" | "sms";
  info: OwnerInfo;
  optedOut: Set<string>;
  smsUsed: number;
}): GuardResult {
  const { schedule: s, person, channel, info, optedOut, smsUsed } = args;
  const c = person.contact ?? {};
  if (s.is_demo || info.demo) return { status: "dry_run", reason: "demo" };
  if (!info.entitled) return { status: "paused", reason: "plan_downgraded" };
  if (person.paused) return { status: "paused", reason: "person_paused" };
  if (channel === "email") {
    if (!c.email) return { status: "blocked", reason: "no_email" };
    if (c.email_opt_out) return { status: "blocked", reason: "email_opt_out" };
    return null;
  }
  if (!c.phone) return { status: "blocked", reason: "no_phone" };
  if (!person.sms_consent_at) return { status: "blocked", reason: "no_text_consent" };
  if (optedOut.has(canonicalPhone(c.phone))) return { status: "blocked", reason: "opted_out" };
  if (!info.isOwner && smsUsed >= DAILY_SMS_CAP) return { status: "held", reason: "daily_text_limit" };
  return null;
}

export function mergeValues(s: any, person: any, startsAt: Date, host: string) {
  const h = hostFromSchedule(s);
  return {
    first_name: firstName(person.contact?.display_name),
    title: s.title,
    when: whenLabel(startsAt, s.timezone),
    join: s.join_url || [s.dial_in, s.dial_pin ? `PIN ${s.dial_pin}` : ""].filter(Boolean).join(" ") || s.location,
    calendar: calendarLink(person.rsvp_token),
    rsvp: personPageLink(person.rsvp_token),
    host,
    host_name: h?.name || host,
    host_phone: h?.phone ? prettyPhone(h.phone) : "",
    host_email: h?.email || "",
    host_note: h?.note || "",
    _hostLine: hostSmsLine(h),
  };
}

/** The exact text a person receives: first-text intro, message, host line, STOP line. */
export function finalSmsBody(template: string, values: ReturnType<typeof mergeValues>, person: any, host: string) {
  const intro = person.first_sms_sent_at ? "" : complianceIntro(host);
  const tail = (values._hostLine || "") + (person.first_sms_sent_at ? "" : STOP_LINE);
  const room = Math.max(40, 480 - intro.length - tail.length);
  return intro + renderTemplate(template, values).slice(0, room) + tail;
}

/**
 * Runs the guards for a row this caller already claimed, then hands it to the
 * existing pipes. Returns the final status written to the row.
 */
export async function deliverClaimed(args: {
  admin: Admin;
  sendId: string;
  schedule: any;
  person: any;
  channel: "email" | "sms";
  startsAt: Date;
  subject: string | null;
  body: string;
  owners: ReturnType<typeof makeOwnerCache>;
  optedOut: Set<string>;
  dryRun: boolean;
}): Promise<{ status: string; reason: string | null }> {
  const { admin, sendId, schedule: s, person, channel, startsAt, owners, optedOut, dryRun } = args;
  const mark = async (status: string, error?: string | null) => {
    await admin.from("schedule_reminder_sends").update({ status, error: error ?? null }).eq("id", sendId);
    return { status, reason: error ?? null };
  };
  const info = await owners.info(s.owner_user_id);
  const used = owners.smsToday.get(s.owner_user_id) ?? 0;
  const g = guardFor({ schedule: s, person, channel, info, optedOut, smsUsed: used });
  if (g?.reason === "demo") {
    // Nothing is ever sent for demo. Record the real skip reason when there is
    // one, so the demo shows what would really happen.
    const would = guardFor({ schedule: { ...s, is_demo: false }, person, channel, info: { ...info, demo: false }, optedOut, smsUsed: used });
    if (would && would.reason !== "plan_downgraded") return mark(would.status, would.reason);
    return mark("dry_run", "demo");
  }
  if (g) return mark(g.status, g.reason);

  const c = person.contact ?? {};
  const values = mergeValues(s, person, startsAt, info.host);

  if (channel === "email") {
    if (dryRun) return mark("dry_run");
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    const r = await enqueueTransactionalEmailServer({
      templateName: "contact-broadcast",
      recipientEmail: c.email,
      idempotencyKey: `sched-${sendId}`,
      label: "schedule_reminder",
      fromName: info.host,
      templateData: {
        subject: renderTemplate(args.subject || "Reminder: {title}", values),
        body: renderTemplate(args.body, values),
        senderName: info.host,
        ctaUrl: calendarLink(person.rsvp_token),
        ctaLabel: "Add to calendar",
      },
    });
    if (r.ok) {
      const status = r.reason === "demo" ? "blocked" : "sent";
      await admin.from("schedule_reminder_sends").update({ status, error: r.reason ?? null, sent_at: new Date().toISOString() }).eq("id", sendId);
      return { status, reason: r.reason ?? null };
    }
    return mark("failed", r.reason ?? "email_failed");
  }

  const body = finalSmsBody(args.body, values, person, info.host);
  // A dry run counts toward the daily cap too, so it predicts real holds.
  if (dryRun) { owners.smsToday.set(s.owner_user_id, used + 1); return mark("dry_run"); }
  const { data: ob, error: obErr } = await admin
    .from("sms_outbox")
    .insert({ user_id: s.owner_user_id, to_phone: c.phone, guest_name: c.display_name ?? null, body, status: "pending" })
    .select("id")
    .single();
  if (obErr || !ob) return mark("failed", obErr?.message ?? "queue_failed");
  owners.smsToday.set(s.owner_user_id, used + 1);
  await admin
    .from("schedule_reminder_sends")
    .update({ status: "queued", sms_outbox_id: (ob as any).id, sent_at: new Date().toISOString() })
    .eq("id", sendId);
  if (!person.first_sms_sent_at) {
    person.first_sms_sent_at = new Date().toISOString();
    await admin.from("schedule_people").update({ first_sms_sent_at: person.first_sms_sent_at }).eq("id", person.id);
  }
  return { status: "queued", reason: null };
}

const PEOPLE_SELECT = "*, contact:contacts(id,display_name,email,phone,email_opt_out)";

export async function runTick(
  admin: Admin,
  opts: { now?: Date; dryRun?: boolean; ownerUserId?: string } = {},
): Promise<TickResult> {
  const now = opts.now ?? new Date();
  const dryRun = !!opts.dryRun;
  const res: TickResult = { considered: 0, claimed: 0, queued: 0, blocked: 0, held: 0, skipped: 0, welcomes: 0, dryRun };
  const count = (st: string) => {
    if (st === "queued" || st === "sent") res.queued++;
    else if (st === "held") res.held++;
    else if (st !== "dry_run") res.blocked++;
  };

  let sq = admin.from("schedules").select("*").eq("status", "active");
  if (opts.ownerUserId) sq = sq.eq("owner_user_id", opts.ownerUserId);
  const { data: schedules } = await sq;
  if (!schedules?.length) return res;
  const byId = new Map(schedules.map((s: any) => [s.id, s]));
  const ids = [...byId.keys()];

  const [{ data: occs }, { data: steps }, { data: people }] = await Promise.all([
    admin
      .from("schedule_occurrences")
      .select("*")
      .in("schedule_id", ids)
      .in("status", ["scheduled", "moved"])
      .gte("starts_at", new Date(now.getTime() - LATE_WINDOW_MS - 12 * 3_600_000).toISOString())
      .lte("starts_at", new Date(now.getTime() + MAX_LEAD_MS).toISOString()),
    admin.from("schedule_reminder_steps").select("*").in("schedule_id", ids).eq("active", true),
    admin.from("schedule_people").select(PEOPLE_SELECT).in("schedule_id", ids).is("removed_at", null),
  ]);

  const owners = makeOwnerCache(admin, now);
  const optedOut = await loadOptOuts(admin, (people ?? []).map((p: any) => p.contact?.phone));

  // Welcome messages go first, so a welcome due now is out before any reminder.
  for (const s of schedules as any[]) {
    await runWelcome(admin, s, (people ?? []).filter((x: any) => x.schedule_id === s.id), owners, optedOut, now, dryRun, res, count);
  }

  for (const o of occs ?? []) {
    const s: any = byId.get((o as any).schedule_id);
    if (!s) continue;
    const startsAt = new Date((o as any).starts_at);
    for (const st of (steps ?? []).filter((x: any) => x.schedule_id === s.id)) {
      const rawDue = new Date(startsAt.getTime() + (st as any).offset_minutes * 60_000);
      const due = (st as any).channel === "sms" && !(st as any).is_starting_now
        ? quietHoursSendAt(rawDue, startsAt, s.timezone)
        : rawDue;
      if (due > now || due.getTime() < now.getTime() - LATE_WINDOW_MS) continue;

      for (const p of (people ?? []).filter((x: any) => x.schedule_id === s.id)) {
        const person: any = p;
        const channel = (st as any).channel as "email" | "sms";
        if (person.channel !== "both" && person.channel !== channel) continue;
        res.considered++;

        // Reminders that fall before the welcome are recorded as skipped, never sent.
        if (s.welcome_enabled && s.welcome_at && due < new Date(s.welcome_at)) {
          const { data: sk } = await admin
            .from("schedule_reminder_sends")
            .upsert(
              {
                occurrence_id: (o as any).id, person_id: person.id, step_id: (st as any).id, channel,
                owner_user_id: s.owner_user_id, due_at: due.toISOString(), status: "skipped", error: "before_welcome",
              },
              { onConflict: "occurrence_id,person_id,step_id,channel", ignoreDuplicates: true },
            )
            .select("id");
          if ((sk as any)?.[0]?.id) res.skipped++;
          continue;
        }

        const { data: claimed } = await admin
          .from("schedule_reminder_sends")
          .upsert(
            {
              occurrence_id: (o as any).id,
              person_id: person.id,
              step_id: (st as any).id,
              channel,
              owner_user_id: s.owner_user_id,
              due_at: due.toISOString(),
              status: "pending",
            },
            { onConflict: "occurrence_id,person_id,step_id,channel", ignoreDuplicates: true },
          )
          .select("id");
        const sendId = (claimed as any)?.[0]?.id as string | undefined;
        if (!sendId) continue; // already claimed by an earlier or overlapping tick
        res.claimed++;
        const r = await deliverClaimed({
          admin, sendId, schedule: s, person, channel, startsAt,
          subject: (st as any).subject, body: (st as any).body, owners, optedOut, dryRun,
        });
        count(r.status);
      }
    }
  }

  // "Send texts at 8:00 AM" rows from Send now. Claimed by flipping
  // scheduled -> pending, so only one tick ever picks each one up.
  let mq = admin
    .from("schedule_reminder_sends")
    .select("id")
    .eq("kind", "manual")
    .eq("status", "scheduled")
    .lte("due_at", now.toISOString())
    .limit(500);
  if (opts.ownerUserId) mq = mq.eq("owner_user_id", opts.ownerUserId);
  const { data: waiting } = await mq;
  for (const w of waiting ?? []) {
    const { data: got } = await admin
      .from("schedule_reminder_sends")
      .update({ status: "pending" })
      .eq("id", (w as any).id)
      .eq("status", "scheduled")
      .select("id, channel, subject, body, person_id, occurrence_id");
    const row: any = got?.[0];
    if (!row) continue;
    res.claimed++;
    const [{ data: occ }, { data: person }] = await Promise.all([
      admin.from("schedule_occurrences").select("*").eq("id", row.occurrence_id).maybeSingle(),
      admin.from("schedule_people").select(PEOPLE_SELECT).eq("id", row.person_id).maybeSingle(),
    ]);
    const { data: s } = occ ? await admin.from("schedules").select("*").eq("id", (occ as any).schedule_id).maybeSingle() : { data: null };
    if (!occ || !person || !s || (person as any).removed_at || (s as any).status !== "active" || !["scheduled", "moved"].includes((occ as any).status)) {
      await admin.from("schedule_reminder_sends").update({ status: "blocked", error: "no_longer_scheduled" }).eq("id", row.id);
      res.blocked++;
      continue;
    }
    const opt = await loadOptOuts(admin, [(person as any).contact?.phone]);
    const r = await deliverClaimed({
      admin, sendId: row.id, schedule: s, person, channel: row.channel, startsAt: new Date((occ as any).starts_at),
      subject: row.subject, body: row.body, owners, optedOut: opt, dryRun,
    });
    count(r.status);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Welcome message
// ---------------------------------------------------------------------------

export function welcomeChannels(s: any, person: any): ("email" | "sms")[] {
  return (["email", "sms"] as const).filter(
    (ch) => (s.welcome_channel === "both" || s.welcome_channel === ch) && (person.channel === "both" || person.channel === ch),
  );
}

/** The first date on or after the welcome, used for {when} and the history row. */
async function welcomeOccurrence(admin: Admin, s: any) {
  const { data } = await admin
    .from("schedule_occurrences")
    .select("id, starts_at")
    .eq("schedule_id", s.id)
    .in("status", ["scheduled", "moved"])
    .gte("starts_at", s.welcome_at)
    .order("starts_at")
    .limit(1);
  if ((data as any)?.[0]) return (data as any)[0];
  // The first date is past the 90-day window: work it out from the rule and
  // attach the history row to the latest stored date.
  const { data: exRows } = await admin.from("schedule_exceptions").select("*").eq("schedule_id", s.id);
  const from = new Date(s.welcome_at);
  const next = expandOccurrences(s as ScheduleRule, (exRows ?? []) as ScheduleException[], from, new Date(from.getTime() + 400 * 86_400_000))
    .find((o) => o.status !== "skipped");
  const { data: last } = await admin.from("schedule_occurrences").select("id").eq("schedule_id", s.id).order("starts_at", { ascending: false }).limit(1);
  if (!next || !(last as any)?.[0]) return null;
  return { id: (last as any)[0].id, starts_at: next.starts_at.toISOString() };
}

async function runWelcome(
  admin: Admin, s: any, people: any[], owners: ReturnType<typeof makeOwnerCache>, optedOut: Set<string>,
  now: Date, dryRun: boolean, res: TickResult, count: (st: string) => void,
) {
  if (!s.welcome_enabled || !s.welcome_at || !s.welcome_body) return;
  if (new Date(s.welcome_at) > now) return;
  const first = !s.welcome_sent_at;
  if (!first && !s.welcome_late_joiners) return;
  const occ = await welcomeOccurrence(admin, s);
  if (!occ) return;
  const { data: done } = await admin
    .from("schedule_reminder_sends")
    .select("person_id, channel")
    .eq("kind", "welcome")
    .in("person_id", people.map((p) => p.id).concat(["00000000-0000-0000-0000-000000000000"]));
  const have = new Set((done ?? []).map((r: any) => `${r.person_id}:${r.channel}`));
  const quiet = inQuietHours(now, s.timezone);
  for (const person of people) {
    for (const channel of welcomeChannels(s, person)) {
      if (have.has(`${person.id}:${channel}`)) continue;
      // A late joiner's text waits for morning rather than going out at night.
      if (channel === "sms" && quiet && !first) continue;
      res.considered++;
      const { data: ins, error } = await admin
        .from("schedule_reminder_sends")
        .insert({
          occurrence_id: occ.id, person_id: person.id, step_id: null, channel, kind: "welcome",
          owner_user_id: s.owner_user_id, due_at: now.toISOString(), status: "pending",
          subject: channel === "email" ? s.welcome_subject || "Welcome: {title}" : null, body: s.welcome_body,
        })
        .select("id");
      const sendId = (ins as any)?.[0]?.id as string | undefined;
      if (error || !sendId) continue; // unique key: already claimed by another tick
      res.claimed++;
      res.welcomes++;
      const r = await deliverClaimed({
        admin, sendId, schedule: s, person, channel, startsAt: new Date(occ.starts_at),
        subject: s.welcome_subject || "Welcome: {title}", body: s.welcome_body, owners, optedOut, dryRun,
      });
      count(r.status);
    }
  }
  if (first) {
    await admin.from("schedules").update({ welcome_sent_at: now.toISOString() }).eq("id", s.id).is("welcome_sent_at", null);
    s.welcome_sent_at = now.toISOString();
  }
}

/** Automatic reminders that would be due between now and the welcome (next 90 days of dates). */
export async function remindersBeforeWelcome(admin: Admin, s: any, now = new Date()) {
  if (!s.welcome_at) return [];
  const w = new Date(s.welcome_at);
  const [{ data: occs }, { data: steps }] = await Promise.all([
    admin.from("schedule_occurrences").select("id, starts_at").eq("schedule_id", s.id).in("status", ["scheduled", "moved"]).gte("starts_at", now.toISOString()).order("starts_at").limit(20),
    admin.from("schedule_reminder_steps").select("*").eq("schedule_id", s.id).eq("active", true).order("position"),
  ]);
  const out: { channel: string; offset_minutes: number; is_starting_now: boolean; starts_at: string; due_at: string }[] = [];
  for (const o of occs ?? []) {
    const startsAt = new Date((o as any).starts_at);
    for (const st of steps ?? []) {
      const raw = new Date(startsAt.getTime() + (st as any).offset_minutes * 60_000);
      const due = (st as any).channel === "sms" && !(st as any).is_starting_now ? quietHoursSendAt(raw, startsAt, s.timezone) : raw;
      if (due >= now && due < w) out.push({ channel: (st as any).channel, offset_minutes: (st as any).offset_minutes, is_starting_now: !!(st as any).is_starting_now, starts_at: startsAt.toISOString(), due_at: due.toISOString() });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Send now
// ---------------------------------------------------------------------------

/** Fill everything that is the same for everyone; keep per-person fields as tokens. */
export function prefill(tpl: string, s: any, startsAt: Date, host: string): string {
  const map: Record<string, string> = {
    title: s.title || "Our call",
    when: whenLabel(startsAt, s.timezone),
    join: s.join_url || [s.dial_in, s.dial_pin ? `PIN ${s.dial_pin}` : ""].filter(Boolean).join(" ") || s.location || "see the invitation",
    host,
  };
  return tpl.replace(/\{(title|when|join|host)\}/g, (_m, k: string) => map[k] ?? _m);
}

/** The step for this date whose send time is closest to now, per channel. */
function nearestStep(steps: any[], channel: "email" | "sms", startsAt: Date, now: Date) {
  const list = steps.filter((x) => x.channel === channel);
  if (!list.length) return DEFAULT_STEPS.find((x) => x.channel === channel)!;
  return list.reduce((best, x) => {
    const d = Math.abs(startsAt.getTime() + x.offset_minutes * 60_000 - now.getTime());
    const b = Math.abs(startsAt.getTime() + best.offset_minutes * 60_000 - now.getTime());
    return d < b ? x : best;
  });
}

/** Next 8:00 AM in the schedule's zone, from a quiet-hours moment. */
export function nextMorning(now: Date, timezone: string): Date {
  return quietHoursSendAt(now, new Date(now.getTime() + 2 * 86_400_000), timezone);
}

export interface ManualPlanRow {
  personId: string;
  name: string;
  email: { go: boolean; reason: string | null; minutesAgo?: number } | null;
  sms: { go: boolean; reason: string | null; minutesAgo?: number } | null;
}

async function loadForManual(admin: Admin, userClient: any, userId: string, scheduleId: string, occurrenceId: string | null, now: Date) {
  // Ownership is proven through the caller's own client (RLS) before any admin read or write.
  const { data: owned, error } = await userClient.from("schedules").select("id, owner_user_id").eq("id", scheduleId).maybeSingle();
  if (error || !owned || owned.owner_user_id !== userId) throw new Error("Schedule not found.");
  const [{ data: s }, { data: occs }, { data: steps }, { data: people }] = await Promise.all([
    admin.from("schedules").select("*").eq("id", scheduleId).single(),
    admin.from("schedule_occurrences").select("*").eq("schedule_id", scheduleId).in("status", ["scheduled", "moved"]).gte("ends_at", now.toISOString()).order("starts_at").limit(12),
    admin.from("schedule_reminder_steps").select("*").eq("schedule_id", scheduleId).eq("active", true).order("position"),
    admin.from("schedule_people").select(PEOPLE_SELECT).eq("schedule_id", scheduleId).is("removed_at", null).order("created_at"),
  ]);
  const occ = (occs ?? []).find((o: any) => o.id === occurrenceId) ?? (occurrenceId ? null : occs?.[0]);
  if (occurrenceId && !occ) throw new Error("That date is no longer on the schedule.");
  return { s: s as any, occs: (occs ?? []) as any[], occ: occ as any, steps: (steps ?? []) as any[], people: (people ?? []) as any[] };
}

async function recentManual(admin: Admin, occurrenceId: string, now: Date) {
  const { data } = await admin
    .from("schedule_reminder_sends")
    .select("person_id, channel, created_at, status")
    .eq("kind", "manual")
    .eq("occurrence_id", occurrenceId)
    .gt("created_at", new Date(now.getTime() - 10 * 60_000).toISOString())
    .not("status", "in", "(blocked,failed,paused,held)");
  const m = new Map<string, Date>();
  for (const r of data ?? []) m.set(`${(r as any).person_id}:${(r as any).channel}`, new Date((r as any).created_at));
  return m;
}

export async function manualSendPreview(admin: Admin, userClient: any, userId: string, input: {
  scheduleId: string; occurrenceId: string | null; channel: "email" | "sms" | "both"; personIds: string[] | null;
}, now = new Date()) {
  const { s, occs, occ, steps, people } = await loadForManual(admin, userClient, userId, input.scheduleId, input.occurrenceId, now);
  const owners = makeOwnerCache(admin, now);
  const info = await owners.info(s.owner_user_id);
  const dates = occs.map((o) => ({ id: o.id, startsAt: o.starts_at, label: whenLabel(new Date(o.starts_at), s.timezone) }));
  if (!occ) return { dates, occurrenceId: null, rows: [], templates: null, quiet: false, morningAt: null, morningOk: false, demo: s.is_demo || info.demo, entitled: info.entitled, capLeft: null, timezone: s.timezone, samplePerson: null };
  const startsAt = new Date(occ.starts_at);
  const emailStep = nearestStep(steps, "email", startsAt, now);
  const smsStep = nearestStep(steps, "sms", startsAt, now);
  const chosen = input.personIds ? people.filter((p) => input.personIds!.includes(p.id)) : people;
  const optedOut = await loadOptOuts(admin, chosen.map((p) => p.contact?.phone));
  const recent = await recentManual(admin, occ.id, now);
  let used = owners.smsToday.get(s.owner_user_id) ?? 0;
  const rows: ManualPlanRow[] = chosen.map((p) => {
    const name = p.contact?.display_name || p.contact?.email || p.contact?.phone || "Someone";
    const one = (ch: "email" | "sms") => {
      if (input.channel !== "both" && input.channel !== ch) return null;
      if (p.channel !== "both" && p.channel !== ch) return { go: false, reason: ch === "sms" ? "prefers_email" : "prefers_text" };
      const prior = recent.get(`${p.id}:${ch}`);
      if (prior) return { go: false, reason: "already_sent", minutesAgo: Math.max(0, Math.floor((now.getTime() - prior.getTime()) / 60_000)) };
      let g = guardFor({ schedule: s, person: p, channel: ch, info, optedOut, smsUsed: used });
      if (g?.reason === "demo") {
        const would = guardFor({ schedule: { ...s, is_demo: false }, person: p, channel: ch, info: { ...info, demo: false }, optedOut, smsUsed: used });
        if (would && would.reason !== "plan_downgraded") g = would;
      }
      if (g && g.status !== "dry_run") return { go: false, reason: g.reason };
      if (ch === "sms") used++;
      return { go: true, reason: g?.reason ?? null };
    };
    return { personId: p.id, name, email: one("email"), sms: one("sms") };
  });
  const quiet = inQuietHours(now, s.timezone);
  const morning = quiet ? nextMorning(now, s.timezone) : null;
  const first = chosen[0] ?? people[0] ?? null;
  return {
    dates,
    occurrenceId: occ.id as string,
    rows,
    templates: {
      subject: prefill(emailStep.subject || "Reminder: {title}", s, startsAt, info.host),
      emailBody: prefill(emailStep.body, s, startsAt, info.host),
      smsBody: prefill(smsStep.body, s, startsAt, info.host),
    },
    quiet,
    morningAt: morning ? morning.toISOString() : null,
    morningLabel: morning ? whenLabel(morning, s.timezone) : null,
    morningOk: !!morning && morning < startsAt,
    demo: !!(s.is_demo || info.demo),
    entitled: info.entitled,
    capLeft: info.isOwner ? null : Math.max(0, DAILY_SMS_CAP - (owners.smsToday.get(s.owner_user_id) ?? 0)),
    timezone: s.timezone,
    samplePerson: first ? { firstName: firstName(first.contact?.display_name), needsIntro: !first.first_sms_sent_at, host: info.host, calendar: calendarLink(first.rsvp_token) } : null,
  };
}

export interface ManualResultRow {
  personId: string;
  name: string;
  channel: "email" | "sms";
  status: string;
  reason: string | null;
  minutesAgo?: number;
  at?: string | null;
}

export async function manualSend(admin: Admin, userClient: any, userId: string, input: {
  scheduleId: string; occurrenceId: string; channel: "email" | "sms" | "both"; personIds: string[] | null;
  requestId: string; subject: string; emailBody: string; smsBody: string; textsAtMorning: boolean; forceDryRun: boolean;
}, now = new Date()) {
  const { s, occ, people } = await loadForManual(admin, userClient, userId, input.scheduleId, input.occurrenceId, now);
  if (!occ) throw new Error("That date is no longer on the schedule.");
  const startsAt = new Date(occ.starts_at);
  const owners = makeOwnerCache(admin, now);
  const chosen = input.personIds ? people.filter((p) => input.personIds!.includes(p.id)) : people;
  const optedOut = await loadOptOuts(admin, chosen.map((p) => p.contact?.phone));
  const quiet = inQuietHours(now, s.timezone);
  const morning = quiet ? nextMorning(now, s.timezone) : null;
  const dryRun = input.forceDryRun;
  const out: ManualResultRow[] = [];

  for (const p of chosen) {
    const name = p.contact?.display_name || p.contact?.email || p.contact?.phone || "Someone";
    for (const ch of ["email", "sms"] as const) {
      if (input.channel !== "both" && input.channel !== ch) continue;
      if (p.channel !== "both" && p.channel !== ch) continue;
      // Quiet hours apply to everyone, owners included.
      let status = "pending";
      let due = now;
      if (ch === "sms" && quiet) {
        if (!input.textsAtMorning || !morning || morning >= startsAt) {
          out.push({ personId: p.id, name, channel: ch, status: "not_sent", reason: "quiet_hours" });
          continue;
        }
        status = "scheduled";
        due = morning;
      }
      const { data: claim, error } = await admin.rpc("claim_manual_schedule_send", {
        _manual_send_id: input.requestId,
        _occurrence_id: occ.id,
        _person_id: p.id,
        _channel: ch,
        _owner: s.owner_user_id,
        _due_at: due.toISOString(),
        _status: status,
        _subject: ch === "email" ? input.subject : null,
        _body: ch === "email" ? input.emailBody : input.smsBody,
      });
      if (error) throw new Error(error.message);
      const c: any = (claim as any)?.[0];
      if (!c?.is_new && ["blocked", "paused", "held", "dry_run"].includes(c?.prior_status) && c?.prior_error && c.prior_error !== "scheduled_8am") {
        // A skip from a moment ago: report the same reason, add no row.
        out.push({ personId: p.id, name, channel: ch, status: c.prior_status, reason: c.prior_error });
        continue;
      }
      if (!c?.is_new) {
        const mins = Math.max(0, Math.floor((now.getTime() - new Date(c?.prior_at ?? now).getTime()) / 60_000));
        out.push({ personId: p.id, name, channel: ch, status: "already_sent", reason: "already_sent", minutesAgo: mins });
        continue;
      }
      if (status === "scheduled") {
        // Checks still run now so the owner sees problems today; the 8 AM tick runs them again.
        const info = await owners.info(s.owner_user_id);
        const g = guardFor({ schedule: s, person: p, channel: ch, info, optedOut, smsUsed: owners.smsToday.get(s.owner_user_id) ?? 0 });
        if ((g && g.status !== "held") || dryRun) {
          const st = g?.status ?? "dry_run";
          const why = g?.reason ?? "scheduled_8am";
          await admin.from("schedule_reminder_sends").update({ status: st, error: why }).eq("id", c.send_id);
          out.push({ personId: p.id, name, channel: ch, status: st, reason: why, at: due.toISOString() });
        } else {
          out.push({ personId: p.id, name, channel: ch, status: "scheduled", reason: null, at: due.toISOString() });
        }
        continue;
      }
      const r = await deliverClaimed({
        admin, sendId: c.send_id, schedule: s, person: p, channel: ch, startsAt,
        subject: ch === "email" ? input.subject : null,
        body: ch === "email" ? input.emailBody : input.smsBody,
        owners, optedOut, dryRun,
      });
      out.push({ personId: p.id, name, channel: ch, status: r.status, reason: r.reason });
    }
  }
  return { results: out, dateLabel: whenLabel(startsAt, s.timezone) };
}
