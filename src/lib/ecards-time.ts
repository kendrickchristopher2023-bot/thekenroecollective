// Group eCards — display-only time formatting.
//
// Every eCard time is stored as UTC timestamptz. In the browser we render it in
// the VIEWER'S OWN device time zone and append the zone abbreviation, so a time
// is never ambiguous, for example "8/15/2026, 9:00 AM PDT". If the viewer's
// device zone changes (they travel), the display follows automatically because
// we never pin a fixed zone.
//
// SSR renders with an explicit UTC label first, then the hooks below swap to the
// viewer's zone after hydration. That keeps server and first client render
// identical, so there is no hydration mismatch.
import { useEffect, useState } from "react";

const US_DATE: Intl.DateTimeFormatOptions = {
  month: "numeric",
  day: "numeric",
  year: "numeric",
};

const US_DATE_TIME: Intl.DateTimeFormatOptions = {
  month: "numeric",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

const MONTH_DAY: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
};

function fmt(value: string, opts: Intl.DateTimeFormatOptions, timeZone?: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", timeZone ? { ...opts, timeZone } : opts);
}

/** The viewer's own zone, or UTC when it cannot be read (SSR). */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Zone abbreviation for a given instant and zone, for example "PDT" or "UTC". */
export function zoneLabel(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(
    new Date(value),
  );
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

/** mm/dd/yyyy in an explicit zone. Used by emails and by SSR. */
export function formatDateInZone(value: string, timeZone: string): string {
  return fmt(value, US_DATE, timeZone);
}

/** "8/15/2026, 9:00 AM PDT" in an explicit zone. Used by emails and by SSR. */
export function formatDateTimeInZone(value: string, timeZone: string): string {
  return fmt(value, US_DATE_TIME, timeZone);
}

/** "August 15" in an explicit zone. */
export function formatMonthDayInZone(value: string, timeZone: string): string {
  return fmt(value, MONTH_DAY, timeZone);
}

function useHydratedZone(): string | null {
  const [tz, setTz] = useState<string | null>(null);
  useEffect(() => {
    setTz(viewerTimeZone());
  }, []);
  return tz;
}

/** mm/dd/yyyy in the viewer's zone (UTC on the first render). */
export function useLocalDate(value: string | null | undefined): string {
  const tz = useHydratedZone();
  if (!value) return "";
  return formatDateInZone(value, tz ?? "UTC");
}

/** "8/15/2026, 9:00 AM PDT" in the viewer's zone (UTC on the first render). */
export function useLocalDateTime(value: string | null | undefined): string {
  const tz = useHydratedZone();
  if (!value) return "";
  return formatDateTimeInZone(value, tz ?? "UTC");
}

/** "August 15" in the viewer's zone (UTC on the first render). */
export function useLocalMonthDay(value: string | null | undefined): string {
  const tz = useHydratedZone();
  if (!value) return "";
  return formatMonthDayInZone(value, tz ?? "UTC");
}

/**
 * The viewer's zone once hydrated, "UTC" during SSR and the first render.
 * Handy when many rows need formatting inside one component.
 */
export function useViewerTimeZone(): string {
  return useHydratedZone() ?? "UTC";
}
