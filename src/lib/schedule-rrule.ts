// Pure recurrence helpers for Schedules. Shared by the host UI and the engine.
//
// Rules are expanded in "floating" wall-clock time: the wall stamp is treated
// as if it were UTC purely so the rrule library never applies an offset. Each
// resulting wall stamp is then turned into a real instant with eventInstant(),
// which uses the offset in force on that date in the schedule's own zone. That
// is what keeps a 7:00 PM call at 7:00 PM across daylight saving changes.

import { RRule, rrulestr } from "rrule";
import { eventInstant } from "@/lib/datetime";

export type EndsKind = "never" | "on_date" | "count";

export interface ScheduleRule {
  start_local: string; // "YYYY-MM-DDTHH:MM[:SS]"
  timezone: string;
  duration_minutes: number;
  rrule: string | null; // "FREQ=MONTHLY;BYDAY=1SU", no DTSTART
  ends_kind: EndsKind;
  until_local: string | null;
  occurrence_count: number | null;
}

export interface ScheduleException {
  original_local: string;
  action: "skip" | "move";
  new_start_local: string | null;
  new_duration_minutes: number | null;
}

export interface Occurrence {
  occurrence_local: string; // the rule's own slot, "YYYY-MM-DDTHH:MM"
  start_local: string; // after any move
  starts_at: Date;
  ends_at: Date;
  status: "scheduled" | "skipped" | "moved";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Trim any seconds/offset and return "YYYY-MM-DDTHH:MM". */
export function wallStamp(value: string): string {
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) throw new Error(`Bad wall-clock value: ${value}`);
  return `${m[1]}T${m[2]}:${m[3]}`;
}

function floatingDate(stamp: string): Date {
  return new Date(`${wallStamp(stamp)}:00Z`);
}

function stampFromFloating(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}`;
}

function icsFloating(stamp: string): string {
  return wallStamp(stamp).replace(/[-:]/g, "") + "00";
}

/** The RRULE line with UNTIL / COUNT applied, or null for a one-time schedule. */
export function fullRule(s: ScheduleRule): string | null {
  if (!s.rrule) return null;
  const parts = s.rrule
    .replace(/^RRULE:/i, "")
    .split(";")
    .filter((p) => p && !/^(UNTIL|COUNT|DTSTART)=/i.test(p));
  if (s.ends_kind === "count" && s.occurrence_count) parts.push(`COUNT=${s.occurrence_count}`);
  if (s.ends_kind === "on_date" && s.until_local) {
    // UNTIL in floating form, inclusive through the end of that day.
    parts.push(`UNTIL=${wallStamp(s.until_local).slice(0, 10).replace(/-/g, "")}T235959Z`);
  }
  return parts.join(";");
}

/** Every rule slot (floating wall stamps) inside a floating window. */
function slotsBetween(s: ScheduleRule, fromFloat: Date, toFloat: Date): string[] {
  const start = floatingDate(s.start_local);
  const rule = fullRule(s);
  if (!rule) {
    return start >= fromFloat && start <= toFloat ? [wallStamp(s.start_local)] : [];
  }
  const rr = rrulestr(`DTSTART:${icsFloating(s.start_local)}Z\nRRULE:${rule}`) as RRule;
  return rr.between(fromFloat, toFloat, true).map(stampFromFloating);
}

/**
 * Occurrences whose rule slot falls inside [from, to] (real instants), with
 * exceptions applied. Skipped slots are returned with status "skipped" so the
 * UI can show them and the engine can ignore them.
 */
export function expandOccurrences(
  s: ScheduleRule,
  exceptions: ScheduleException[],
  from: Date,
  to: Date,
): Occurrence[] {
  // Widen by two days in floating space, then filter on the real instant.
  const day = 86_400_000;
  const slots = slotsBetween(s, new Date(from.getTime() - 2 * day), new Date(to.getTime() + 2 * day));
  const byOriginal = new Map(exceptions.map((e) => [wallStamp(e.original_local), e]));
  const out: Occurrence[] = [];
  for (const slot of slots) {
    const slotInstant = eventInstant(slot, s.timezone);
    if (slotInstant < from || slotInstant > to) continue;
    const ex = byOriginal.get(slot);
    let startLocal = slot;
    let duration = s.duration_minutes;
    let status: Occurrence["status"] = "scheduled";
    if (ex?.action === "skip") status = "skipped";
    if (ex?.action === "move" && ex.new_start_local) {
      startLocal = wallStamp(ex.new_start_local);
      duration = ex.new_duration_minutes ?? duration;
      status = "moved";
    }
    const startsAt = eventInstant(startLocal, s.timezone);
    out.push({
      occurrence_local: slot,
      start_local: startLocal,
      starts_at: startsAt,
      ends_at: new Date(startsAt.getTime() + duration * 60_000),
      status,
    });
  }
  return out;
}

/** Next N not-skipped occurrences from `now`. */
export function nextOccurrences(
  s: ScheduleRule,
  exceptions: ScheduleException[],
  n: number,
  now: Date = new Date(),
): Occurrence[] {
  const out: Occurrence[] = [];
  let from = now;
  for (let i = 0; i < 12 && out.length < n; i++) {
    const to = new Date(from.getTime() + 400 * 86_400_000);
    for (const o of expandOccurrences(s, exceptions, from, to)) {
      if (o.status !== "skipped" && o.ends_at > now && !out.some((x) => x.occurrence_local === o.occurrence_local)) out.push(o);
      if (out.length >= n) break;
    }
    from = to;
    if (!s.rrule) break;
  }
  return out;
}

// ---------- Builder used by the form ----------

export type RepeatKind =
  | "none"
  | "daily"
  | "weekly"
  | "monthly_date"
  | "monthly_position"
  | "quarterly"
  | "yearly";

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface RepeatInput {
  kind: RepeatKind;
  interval: number; // every N days/weeks/months/years
  weekdays: Weekday[];
  monthDay: number; // 1..31, or -1 for last day
  position: number; // 1..4 or -1 for last
  positionDay: Weekday;
}

export function buildRrule(r: RepeatInput): string | null {
  const every = Math.max(1, Math.floor(r.interval || 1));
  const iv = every > 1 ? `;INTERVAL=${every}` : "";
  switch (r.kind) {
    case "none":
      return null;
    case "daily":
      return `FREQ=DAILY${iv}`;
    case "weekly":
      return `FREQ=WEEKLY${iv}${r.weekdays.length ? `;BYDAY=${r.weekdays.join(",")}` : ""}`;
    case "monthly_date":
      return `FREQ=MONTHLY${iv};BYMONTHDAY=${r.monthDay}`;
    case "monthly_position":
      return `FREQ=MONTHLY${iv};BYDAY=${r.position}${r.positionDay}`;
    case "quarterly":
      return `FREQ=MONTHLY;INTERVAL=${3 * every};BYMONTHDAY=${r.monthDay}`;
    case "yearly":
      return `FREQ=YEARLY${iv}`;
  }
}

const DAY_NAMES: Record<Weekday, string> = {
  MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday", SU: "Sunday",
};
const ORD: Record<string, string> = { "1": "1st", "2": "2nd", "3": "3rd", "4": "4th", "5": "5th", "-1": "last" };

/** Plain-English summary, e.g. "Every month on the 1st Sunday". */
export function describeRule(rule: string | null): string {
  if (!rule) return "One time";
  const p = Object.fromEntries(rule.split(";").map((kv) => kv.split("=") as [string, string]));
  const n = Number(p.INTERVAL || 1);
  if (p.FREQ === "DAILY") return n === 1 ? "Every day" : `Every ${n} days`;
  if (p.FREQ === "WEEKLY") {
    const days = (p.BYDAY || "").split(",").filter(Boolean).map((d) => DAY_NAMES[d as Weekday]);
    const base = n === 1 ? "Every week" : `Every ${n} weeks`;
    return days.length ? `${base} on ${days.join(", ")}` : base;
  }
  if (p.FREQ === "MONTHLY") {
    const base = n === 1 ? "Every month" : n === 3 ? "Every quarter" : `Every ${n} months`;
    if (p.BYMONTHDAY) return p.BYMONTHDAY === "-1" ? `${base} on the last day` : `${base} on the ${ordinal(Number(p.BYMONTHDAY))}`;
    const m = (p.BYDAY || "").match(/^(-?\d)([A-Z]{2})$/);
    if (m) return `${base} on the ${ORD[m[1]!] ?? m[1]} ${DAY_NAMES[m[2] as Weekday]}`;
    return base;
  }
  if (p.FREQ === "YEARLY") return n === 1 ? "Every year" : `Every ${n} years`;
  return "Repeats";
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]!);
}

/** Parse a stored rule back into form state. */
export function parseRepeat(rule: string | null, startLocal: string): RepeatInput {
  const d = floatingDate(startLocal);
  const dayCode = WEEKDAYS[(d.getUTCDay() + 6) % 7]!;
  const base: RepeatInput = {
    kind: "none",
    interval: 1,
    weekdays: [dayCode],
    monthDay: d.getUTCDate(),
    position: Math.min(4, Math.ceil(d.getUTCDate() / 7)),
    positionDay: dayCode,
  };
  if (!rule) return base;
  const p = Object.fromEntries(rule.split(";").map((kv) => kv.split("=") as [string, string]));
  const n = Number(p.INTERVAL || 1);
  if (p.FREQ === "DAILY") return { ...base, kind: "daily", interval: n };
  if (p.FREQ === "WEEKLY")
    return { ...base, kind: "weekly", interval: n, weekdays: (p.BYDAY || dayCode).split(",") as Weekday[] };
  if (p.FREQ === "YEARLY") return { ...base, kind: "yearly", interval: n };
  if (p.FREQ === "MONTHLY") {
    if (p.BYMONTHDAY) {
      if (n % 3 === 0 && n >= 3) return { ...base, kind: "quarterly", interval: n / 3, monthDay: Number(p.BYMONTHDAY) };
      return { ...base, kind: "monthly_date", interval: n, monthDay: Number(p.BYMONTHDAY) };
    }
    const m = (p.BYDAY || "").match(/^(-?\d)([A-Z]{2})$/);
    if (m) return { ...base, kind: "monthly_position", interval: n, position: Number(m[1]), positionDay: m[2] as Weekday };
  }
  return base;
}

// ---------- Calendar file ----------

export function buildScheduleIcs(opts: {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  schedule: ScheduleRule;
  exceptions: ScheduleException[];
}): string {
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const tz = opts.schedule.timezone;
  const endStamp = (startLocal: string, minutes: number) =>
    stampFromFloating(new Date(floatingDate(startLocal).getTime() + minutes * 60_000));
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//The Kenroe Collective//Schedules//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  const common = (startLocal: string, minutes: number) => [
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${tz}:${icsFloating(startLocal)}`,
    `DTEND;TZID=${tz}:${icsFloating(endStamp(startLocal, minutes))}`,
    `SUMMARY:${esc(opts.title)}`,
    ...(opts.description ? [`DESCRIPTION:${esc(opts.description)}`] : []),
    ...(opts.location ? [`LOCATION:${esc(opts.location)}`] : []),
    ...(opts.url ? [`URL:${opts.url}`] : []),
  ];
  lines.push("BEGIN:VEVENT", `UID:${opts.uid}`, ...common(opts.schedule.start_local, opts.schedule.duration_minutes));
  const rule = fullRule(opts.schedule);
  if (rule) lines.push(`RRULE:${rule}`);
  for (const ex of opts.exceptions) {
    if (ex.action === "skip") lines.push(`EXDATE;TZID=${tz}:${icsFloating(ex.original_local)}`);
  }
  lines.push("END:VEVENT");
  for (const ex of opts.exceptions) {
    if (ex.action !== "move" || !ex.new_start_local) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${opts.uid}`,
      `RECURRENCE-ID;TZID=${tz}:${icsFloating(ex.original_local)}`,
      ...common(ex.new_start_local, ex.new_duration_minutes ?? opts.schedule.duration_minutes),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function googleCalendarUrl(opts: {
  title: string;
  details?: string | null;
  location?: string | null;
  schedule: ScheduleRule;
}): string {
  const s = opts.schedule;
  const start = icsFloating(s.start_local);
  const end = icsFloating(stampFromFloating(new Date(floatingDate(s.start_local).getTime() + s.duration_minutes * 60_000)));
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${start}/${end}`,
    ctz: s.timezone,
  });
  if (opts.details) params.set("details", opts.details);
  if (opts.location) params.set("location", opts.location);
  const rule = fullRule(s);
  if (rule) params.set("recur", `RRULE:${rule}`);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Warning text when a monthly-by-date rule skips short months (29th to 31st). */
export function monthDayWarning(monthDay: number): string | null {
  if (monthDay < 29) return null;
  return `Months without a ${ordinal(monthDay)} are skipped. Choose "Last day of the month" to never miss one.`;
}
