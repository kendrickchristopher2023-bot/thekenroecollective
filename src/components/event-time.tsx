import { useEffect, useState } from "react";
import {
  eventTimeInVenueZone,
  eventTimeZone,
  timeZoneOptions,
  viewerTimeHint,
} from "@/lib/event-time";

/**
 * Guest-facing event time. The line is ALWAYS the venue's own time zone with its
 * zone label. For an in-person event the venue clock is the only relevant time,
 * so there is no viewer-timezone conversion: a guest in California opening a New
 * York invite sees "6:00 PM EDT", never "3:00 PM".
 *
 * The viewer-local helper exists for VIRTUAL events only, where the attendee's
 * own clock genuinely is the useful one, and must be opted into with
 * `virtual={true}`. It is client-only, because the server has no viewer zone.
 */
export function EventTimeWithViewerHint({
  date,
  timezone,
  className,
  primaryClassName,
  hintClassName,
  prefix,
  virtual = false,
}: {
  date: string;
  timezone?: string | null;
  className?: string;
  primaryClassName?: string;
  hintClassName?: string;
  /** Optional label rendered before the venue time, for example "When". */
  prefix?: string;
  /** VIRTUAL events only: also show the viewer's own local time. */
  virtual?: boolean;
}) {
  const primary = eventTimeInVenueZone(date, timezone);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!virtual) {
      setHint(null);
      return;
    }
    const res = viewerTimeHint(date, timezone);
    setHint(res.sameZone ? null : res.text);
  }, [date, timezone, virtual]);

  return (
    <div className={className}>
      <p className={primaryClassName ?? "text-base font-medium"}>
        {prefix ? `${prefix} ` : ""}
        {primary}
      </p>
      {hint && (
        <p className={hintClassName ?? "mt-1 text-sm text-muted-foreground"}>{hint}</p>
      )}
    </div>
  );
}

/** Inline version for tight rows: venue time, then the hint on its own line. */
export function EventTimeInline({
  date,
  timezone,
  hintClassName,
  virtual = false,
}: {
  date: string;
  timezone?: string | null;
  hintClassName?: string;
  /** VIRTUAL events only: also show the viewer's own local time. */
  virtual?: boolean;
}) {
  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    if (!virtual) {
      setHint(null);
      return;
    }
    const res = viewerTimeHint(date, timezone);
    setHint(res.sameZone ? null : res.text);
  }, [date, timezone, virtual]);

  return (
    <>
      {eventTimeInVenueZone(date, timezone)}
      {hint && (
        <span className={hintClassName ?? "block text-xs text-muted-foreground"}>{hint}</span>
      )}
    </>
  );
}

/**
 * Host-side venue time zone picker. Purely additive: it writes the event's
 * timezone field only, never the stored date, and no geocoding is involved.
 */
export function EventTimeZonePicker({
  value,
  onChange,
  id = "event-timezone",
}: {
  value?: string | null;
  onChange: (tz: string) => void;
  id?: string;
}) {
  const current = eventTimeZone(value);
  const options = timeZoneOptions(value);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        Venue time zone
      </label>
      <select
        id={id}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-base"
      >
        {options.map((z) => (
          <option key={z.id} value={z.id}>
            {z.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted-foreground">
        Guests see the time in this zone with its label, plus a small "your time" line if they are
        somewhere else. Changing this does not move the clock time you typed.
      </p>
    </div>
  );
}
