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
  dryRun: boolean;
}

export async function runTick(
  admin: Admin,
  opts: { now?: Date; dryRun?: boolean; ownerUserId?: string } = {},
): Promise<TickResult> {
  const now = opts.now ?? new Date();
  const dryRun = !!opts.dryRun;
  const res: TickResult = { considered: 0, claimed: 0, queued: 0, blocked: 0, held: 0, dryRun };

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
    admin.from("schedule_reminder_steps").select("*").in("schedule_id", ids),
    admin
      .from("schedule_people")
      .select("*, contact:contacts(id,display_name,email,phone,email_opt_out)")
      .in("schedule_id", ids)
      .is("removed_at", null),
  ]);

  const entitled = new Map<string, boolean>();
  const demoOwner = new Map<string, boolean>();
  const hostNames = new Map<string, string>();
  const smsToday = new Map<string, number>();
  const isOwnerRole = new Map<string, boolean>();

  async function ownerInfo(uid: string) {
    if (!entitled.has(uid)) {
      const [{ data: can }, { data: demo }, { data: prof }, { data: own }] = await Promise.all([
        admin.rpc("can_use_schedules", { _uid: uid }),
        admin.rpc("is_demo_user", { _user_id: uid }),
        admin.from("profiles").select("display_name").eq("id", uid).maybeSingle(),
        admin.rpc("has_role", { _user_id: uid, _role: "owner" }),
      ]);
      entitled.set(uid, can === true);
      demoOwner.set(uid, demo === true);
      hostNames.set(uid, ((prof as any)?.display_name as string) || "your host");
      isOwnerRole.set(uid, own === true);
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
    return {
      entitled: entitled.get(uid)!,
      demo: demoOwner.get(uid)!,
      host: hostNames.get(uid)!,
      isOwner: isOwnerRole.get(uid)!,
    };
  }

  // Opt-out lookup, every stored form of every number.
  const allPhones = new Set<string>();
  for (const p of people ?? []) {
    const ph = (p as any).contact?.phone as string | null;
    if (ph) for (const k of phoneKeys(ph)) { allPhones.add(k); allPhones.add(`+${k}`); }
  }
  const optedOut = new Set<string>();
  if (allPhones.size) {
    const { data: opt } = await admin.from("sms_consent_log").select("phone_number,opted_out").in("phone_number", [...allPhones]);
    for (const r of opt ?? []) if ((r as any).opted_out) optedOut.add(canonicalPhone((r as any).phone_number));
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

        const mark = async (status: string, error?: string) => {
          await admin.from("schedule_reminder_sends").update({ status, error: error ?? null }).eq("id", sendId);
          if (status === "held") res.held++;
          else if (status !== "queued" && status !== "dry_run") res.blocked++;
        };

        const info = await ownerInfo(s.owner_user_id);
        const c = person.contact ?? {};
        if (s.is_demo || info.demo) { await mark("blocked", "demo"); continue; }
        if (!info.entitled) { await mark("paused", "plan_downgraded"); continue; }
        if (person.paused) { await mark("paused", "person_paused"); continue; }

        const values = {
          first_name: firstName(c.display_name),
          title: s.title,
          when: whenLabel(startsAt, s.timezone),
          join: s.join_url || [s.dial_in, s.dial_pin ? `PIN ${s.dial_pin}` : ""].filter(Boolean).join(" ") || s.location,
          calendar: calendarLink(person.rsvp_token),
          host: info.host,
        };

        if (channel === "email") {
          if (!c.email) { await mark("blocked", "no_email"); continue; }
          if (c.email_opt_out) { await mark("blocked", "email_opt_out"); continue; }
          if (dryRun) { await mark("dry_run"); continue; }
          const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
          const r = await enqueueTransactionalEmailServer({
            templateName: "contact-broadcast",
            recipientEmail: c.email,
            idempotencyKey: `sched-${sendId}`,
            label: "schedule_reminder",
            fromName: info.host,
            templateData: {
              subject: renderTemplate((st as any).subject || "Reminder: {title}", values),
              body: renderTemplate((st as any).body, values),
              senderName: info.host,
              ctaUrl: calendarLink(person.rsvp_token),
              ctaLabel: "Add to calendar",
            },
          });
          if (r.ok) {
            await admin.from("schedule_reminder_sends").update({ status: r.reason === "demo" ? "blocked" : "sent", error: r.reason ?? null, sent_at: new Date().toISOString() }).eq("id", sendId);
            res.queued++;
          } else await mark("failed", r.reason ?? "email_failed");
          continue;
        }

        // SMS
        if (!c.phone) { await mark("blocked", "no_phone"); continue; }
        if (!person.sms_consent_at) { await mark("blocked", "no_text_consent"); continue; }
        if (optedOut.has(canonicalPhone(c.phone))) { await mark("blocked", "opted_out"); continue; }
        const used = smsToday.get(s.owner_user_id) ?? 0;
        if (!info.isOwner && used >= DAILY_SMS_CAP) { await mark("held", "daily_text_limit"); continue; }
        let body = renderTemplate((st as any).body, values);
        if (!person.first_sms_sent_at) body = complianceIntro(info.host) + body + STOP_LINE;
        body = body.slice(0, 480);
        if (dryRun) { await mark("dry_run"); continue; }
        const { data: ob, error: obErr } = await admin
          .from("sms_outbox")
          .insert({ user_id: s.owner_user_id, to_phone: c.phone, guest_name: c.display_name ?? null, body, status: "pending" })
          .select("id")
          .single();
        if (obErr || !ob) { await mark("failed", obErr?.message ?? "queue_failed"); continue; }
        smsToday.set(s.owner_user_id, used + 1);
        await admin
          .from("schedule_reminder_sends")
          .update({ status: "queued", sms_outbox_id: (ob as any).id, sent_at: new Date().toISOString() })
          .eq("id", sendId);
        if (!person.first_sms_sent_at) {
          person.first_sms_sent_at = new Date().toISOString();
          await admin.from("schedule_people").update({ first_sms_sent_at: person.first_sms_sent_at }).eq("id", person.id);
        }
        res.queued++;
      }
    }
  }
  return res;
}
