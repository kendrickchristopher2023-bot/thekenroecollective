/**
 * Client-side .ics (VCALENDAR) generation. Display and download only: this
 * module never reads or writes any app data.
 *
 * Two anchoring modes, chosen deliberately per product:
 *
 * - Floating-in-a-zone (events): the calendar entry is pinned to the venue's
 *   own time zone with a TZID, so a traveling guest's calendar still shows the
 *   venue's local clock time, consistent with our venue-time display model.
 * - Absolute instant (eCard reveals): the reveal is one global moment, so the
 *   entry uses a UTC stamp and every calendar renders it in the viewer's own
 *   zone automatically.
 */

import { eventInstant } from "@/lib/datetime";

export function escapeIcsText(value: string): string {
  return (value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** UTC stamp, for example 20260815T230000Z. */
export function toUtcStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

function zoneParts(date: Date, timeZone: string) {
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
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) === 24 ? 0 : Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Local wall-clock stamp in a zone, for example 20260815T190000 (no Z). */
export function toZonedStamp(date: Date, timeZone: string): string {
  try {
    const p = zoneParts(date, timeZone);
    const pad = (n: number, w = 2) => String(n).padStart(w, "0");
    return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`;
  } catch {
    return toUtcStamp(date).replace(/Z$/, "");
  }
}

/** UTC offset of a zone at a given instant, formatted as +0400 or -0700. */
export function zoneOffset(date: Date, timeZone: string): string {
  try {
    const p = zoneParts(date, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const minutes = Math.round((asUtc - date.getTime()) / 60000);
    const sign = minutes < 0 ? "-" : "+";
    const abs = Math.abs(minutes);
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
  } catch {
    return "+0000";
  }
}

/** Short zone abbreviation, for example EDT. Falls back to the zone id. */
function zoneAbbrev(date: Date, timeZone: string): string {
  try {
    const full = date.toLocaleString("en-US", { timeZone, timeZoneName: "short" });
    const bits = full.split(" ");
    return bits[bits.length - 1] || timeZone;
  } catch {
    return timeZone;
  }
}

/**
 * Interpret a stored date value as a real instant. A naive
 * "YYYY-MM-DDTHH:MM" wall-clock string is read in the given zone; anything
 * else already carries its own offset.
 */
export function instantFrom(value: string, timeZone: string): Date {
  return eventInstant(value, timeZone);
}

export type IcsEventInput = {
  uid: string;
  title: string;
  start: Date;
  /** Defaults to two hours after start. */
  end?: Date;
  description?: string;
  location?: string;
  url?: string;
  /**
   * When set, the entry is anchored to this IANA zone with a TZID so calendars
   * keep the venue's local clock time. When omitted, the entry uses a UTC
   * instant and each calendar shows it in the viewer's own zone.
   */
  timeZone?: string | null;
  /** Minutes before start for a reminder alarm. Omit for no alarm. */
  alarmMinutesBefore?: number;
};

function fold(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    chunks.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return chunks.join("\r\n");
}

export function buildIcs(input: IcsEventInput): string {
  const start = input.start;
  const end = input.end ?? new Date(start.getTime() + 2 * 3600 * 1000);
  const tz = input.timeZone && input.timeZone.trim() ? input.timeZone.trim() : null;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Kenroe Collective//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  if (tz) {
    // Minimal VTIMEZONE describing the offset in effect at the event itself, so
    // clients that do not know the IANA id still land on the right clock time.
    const offset = zoneOffset(start, tz);
    lines.push(
      `X-WR-TIMEZONE:${tz}`,
      "BEGIN:VTIMEZONE",
      `TZID:${tz}`,
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      `TZOFFSETFROM:${offset}`,
      `TZOFFSETTO:${offset}`,
      `TZNAME:${zoneAbbrev(start, tz)}`,
      "END:STANDARD",
      "END:VTIMEZONE",
    );
  }

  lines.push(
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(input.uid)}`,
    `DTSTAMP:${toUtcStamp(new Date())}`,
    tz
      ? `DTSTART;TZID=${tz}:${toZonedStamp(start, tz)}`
      : `DTSTART:${toUtcStamp(start)}`,
    tz ? `DTEND;TZID=${tz}:${toZonedStamp(end, tz)}` : `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
  );

  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`);
  if (input.url) lines.push(`URL:${input.url}`);
  lines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE");

  if (typeof input.alarmMinutesBefore === "number") {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(input.title)}`,
      `TRIGGER:-PT${Math.max(1, Math.round(input.alarmMinutesBefore))}M`,
      "END:VALARM",
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

/** Turn a title into a safe file name stem. */
export function icsFileName(stem: string): string {
  const clean = (stem || "calendar")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${clean || "calendar"}.ics`;
}

/** Trigger a browser download of an .ics file. No-op during SSR. */
export function downloadIcs(fileName: string, contents: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
