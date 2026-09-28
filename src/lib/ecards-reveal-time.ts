// Group eCards — reveal date/time conversion between a datetime-local input
// (an organizer's LOCAL wall clock, with no zone information) and the UTC
// instant we store in reveal_date.
//
// The rule: a naive "YYYY-MM-DDTHH:MM" string is NEVER a UTC instant. It is a
// wall clock that only means something inside a time zone. Appending "Z" to it,
// or parsing it on a UTC server with new Date(), shifts the time by the
// organizer's offset (6:00 PM EDT became 2:00 PM). These helpers keep the save
// conversion and the load conversion symmetric.

const NAIVE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export function isNaiveLocalInput(value: string): boolean {
  return NAIVE.test(value.trim());
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * A naive wall clock interpreted inside an explicit zone, returned as the real
 * UTC instant. Works anywhere, including a UTC server.
 */
export function wallClockInZoneToUtc(value: string, timeZone: string): Date {
  const base = new Date(`${value.length === 16 ? `${value}:00` : value}Z`);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(base);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value])) as Record<string, string>;
    const hour = Number(map.hour) === 24 ? 0 : Number(map.hour);
    const shownAsUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      hour,
      Number(map.minute),
      Number(map.second),
    );
    return new Date(base.getTime() + (base.getTime() - shownAsUtc));
  } catch {
    return base;
  }
}

/**
 * Save direction. Takes whatever the form holds and returns a UTC ISO instant.
 * A naive value is read in the given zone (the browser's own zone by default),
 * an already absolute value is passed straight through.
 */
export function revealInputToUtcIso(value: string, timeZone?: string | null): string {
  const raw = value.trim();
  if (!isNaiveLocalInput(raw)) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new Error("That reveal date and time is not valid.");
    return d.toISOString();
  }
  const zone = timeZone && timeZone.trim() ? timeZone : localTimeZone();
  const d = wallClockInZoneToUtc(raw, zone);
  if (Number.isNaN(d.getTime())) throw new Error("That reveal date and time is not valid.");
  return d.toISOString();
}

/** Load direction. A stored UTC instant back into the viewer's wall clock. */
export function utcIsoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
