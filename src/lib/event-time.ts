// Events time-zone display.
//
// THIS FILE IS A THIN COMPATIBILITY LAYER. All event date/time logic lives in
// src/lib/datetime.ts, the one approved formatting module. Nothing here does its
// own date math or its own Intl formatting.
//
// Product rule: an in-person event's time is ALWAYS shown in the venue's own
// zone with an explicit zone label. It is never converted to the viewer's zone.
// Viewer-local display exists only for virtual events (viewerLocalLine).

import {
  DEFAULT_EVENT_TIME_ZONE,
  eventInstant,
  eventTimeZone,
  eventZoneLabel,
  formatEventCompact,
  formatEventDate,
  formatEventDateNumeric,
  formatEventTime,
  toDateTimeLocalInput,
  viewerLocalLine,
  viewerTimeZone,
} from "@/lib/datetime";

export { DEFAULT_EVENT_TIME_ZONE, eventInstant, eventTimeZone, viewerTimeZone };

/** Short zone label for a given instant, for example "EDT". */
export function zoneLabel(date: Date, tz: string): string {
  try {
    const full = date.toLocaleString("en-US", { timeZone: tz, timeZoneName: "short" });
    const bits = full.split(" ");
    return bits[bits.length - 1] || tz;
  } catch {
    return tz;
  }
}

/** "6:00 PM EDT" — the event's own venue time, always labeled. */
export function timeWithZone(iso: string, timezone?: string | null): string {
  return formatEventTime(iso, timezone);
}

/** "Sat, 8/29/2026, 6:00 PM EDT" in the event's own zone. */
export function eventTimeInVenueZone(iso: string, timezone?: string | null): string {
  return formatEventCompact(iso, timezone);
}

/** "8/29/2026" in the event's own zone. */
export function eventDateInVenueZone(iso: string, timezone?: string | null): string {
  return formatEventDateNumeric(iso, timezone);
}

/** Venue wall clock for the host builder's datetime-local field. */
export function eventDateTimeLocalInput(iso: string, timezone?: string | null): string {
  return iso ? toDateTimeLocalInput(iso, timezone) : "";
}

/**
 * Viewer-local helper. In-person events must NOT use this; it exists for
 * virtual events, where the attendee's own clock is the useful one.
 */
export function viewerTimeHint(
  iso: string,
  timezone?: string | null,
  viewer?: string,
): { sameZone: boolean; text: string } {
  const line = viewerLocalLine(iso, timezone, viewer);
  if (!line) return { sameZone: true, text: "That is already your own time zone." };
  return { sameZone: false, text: line };
}

export { eventZoneLabel, formatEventDate };

/**
 * A short, curated list of zones for the host picker. Named IANA zones only:
 * raw offsets are wrong half the year.
 */
export const COMMON_EVENT_TIME_ZONES: { id: string; label: string }[] = [
  { id: "America/New_York", label: "Eastern time (New York)" },
  { id: "America/Chicago", label: "Central time (Chicago)" },
  { id: "America/Denver", label: "Mountain time (Denver)" },
  { id: "America/Phoenix", label: "Arizona (no daylight saving)" },
  { id: "America/Los_Angeles", label: "Pacific time (Los Angeles)" },
  { id: "America/Anchorage", label: "Alaska time (Anchorage)" },
  { id: "Pacific/Honolulu", label: "Hawaii time (Honolulu)" },
  { id: "America/Puerto_Rico", label: "Puerto Rico" },
  { id: "America/Toronto", label: "Toronto" },
  { id: "America/Mexico_City", label: "Mexico City" },
  { id: "Europe/London", label: "London" },
  { id: "Europe/Paris", label: "Paris" },
  { id: "Africa/Lagos", label: "Lagos" },
  { id: "Asia/Dubai", label: "Dubai" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Australia/Sydney", label: "Sydney" },
];

export function timeZoneOptions(current?: string | null): { id: string; label: string }[] {
  const list = [...COMMON_EVENT_TIME_ZONES];
  for (const extra of [current, viewerTimeZone()]) {
    if (extra && !list.some((z) => z.id === extra)) list.unshift({ id: extra, label: extra });
  }
  return list;
}
