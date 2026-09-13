/**
 * THE ONE MODULE THAT FORMATS EVENT DATES AND TIMES.
 *
 * Design principle (adopted product-wide):
 *
 *   An event is a WALL-CLOCK TIME AT A PLACE, not an instant in UTC.
 *   "6:00 PM Saturday" is meaningless without the venue's zone, so every event
 *   carries the host's intended wall clock plus an explicit IANA zone
 *   ("America/New_York"). Raw offsets ("-04:00") are never acceptable: they are
 *   wrong half the year.
 *
 * Rules this module enforces, so no caller can get them wrong:
 *
 *  1. DST is resolved FOR THE EVENT'S OWN DATE in the event's own zone, never
 *     with today's offset. An event 11 months out across a DST boundary is
 *     still correct.
 *  2. In-person event times are NEVER converted to the viewer's zone. A guest
 *     in California opening a New York invite sees "6:00 PM EDT". The zone
 *     label is attached to every rendered time so there is no ambiguity.
 *     Viewer-local conversion exists only for VIRTUAL events, opt-in, through
 *     `viewerLocalLine()`.
 *  3. No other module may call toLocaleDateString / toLocaleTimeString /
 *     Intl.DateTimeFormat on an event date. An ESLint rule fails the build if
 *     it happens (see eslint.config.js, `no-restricted-syntax`).
 *
 * STORAGE CONTRACT
 *   `event.date` is either
 *     - naive wall clock  "2026-08-29T18:00"  = 6:00 PM AT THE VENUE, or
 *     - legacy instant    "2026-11-07T22:30:00.000Z" = a real UTC instant.
 *   `event.timezone` is the venue's IANA zone. When absent we fall back to
 *   DEFAULT_EVENT_TIME_ZONE (US business default) rather than the runtime zone,
 *   because Cloudflare Workers run in UTC and would shift every time.
 */

/** Used when an event has no stored zone. US-based business default. */
export const DEFAULT_EVENT_TIME_ZONE = "America/New_York";

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export type EventWhen = {
  /** Stored value: naive wall clock or legacy ISO instant. */
  date: string;
  /** Venue IANA zone. */
  timezone?: string | null;
};

/** The zone an event's wall clock belongs to. Always a named IANA zone. */
export function eventTimeZone(timezone?: string | null): string {
  const tz = (timezone || "").trim();
  if (!tz) return DEFAULT_EVENT_TIME_ZONE;
  // Reject raw offsets: they are wrong on the other side of a DST change.
  if (/^[+-]\d{2}:?\d{2}$/.test(tz)) return DEFAULT_EVENT_TIME_ZONE;
  return tz;
}

/** The viewer's own device zone. Only used for virtual events. */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_EVENT_TIME_ZONE;
  } catch {
    return DEFAULT_EVENT_TIME_ZONE;
  }
}

type Wall = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInZone(date: Date, timeZone: string): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
  return {
    year: Number(m.year),
    month: Number(m.month),
    day: Number(m.day),
    hour: Number(m.hour) === 24 ? 0 : Number(m.hour),
    minute: Number(m.minute),
    second: Number(m.second),
  };
}

/** True when the stored value is a naive venue wall clock. */
export function isWallClock(value: string): boolean {
  return NAIVE.test((value || "").trim());
}

/**
 * The real UTC instant of an event.
 *
 * A naive wall clock is resolved in the venue's zone USING THE OFFSET IN EFFECT
 * ON THE EVENT'S OWN DATE (the classic two-pass Intl trick), so DST is handled
 * for that date and not for today. A legacy instant already carries its offset.
 */
export function eventInstant(value: string, timezone?: string | null): Date {
  const raw = (value || "").trim();
  if (!isWallClock(raw)) return new Date(raw);
  const tz = eventTimeZone(timezone);
  const asUtc = new Date(raw.length === 16 ? `${raw}:00Z` : `${raw}Z`);
  try {
    // First pass: what clock does `tz` show for that UTC instant?
    const shown = partsInZone(asUtc, tz);
    const shownAsUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second,
    );
    const guess = new Date(asUtc.getTime() + (asUtc.getTime() - shownAsUtc));
    // Second pass: verify, and correct when the first guess landed on the other
    // side of a DST transition (offset differs by an hour around the boundary).
    const check = partsInZone(guess, tz);
    const wanted = wallFromString(raw)!;
    const drift =
      Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute, wanted.second) -
      Date.UTC(check.year, check.month - 1, check.day, check.hour, check.minute, check.second);
    return drift === 0 ? guess : new Date(guess.getTime() + drift);
  } catch {
    return asUtc;
  }
}

function wallFromString(raw: string): Wall | null {
  const m = NAIVE.exec(raw);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] || 0),
  };
}

/**
 * The wall clock the host meant, at the venue. For a naive value this is the
 * stored string verbatim (no conversion at all, so double-conversion is
 * impossible). For a legacy instant it is that instant read in the venue zone.
 */
export function eventWallClock(value: string, timezone?: string | null): Wall | null {
  const raw = (value || "").trim();
  const direct = wallFromString(raw);
  if (direct) return direct;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return partsInZone(d, eventTimeZone(timezone));
  } catch {
    return partsInZone(d, "UTC");
  }
}

/** Short zone label for the event's OWN date, e.g. "EDT", "EST", "GMT+1". */
export function eventZoneLabel(value: string, timezone?: string | null): string {
  const tz = eventTimeZone(timezone);
  try {
    const full = eventInstant(value, timezone).toLocaleString("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    });
    const bits = full.split(" ");
    return bits[bits.length - 1] || tz;
  } catch {
    return tz;
  }
}

// A Date whose UTC fields equal the venue wall clock. Formatting it in UTC
// prints the host's clock verbatim, in any runtime zone.
function wallAsUtcDate(w: Wall): Date {
  return new Date(Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second));
}

function fmtWall(w: Wall, opts: Intl.DateTimeFormatOptions): string {
  return wallAsUtcDate(w).toLocaleString("en-US", { ...opts, timeZone: "UTC" });
}

export type EventDateParts = {
  /** "Aug" */
  month: string;
  /** "29" */
  day: string;
  /** "Saturday, August 29, 2026" */
  long: string;
  /** "Saturday" */
  weekday: string;
  /** "Sat" */
  weekdayShort: string;
  /** "August 29, 2026" */
  dateOnly: string;
  /** "8/29/2026" */
  dateNumeric: string;
  /** "6:00 PM" */
  time: string;
  /** "6:00 PM EDT" — the safe default for guest-facing surfaces. */
  timeWithZone: string;
  /** "EDT" */
  zoneLabel: string;
  /** "Saturday, August 29, 2026 at 6:00 PM EDT" */
  full: string;
  /** "Sat, 8/29/2026, 6:00 PM EDT" */
  compact: string;
  /** The venue IANA zone actually used. */
  timeZone: string;
  /** The real UTC instant, for calendars and countdowns. */
  instant: Date;
};

const EMPTY: EventDateParts = {
  month: "",
  day: "",
  long: "",
  weekday: "",
  weekdayShort: "",
  dateOnly: "",
  dateNumeric: "",
  time: "",
  timeWithZone: "",
  zoneLabel: "",
  full: "",
  compact: "",
  timeZone: DEFAULT_EVENT_TIME_ZONE,
  instant: new Date(NaN),
};

/**
 * THE formatter. Every surface that renders an event date/time calls this
 * (directly, or through one of the thin helpers below).
 */
export function formatEventDate(value: string, timezone?: string | null): EventDateParts {
  const w = eventWallClock(value, timezone);
  if (!w) return EMPTY;
  const tz = eventTimeZone(timezone);
  const label = eventZoneLabel(value, timezone);
  const time = fmtWall(w, { hour: "numeric", minute: "2-digit" });
  const weekday = fmtWall(w, { weekday: "long" });
  const dateOnly = fmtWall(w, { month: "long", day: "numeric", year: "numeric" });
  const dateNumeric = fmtWall(w, { month: "numeric", day: "numeric", year: "numeric" });
  return {
    month: fmtWall(w, { month: "short" }),
    day: fmtWall(w, { day: "2-digit" }),
    long: `${weekday}, ${dateOnly}`,
    weekday,
    weekdayShort: fmtWall(w, { weekday: "short" }),
    dateOnly,
    dateNumeric,
    time,
    timeWithZone: `${time} ${label}`,
    zoneLabel: label,
    full: `${weekday}, ${dateOnly} at ${time} ${label}`,
    compact: `${fmtWall(w, { weekday: "short" })}, ${dateNumeric}, ${time} ${label}`,
    timeZone: tz,
    instant: eventInstant(value, timezone),
  };
}

/** "Saturday, August 29, 2026 at 6:00 PM EDT" */
export function formatEventFull(value: string, timezone?: string | null): string {
  return formatEventDate(value, timezone).full;
}

/** "6:00 PM EDT" */
export function formatEventTime(value: string, timezone?: string | null): string {
  return formatEventDate(value, timezone).timeWithZone;
}

/** "August 29, 2026" */
export function formatEventDateOnly(value: string, timezone?: string | null): string {
  return formatEventDate(value, timezone).dateOnly;
}

/** "8/29/2026" — tables, CSV, exports. */
export function formatEventDateNumeric(value: string, timezone?: string | null): string {
  return formatEventDate(value, timezone).dateNumeric;
}

/** "Sat, 8/29/2026, 6:00 PM EDT" */
export function formatEventCompact(value: string, timezone?: string | null): string {
  return formatEventDate(value, timezone).compact;
}

/** Email / SMS shape: separate date and time lines, time always zone-labeled. */
export function formatEventForMessage(
  value?: string,
  timezone?: string | null,
): { date: string; time: string; timeWithZone: string; full: string } {
  if (!value) return { date: "", time: "", timeWithZone: "", full: "" };
  const p = formatEventDate(value, timezone);
  return { date: p.long, time: p.time, timeWithZone: p.timeWithZone, full: p.full };
}

/**
 * The `datetime-local` round trip for the host builder. Reads and writes the
 * VENUE wall clock, so a host sitting in another zone cannot shift the event.
 */
export function toDateTimeLocalInput(value: string, timezone?: string | null): string {
  const w = eventWallClock(value, timezone);
  if (!w) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${p(w.month)}-${p(w.day)}T${p(w.hour)}:${p(w.minute)}`;
}

/** What the host typed is stored verbatim as the venue wall clock. */
export function fromDateTimeLocalInput(value: string): string {
  return (value || "").slice(0, 16);
}

/**
 * VIRTUAL EVENTS ONLY. For an online event the attendee's own clock is the
 * useful one, so we show the host's zone AND the viewer's. Never called for
 * in-person events. Returns null when the viewer is already in the event zone.
 */
export function viewerLocalLine(
  value: string,
  timezone?: string | null,
  viewer?: string,
): string | null {
  const tz = eventTimeZone(timezone);
  const own = viewer || viewerTimeZone();
  const instant = eventInstant(value, timezone);
  if (Number.isNaN(instant.getTime())) return null;
  let mine: Wall;
  let theirs: Wall;
  try {
    mine = partsInZone(instant, own);
    theirs = partsInZone(instant, tz);
  } catch {
    return null;
  }
  const same =
    mine.year === theirs.year &&
    mine.month === theirs.month &&
    mine.day === theirs.day &&
    mine.hour === theirs.hour &&
    mine.minute === theirs.minute;
  if (same) return null;
  const label = (() => {
    try {
      const full = instant.toLocaleString("en-US", { timeZone: own, timeZoneName: "short" });
      const bits = full.split(" ");
      return bits[bits.length - 1] || own;
    } catch {
      return own;
    }
  })();
  const sameDay =
    mine.year === theirs.year && mine.month === theirs.month && mine.day === theirs.day;
  const stamp = sameDay
    ? fmtWall(mine, { hour: "numeric", minute: "2-digit" })
    : fmtWall(mine, { weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `That is ${stamp} your time (${label})`;
}

/* -------------------------------------------------------------------------- */
/* System timestamps (created_at, sent_at, audit rows).                        */
/*                                                                             */
/* These are genuine instants, not event wall clocks, so they ARE rendered in   */
/* the reader's own zone. They live here so the ESLint guard can ban raw date   */
/* formatting everywhere else.                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Epoch milliseconds must be branded before a formatter will accept them.
 * This makes it a type error to hand a currency amount, a count, or any other
 * plain number to a date formatter (the bug that rendered $0 as 12/31/1969).
 */
export type EpochMillis = number & { readonly __epochMillis: unique symbol };

/** Explicitly mark a number as epoch milliseconds. */
export function epochMillis(ms: number): EpochMillis {
  return ms as EpochMillis;
}

export type StampInput = string | Date | EpochMillis | null | undefined;

function stamp(value: StampInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "8/29/2026, 6:00 PM" in the reader's zone. For audit/activity rows. */
export function formatTimestamp(
  value: StampInput,
  fallback = "—",
): string {
  const d = stamp(value);
  if (!d) return fallback;
  return d.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "8/29/2026" in the reader's zone. */
export function formatStampDate(
  value: StampInput,
  fallback = "—",
): string {
  const d = stamp(value);
  if (!d) return fallback;
  return d.toLocaleString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

/** "August 29, 2026" in the reader's zone. */
export function formatStampLongDate(
  value: StampInput,
  fallback = "—",
): string {
  const d = stamp(value);
  if (!d) return fallback;
  return d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** "6:00 PM" in the reader's zone. */
export function formatStampTime(
  value: StampInput,
  fallback = "—",
): string {
  const d = stamp(value);
  if (!d) return fallback;
  return d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
}
