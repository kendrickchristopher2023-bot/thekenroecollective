// Pure message helpers for Schedules: default reminder plan, merge fields,
// quiet hours and the first-text compliance line. Shared by UI and engine.

import { eventTimeZone } from "@/lib/datetime";

export interface StepDraft {
  offset_minutes: number;
  channel: "email" | "sms";
  is_starting_now: boolean;
  subject: string | null;
  body: string;
  position: number;
}

export const MERGE_FIELDS = ["first_name", "title", "when", "join", "calendar", "host"] as const;

export const DEFAULT_STEPS: StepDraft[] = [
  {
    offset_minutes: -7 * 24 * 60,
    channel: "email",
    is_starting_now: false,
    subject: "Coming up next week: {title}",
    body: "Hi {first_name},\n\nA reminder that {title} is {when}.\n\nJoin: {join}\n\nAdd it to your calendar: {calendar}\n\nSee you there,\n{host}",
    position: 0,
  },
  { offset_minutes: -24 * 60, channel: "sms", is_starting_now: false, subject: null, body: "Hi {first_name}, {title} is tomorrow, {when}. Join: {join}", position: 1 },
  { offset_minutes: -60, channel: "sms", is_starting_now: false, subject: null, body: "{title} starts in 1 hour ({when}). Join: {join}", position: 2 },
  { offset_minutes: 0, channel: "sms", is_starting_now: true, subject: null, body: "{title} is starting now. Join: {join}", position: 3 },
];

export interface MergeValues {
  first_name?: string | null;
  title?: string | null;
  when?: string | null;
  join?: string | null;
  calendar?: string | null;
  host?: string | null;
}

export function renderTemplate(tpl: string, v: MergeValues): string {
  const map: Record<string, string> = {
    first_name: (v.first_name || "there").trim(),
    title: (v.title || "Our call").trim(),
    when: (v.when || "").trim(),
    join: (v.join || "see the invitation").trim(),
    calendar: (v.calendar || "").trim(),
    host: (v.host || "").trim(),
  };
  return tpl.replace(/\{(first_name|title|when|join|calendar|host)\}/g, (_m, k: string) => map[k] ?? _m);
}

export function firstName(displayName: string | null | undefined): string {
  return String(displayName ?? "").trim().split(/\s+/)[0] || "there";
}

/** "Sun, Oct 4 at 7:00 PM EDT", always in the schedule's own zone. */
export function whenLabel(at: Date, timezone: string): string {
  const tz = eventTimeZone(timezone);
  const day = at.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const time = at.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const zone = at.toLocaleString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop();
  return `${day} at ${time} ${zone}`;
}

/** "1 week before", "1 day before", "Starting now". */
export function offsetLabel(minutes: number, startingNow = false): string {
  if (startingNow || minutes === 0) return "Starting now";
  const m = Math.abs(minutes);
  if (m % (7 * 1440) === 0) return `${m / (7 * 1440)} week${m === 7 * 1440 ? "" : "s"} before`;
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? "" : "s"} before`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"} before`;
  return `${m} minutes before`;
}

function localHour(at: Date, tz: string): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  return { h: Number(parts.find((p) => p.type === "hour")?.value), m: Number(parts.find((p) => p.type === "minute")?.value) };
}

/** Is this instant inside 9 PM to 8 AM in the zone? */
export function inQuietHours(at: Date, timezone: string): boolean {
  const { h } = localHour(at, eventTimeZone(timezone));
  return h >= 21 || h < 8;
}

/**
 * Where a quiet-hours text moves to: the next 8:00 AM local, or 8:59 PM the
 * evening before if 8:00 AM would be at or after the start. Never dropped.
 */
export function quietHoursSendAt(due: Date, startsAt: Date, timezone: string): Date {
  if (!inQuietHours(due, timezone)) return due;
  const tz = eventTimeZone(timezone);
  // Walk forward minute-blocks to the next 8:00 local (at most 11 hours).
  let t = new Date(Math.ceil(due.getTime() / 60_000) * 60_000);
  for (let i = 0; i < 12 * 60 && inQuietHours(t, tz); i++) t = new Date(t.getTime() + 60_000);
  if (t < startsAt) return t;
  // Otherwise step back from `due` to 8:59 PM local.
  let b = new Date(Math.floor(due.getTime() / 60_000) * 60_000);
  for (let i = 0; i < 12 * 60 && inQuietHours(b, tz); i++) b = new Date(b.getTime() - 60_000);
  return b;
}

export const DAILY_SMS_CAP = 200;

export function complianceIntro(hostName: string): string {
  return `Kenroe reminders from ${hostName || "your host"}: `;
}
export const STOP_LINE = " Reply STOP to opt out.";

const GSM = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

/** Characters and text segments, the way carriers count them. */
export function smsSegments(text: string): { chars: number; segments: number; unicode: boolean } {
  const unicode = !GSM.test(text);
  const chars = [...text].length;
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi);
  return { chars, segments, unicode };
}
