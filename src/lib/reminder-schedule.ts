// When a ticked event reminder actually goes out.
//
// One rule, one place, shared by the host UI and the cron worker so the label a
// host reads is computed by the same code that sends:
//
//   A preset with N days fires at the host's chosen local time (default 9:00 AM)
//   in the EVENT'S OWN time zone, on the calendar day that is N days before the
//   event's own calendar day. "Day of the event" (N = 0) therefore means the
//   morning of, never midnight.
//
// Every instant is resolved with eventInstant(), which uses the UTC offset in
// effect on that date in that zone, so a reminder for an event on the far side
// of a daylight-saving change still lands at the intended local time.
//
// Early-morning events: a 7:00 AM breakfast cannot be reminded about at 9:00 AM
// the same morning, and pulling the send back to 5:30 AM would be worse than
// useless. Instead the send moves to 6:00 PM the previous evening, which is when
// a guest can still act on it.

import { eventInstant, eventWallClock, eventTimeZone } from "@/lib/datetime";

/** Default local hour, in the event's zone, that a scheduled reminder fires at. */
export const REMINDER_SEND_HOUR = 9;

/** Default send time for every preset, as "HH:MM" event-local. */
export const DEFAULT_REMINDER_TIME = "09:00";

/** Where an impossible early-event reminder moves to, the evening before. */
export const EARLY_FALLBACK_TIME = "18:00";

/** Latest a reminder may be: this many ms before the event starts. */
const MIN_LEAD_MS = 90 * 60 * 1000;

/** Per-preset send times, keyed by preset id ("1d", "dayof", ...). */
export type ReminderTimes = Record<string, string>;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Accepts "9:00", "09:00", "18:5"; returns a normalised "HH:MM" or null. */
export function normalizeReminderTime(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** The chosen time for one preset, falling back to the 9:00 AM default. */
export function reminderTimeFor(
  presetId: string,
  times: ReminderTimes | null | undefined,
): string {
  return normalizeReminderTime(times?.[presetId]) ?? DEFAULT_REMINDER_TIME;
}

/** "9:00 AM" / "6:00 PM" for a stored "HH:MM", with no zone attached. */
export function clockLabel(time: string): string {
  const norm = normalizeReminderTime(time) ?? DEFAULT_REMINDER_TIME;
  const [h, m] = norm.split(":").map(Number);
  const suffix = h! >= 12 ? "PM" : "AM";
  const hour12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour12}:${pad(m!)} ${suffix}`;
}

export type ReminderAdjustment = "none" | "early_event";

export interface ResolvedReminderSend {
  /** The instant the reminder will actually fire, after any adjustment. */
  at: Date | null;
  /** The instant the host's chosen time would have produced. */
  requestedAt: Date | null;
  /** Why `at` differs from `requestedAt`. */
  adjustment: ReminderAdjustment;
  /** True when the resolved moment has already passed. */
  past: boolean;
  /** The event's own start instant, for warning copy. */
  eventStart: Date | null;
}

/** The local wall stamp N days before the event's own calendar day, at `time`. */
function localStamp(
  eventDate: string,
  timezone: string | null | undefined,
  daysBefore: number,
  time: string,
): string | null {
  const wall = eventWallClock(eventDate, timezone);
  if (!wall) return null;
  const anchor = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  anchor.setUTCDate(anchor.getUTCDate() - daysBefore);
  return `${anchor.getUTCFullYear()}-${pad(anchor.getUTCMonth() + 1)}-${pad(
    anchor.getUTCDate(),
  )}T${time}`;
}

/**
 * Full resolution for one preset: the requested moment, the moment that will
 * actually be used, why they differ, and whether it is already in the past.
 */
export function resolveReminderSend(
  eventDate: string | undefined,
  timezone: string | null | undefined,
  daysBefore: number,
  time: string = DEFAULT_REMINDER_TIME,
  now: Date = new Date(),
): ResolvedReminderSend {
  const empty: ResolvedReminderSend = {
    at: null,
    requestedAt: null,
    adjustment: "none",
    past: false,
    eventStart: null,
  };
  if (!eventDate) return empty;

  const start = eventInstant(eventDate, timezone);
  if (Number.isNaN(start.getTime())) return empty;

  const chosen = normalizeReminderTime(time) ?? DEFAULT_REMINDER_TIME;
  const stamp = localStamp(eventDate, timezone, daysBefore, chosen);
  if (!stamp) return { ...empty, eventStart: start };
  const requestedAt = eventInstant(stamp, timezone);
  if (Number.isNaN(requestedAt.getTime())) return { ...empty, eventStart: start };

  const latest = start.getTime() - MIN_LEAD_MS;
  let at = requestedAt;
  let adjustment: ReminderAdjustment = "none";

  if (requestedAt.getTime() > latest) {
    // The chosen time lands too close to (or after) the party. Move to 6:00 PM
    // the previous event-local evening, which is a time a guest can act on.
    const eveningStamp = localStamp(eventDate, timezone, daysBefore + 1, EARLY_FALLBACK_TIME);
    const evening = eveningStamp ? eventInstant(eveningStamp, timezone) : null;
    if (evening && !Number.isNaN(evening.getTime()) && evening.getTime() <= latest) {
      at = evening;
    } else {
      at = new Date(latest);
    }
    adjustment = "early_event";
  }

  return {
    at,
    requestedAt,
    adjustment,
    past: at.getTime() <= now.getTime(),
    eventStart: start,
  };
}

/**
 * The exact instant a preset fires for an event, or null when the event has no
 * usable date.
 */
export function scheduledReminderInstant(
  eventDate: string | undefined,
  timezone: string | null | undefined,
  daysBefore: number,
  time: string = DEFAULT_REMINDER_TIME,
): Date | null {
  return resolveReminderSend(eventDate, timezone, daysBefore, time).at;
}

/** "9:00 AM EDT" for the event's zone, for the checkbox labels. */
export function reminderTimeLabel(
  eventDate: string | undefined,
  timezone: string | null | undefined,
  daysBefore: number,
  time: string = DEFAULT_REMINDER_TIME,
): string {
  const at = scheduledReminderInstant(eventDate, timezone, daysBefore, time);
  if (!at) return "";
  return `${instantClockLabel(at, timezone)} ${zoneLabel(at, timezone)}`;
}

/** Clock time of an instant, read in the event's zone. */
export function instantClockLabel(at: Date, timezone: string | null | undefined): string {
  return at.toLocaleTimeString("en-US", {
    timeZone: eventTimeZone(timezone),
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Zone abbreviation for an instant. The label belongs to the SEND date, not the
 * event date: a reminder in February for an August event is EST, even though
 * the party itself is EDT.
 */
export function zoneLabel(at: Date, timezone: string | null | undefined): string {
  const tz = eventTimeZone(timezone);
  const bits = at.toLocaleString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ");
  return bits[bits.length - 1] || tz;
}

/** "Fri, Aug 28 at 9:00 AM EDT" — the full scheduled moment, event-local. */
export function reminderWhenLabel(
  eventDate: string | undefined,
  timezone: string | null | undefined,
  daysBefore: number,
  time: string = DEFAULT_REMINDER_TIME,
): string {
  const at = scheduledReminderInstant(eventDate, timezone, daysBefore, time);
  if (!at) return "";
  return instantWhenLabel(at, timezone);
}

/** "Fri, Aug 28 at 9:00 AM EDT" for an already-resolved instant. */
export function instantWhenLabel(at: Date, timezone: string | null | undefined): string {
  const day = at.toLocaleDateString("en-US", {
    timeZone: eventTimeZone(timezone),
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${day} at ${instantClockLabel(at, timezone)} ${zoneLabel(at, timezone)}`;
}

/**
 * Host-facing warning for a preset whose chosen time cannot be used, or whose
 * moment has already passed. Returns null when the schedule is fine.
 */
export function reminderWarning(
  eventDate: string | undefined,
  timezone: string | null | undefined,
  daysBefore: number,
  time: string = DEFAULT_REMINDER_TIME,
  now: Date = new Date(),
): string | null {
  const r = resolveReminderSend(eventDate, timezone, daysBefore, time, now);
  if (!r.at) return null;
  if (r.adjustment === "early_event" && r.eventStart) {
    return `Your event starts at ${instantClockLabel(r.eventStart, timezone)} ${zoneLabel(
      r.eventStart,
      timezone,
    )} — a ${clockLabel(time)} reminder would arrive after it begins. This one will send ${instantWhenLabel(
      r.at,
      timezone,
    )} instead.`;
  }
  if (r.past) {
    return `That moment (${instantWhenLabel(r.at, timezone)}) has already passed, so this reminder can't be scheduled. Pick a later reminder, or send one now.`;
  }
  return null;
}

/**
 * Whole calendar days between today and the event, both read in the event's own
 * zone, so "tomorrow" means tomorrow at the venue.
 */
export function calendarDaysUntilEvent(
  eventDate: string | undefined,
  timezone: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!eventDate) return null;
  const wall = eventWallClock(eventDate, timezone);
  if (!wall) return null;
  const tz = eventTimeZone(timezone);
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [ty, tm, td] = todayParts.split("-").map(Number);
  const a = Date.UTC(wall.year, wall.month - 1, wall.day);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((a - b) / 86_400_000);
}
