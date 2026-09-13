// Daytime gating for reminder nudges.
//
// Reminder emails should land while the person is awake. Every reminder job
// checks the local hour in a chosen zone before sending, and simply holds the
// send for a later hourly run when it is night there. Because each reminder
// stage keeps its own "already sent" stamp, holding is safe: nothing is skipped
// forever and nothing is sent twice.
//
// This only shifts WHEN inside a day. It never changes who receives what, and
// it is never applied to the eCard reveal delivery itself, which must fire at
// the organizer's chosen reveal moment.

/** Local hour the daytime window opens, inclusive. */
export const DAYTIME_START_HOUR = 8;

/** Local hour the daytime window closes, exclusive. */
export const DAYTIME_END_HOUR = 20;

/** Used when no zone is known, so reminders still avoid the middle of the night. */
export const DEFAULT_REMINDER_TIME_ZONE = "America/New_York";

/** Falls back to the default zone when the stored value is missing or blank. */
export function reminderTimeZone(timeZone?: string | null): string {
  return timeZone && timeZone.trim() ? timeZone.trim() : DEFAULT_REMINDER_TIME_ZONE;
}

/** The hour of day, 0 to 23, at `now` in the given zone. */
export function localHourInZone(timeZone: string, now: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const raw = parts.find((p) => p.type === "hour")?.value ?? "";
    const hour = Number(raw);
    if (!Number.isFinite(hour)) return now.getUTCHours();
    // Some environments render midnight as 24.
    return hour === 24 ? 0 : hour;
  } catch {
    // An unknown zone string should not block reminders forever, so fall back
    // to the default zone rather than returning something arbitrary.
    if (timeZone !== DEFAULT_REMINDER_TIME_ZONE) {
      return localHourInZone(DEFAULT_REMINDER_TIME_ZONE, now);
    }
    return now.getUTCHours();
  }
}

/**
 * True when it is roughly daytime, 8:00 AM to 8:00 PM, in the given zone.
 * A missing zone uses the default zone instead of sending blind.
 */
export function isDaytimeInZone(timeZone?: string | null, now: Date = new Date()): boolean {
  const hour = localHourInZone(reminderTimeZone(timeZone), now);
  return hour >= DAYTIME_START_HOUR && hour < DAYTIME_END_HOUR;
}
