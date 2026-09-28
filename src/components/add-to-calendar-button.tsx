import { CalendarPlus } from "lucide-react";
import { buildIcs, downloadIcs, icsFileName, instantFrom } from "@/lib/ics";
import { DEFAULT_EVENT_TIME_ZONE, eventTimeZone } from "@/lib/event-time";

function siteOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "https://thekenroecollective.com";
}

/**
 * "Add to calendar" for an in-person event. The entry is anchored to the venue's
 * time zone with a TZID, so a guest who travels still sees the venue's local
 * clock time, matching how we display event times.
 */
export function AddEventToCalendarButton({
  eventId,
  title,
  date,
  timezone,
  venue,
  address,
  description,
  inviteHref,
  className = "",
  label = "Add to calendar",
  tone = "outline",
}: {
  eventId: string;
  title: string;
  /** Stored event date: naive wall clock or full ISO. */
  date: string;
  timezone?: string | null;
  venue?: string | null;
  address?: string | null;
  description?: string | null;
  /** Path or absolute URL guests should open, for example /invite/abc. */
  inviteHref?: string;
  className?: string;
  label?: string;
  tone?: "outline" | "solid";
}) {
  const onClick = () => {
    const tz = eventTimeZone(timezone) || DEFAULT_EVENT_TIME_ZONE;
    const start = instantFrom(date, tz);
    const href = inviteHref
      ? inviteHref.startsWith("http")
        ? inviteHref
        : `${siteOrigin()}${inviteHref}`
      : `${siteOrigin()}/invite/${eventId}`;
    const ics = buildIcs({
      uid: `event-${eventId}@thekenroecollective.com`,
      title,
      start,
      timeZone: tz,
      location: [venue, address].filter(Boolean).join(", ") || undefined,
      description: [description?.trim(), `Details and RSVP: ${href}`].filter(Boolean).join("\n\n"),
      url: href,
      alarmMinutesBefore: 120,
    });
    downloadIcs(icsFileName(title || "event"), ics);
  };

  const base =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-medium transition-colors";
  const skin =
    tone === "solid"
      ? "bg-velvet text-white hover:opacity-90"
      : "text-velvet ring-1 ring-velvet/30 hover:bg-velvet/5";

  return (
    <button type="button" onClick={onClick} className={`${base} ${skin} ${className}`}>
      <CalendarPlus className="h-5 w-5" aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * "Add reveal to calendar" for a group eCard. A reveal is one global instant, so
 * the entry uses a UTC stamp and every calendar shows it in the viewer's own
 * time zone automatically.
 */
export function AddRevealToCalendarButton({
  cardId,
  occasion,
  recipientName,
  revealDate,
  cardHref,
  className = "",
  label = "Add reveal to calendar",
  tone = "outline",
}: {
  cardId: string;
  occasion: string;
  recipientName: string;
  /** ISO timestamp of the reveal instant. */
  revealDate: string;
  /** Path or absolute URL to the card or keepsake page. */
  cardHref?: string;
  className?: string;
  label?: string;
  tone?: "outline" | "solid";
}) {
  const onClick = () => {
    const start = new Date(revealDate);
    const title = `${occasion} for ${recipientName} reveals`;
    const href = cardHref
      ? cardHref.startsWith("http")
        ? cardHref
        : `${siteOrigin()}${cardHref}`
      : `${siteOrigin()}/ecards/${cardId}`;
    const ics = buildIcs({
      uid: `ecard-reveal-${cardId}@thekenroecollective.com`,
      title,
      start,
      end: new Date(start.getTime() + 30 * 60 * 1000),
      description: [
        `The group card for ${recipientName} opens at this moment.`,
        `Open the card: ${href}`,
      ].join("\n\n"),
      url: href,
      alarmMinutesBefore: 60,
    });
    downloadIcs(icsFileName(title), ics);
  };

  const base =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-medium transition-colors";
  const skin =
    tone === "solid"
      ? "bg-velvet text-white hover:opacity-90"
      : "text-velvet ring-1 ring-velvet/30 hover:bg-velvet/5";

  return (
    <button type="button" onClick={onClick} className={`${base} ${skin} ${className}`}>
      <CalendarPlus className="h-5 w-5" aria-hidden="true" />
      {label}
    </button>
  );
}
