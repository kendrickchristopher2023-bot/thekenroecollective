// Text replies to Schedules ("1", "YES", "can't make it").
//
// Which list does a reply belong to?
//   1. Find every schedule that texted this number in the last 14 days, and
//      the latest event text to this number for an upcoming event.
//   2. The most recent text wins.
//   3. If the two most recent (schedule vs schedule, or schedule vs event)
//      were sent within 48 hours of each other, it is ambiguous: nothing is
//      recorded and the person gets their personal link instead.
//   4. No schedule text at all: the event flow runs exactly as before.
// Confirmations go through sms_outbox and the shared guards, recorded as a
// "reply" send so they count toward the owner's daily text limit.

import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneKeys } from "@/lib/phone-keys";
import { findEventCandidate, type EventCandidate } from "@/lib/sms-rsvp.server";

type Admin = SupabaseClient<any, any, any>;
type Answer = "yes" | "maybe" | "no";

const LOOKBACK_MS = 14 * 86_400_000;
const AMBIGUOUS_MS = 48 * 3_600_000;
const PEOPLE_SELECT = "*, contact:contacts(id,display_name,email,phone,email_opt_out)";

export type ReplyRoute = "schedule" | "event" | "ambiguous" | "no_date" | "none";

export interface ReplyOutcome {
  route: ReplyRoute;
  /** When route is "event", the caller runs the existing event flow with this candidate. */
  event?: EventCandidate | null;
  scheduleId?: string;
  personId?: string;
  occurrenceId?: string | null;
  recorded?: Answer;
  reply?: string;
  sendStatus?: string;
  reason?: string;
}

interface SchedHit { personId: string; scheduleId: string; at: number; person: any; schedule: any }

async function scheduleHits(admin: Admin, from: string, now: Date): Promise<SchedHit[]> {
  const forms = phoneKeys(from).flatMap((k) => [k, `+${k}`]);
  if (!forms.length) return [];
  const { data: contacts } = await admin.from("contacts").select("id").in("phone_norm", forms).is("merged_into", null).limit(200);
  const cids = (contacts ?? []).map((c: any) => c.id);
  if (!cids.length) return [];
  const { data: people } = await admin.from("schedule_people").select(PEOPLE_SELECT).in("contact_id", cids).is("removed_at", null).limit(200);
  const pids = (people ?? []).map((p: any) => p.id);
  if (!pids.length) return [];
  const { data: sends } = await admin
    .from("schedule_reminder_sends")
    .select("person_id, sent_at")
    .in("person_id", pids)
    .eq("channel", "sms")
    .in("status", ["queued", "sent", "delivered"])
    .gte("sent_at", new Date(now.getTime() - LOOKBACK_MS).toISOString())
    .lte("sent_at", now.toISOString())
    .order("sent_at", { ascending: false })
    .limit(200);
  const latest = new Map<string, number>();
  for (const r of sends ?? []) if (!latest.has((r as any).person_id)) latest.set((r as any).person_id, new Date((r as any).sent_at).getTime());
  const sids = [...new Set((people ?? []).filter((p: any) => latest.has(p.id)).map((p: any) => p.schedule_id))];
  if (!sids.length) return [];
  const { data: scheds } = await admin.from("schedules").select("*").in("id", sids).neq("status", "ended");
  const byId = new Map((scheds ?? []).map((s: any) => [s.id, s]));
  const hits: SchedHit[] = [];
  for (const p of people ?? []) {
    const at = latest.get((p as any).id);
    const s = byId.get((p as any).schedule_id);
    if (at && s) hits.push({ personId: (p as any).id, scheduleId: s.id, at, person: p, schedule: s });
  }
  return hits.sort((a, b) => b.at - a.at);
}

async function latestEventText(admin: Admin, from: string, eventId: string, now: Date): Promise<number | null> {
  const forms = phoneKeys(from).flatMap((k) => [k, `+${k}`]);
  const { data } = await admin
    .from("sms_outbox")
    .select("sent_at, created_at")
    .eq("event_id", eventId)
    .in("to_phone", forms)
    .in("status", ["sent", "delivered"])
    .lte("created_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const r: any = data?.[0];
  return r ? new Date(r.sent_at ?? r.created_at).getTime() : null;
}

/** Pure precedence rule. hits sorted newest first. Exported for unit tests. */
export function decideRoute<H extends { scheduleId: string; at: number }>(hits: H[], hasEvent: boolean, eventAt: number | null) {
  if (!hits.length) return { route: "event" as const, hits };
  const top = hits[0]!;
  const other = hits.find((h) => h.scheduleId !== top.scheduleId);
  if (other && top.at - other.at < AMBIGUOUS_MS) return { route: "ambiguous" as const, hits: [top, other] };
  if (hasEvent && eventAt !== null) {
    if (Math.abs(eventAt - top.at) < AMBIGUOUS_MS) return { route: "ambiguous" as const, hits: [top] };
    if (eventAt > top.at) return { route: "event" as const, hits };
  }
  return { route: "schedule" as const, hits: [top] };
}

/** Decide where a reply goes, without writing anything. */
export async function routeReply(admin: Admin, from: string, now = new Date()) {
  const hits = await scheduleHits(admin, from, now);
  const event = await findEventCandidate(admin, from);
  const eventAt = event ? await latestEventText(admin, from, event.eventId, now) : null;
  return { ...decideRoute(hits, !!event, eventAt), event, eventAt };
}

const WORD: Record<Answer, string> = { yes: "you will attend", maybe: "you may attend", no: "you cannot make" };

export async function handleScheduleReply(admin: Admin, from: string, answer: Answer, now = new Date(), opts: { dryRun?: boolean } = {}): Promise<ReplyOutcome> {
  const engine = await import("@/lib/schedules-engine.server");
  const r = await routeReply(admin, from, now);
  if (r.route === "event") return { route: "event", event: r.event };

  const top = r.hits[0]!;
  const s = top.schedule;
  const person = top.person;
  const link = engine.personPageLink(person.rsvp_token);

  const { data: nextOcc } = await admin
    .from("schedule_occurrences")
    .select("id, starts_at")
    .eq("schedule_id", s.id)
    .in("status", ["scheduled", "moved"])
    .gt("starts_at", now.toISOString())
    .order("starts_at")
    .limit(1);
  let occ: any = nextOcc?.[0] ?? null;

  let body: string;
  let route: ReplyRoute = r.route;
  let recorded: Answer | undefined;
  if (r.route === "ambiguous") {
    const second = r.hits[1];
    body = second
      ? `Thanks. You are on more than one list, so we did not save that. ${s.title}: ${link} ${second.schedule.title}: ${engine.personPageLink(second.person.rsvp_token)}`
      : `Thanks. We texted you about more than one thing, so we did not save that. To answer for ${s.title}, tap ${link}`;
  } else if (!occ) {
    route = "no_date";
    body = `${s.title} has no upcoming date right now, so nothing was saved. Details: ${link}`;
  } else {
    const { error } = await admin.from("schedule_rsvps").upsert(
      { schedule_id: s.id, occurrence_id: occ.id, person_id: person.id, answer, source: "sms", answered_at: now.toISOString() },
      { onConflict: "occurrence_id,person_id" },
    );
    if (error) return { route: "schedule", scheduleId: s.id, personId: person.id, reason: "save_failed" };
    recorded = answer;
    const when = new Date(occ.starts_at).toLocaleDateString("en-US", { timeZone: s.timezone, weekday: "short", month: "short", day: "numeric" });
    body = `Got it, ${WORD[answer]} ${s.title} on ${when}.${answer === "no" ? " No more reminders for that date." : ""} Change: ${link}`;
  }

  // The reply is a send like any other: claimed row, shared guards, one outbox.
  if (!occ) {
    const { data: last } = await admin.from("schedule_occurrences").select("id, starts_at").eq("schedule_id", s.id).order("starts_at", { ascending: false }).limit(1);
    occ = last?.[0] ?? null;
  }
  if (!occ) return { route, scheduleId: s.id, personId: person.id, occurrenceId: null, recorded, reply: body, reason: "no_dates_at_all" };
  const { data: ins, error: insErr } = await admin
    .from("schedule_reminder_sends")
    .insert({ occurrence_id: occ.id, person_id: person.id, step_id: null, channel: "sms", kind: "reply", owner_user_id: s.owner_user_id, due_at: now.toISOString(), status: "pending", body })
    .select("id")
    .single();
  if (insErr || !ins) return { route, scheduleId: s.id, personId: person.id, occurrenceId: occ.id, recorded, reply: body, reason: insErr?.message ?? "claim_failed" };
  const owners = engine.makeOwnerCache(admin, now);
  const optedOut = await engine.loadOptOuts(admin, [person.contact?.phone]);
  const d = await engine.deliverClaimed({
    admin, sendId: (ins as any).id, schedule: s, person, channel: "sms", startsAt: new Date(occ.starts_at),
    subject: null, body, owners, optedOut, dryRun: !!opts.dryRun, plain: true,
  });
  return { route, scheduleId: s.id, personId: person.id, occurrenceId: occ.id, recorded, reply: body, sendStatus: d.status, reason: d.reason ?? undefined };
}
