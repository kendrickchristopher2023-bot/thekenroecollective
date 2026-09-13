import { useMemo, useState } from "react";
import type { KEvent } from "@/lib/events-store";
import { updateEvent, zonedWallClockToUtc } from "@/lib/events-store";
import { toast } from "sonner";

function fmt(x: Date) {
  return x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildIcs(event: KEvent) {
  const d = zonedWallClockToUtc(event.date, event.timezone);
  const end = new Date(d.getTime() + 2 * 3600 * 1000);
  const esc = (s: string) =>
    (s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kenroe//Events//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@thekenroecollective.com`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(d)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(event.title)}`,
    `DESCRIPTION:${esc(event.message || event.description || "")}`,
    `LOCATION:${esc([event.venue, event.address].filter(Boolean).join(", "))}`,
    `URL:${typeof window !== "undefined" ? window.location.origin : "https://thekenroecollective.com"}/invite/${event.id}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function feedUrl(event: KEvent): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams({
    t: event.title,
    d: event.date,
    v: event.venue || "",
    a: event.address || "",
    m: (event.message || event.description || "").slice(0, 500),
    id: event.id,
    ...(event.timezone ? { tz: event.timezone } : {}),
  });
  return `${window.location.origin}/api/public/calendar.ics?${params}`;
}

function appleIcsHref(event: KEvent): string {
  // Use the server-rendered .ics URL — browsers/OS open this in Calendar app
  // directly (inline Content-Disposition) instead of just downloading a blob.
  return feedUrl(event);
}

function googleUrl(event: KEvent) {
  const d = zonedWallClockToUtc(event.date, event.timezone);
  const end = new Date(d.getTime() + 2 * 3600 * 1000);
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${fmt(d)}/${fmt(end)}`,
    details: event.message || event.description || "",
    location: [event.venue, event.address].filter(Boolean).join(", "),
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function outlookLiveUrl(event: KEvent) {
  const d = zonedWallClockToUtc(event.date, event.timezone);
  const end = new Date(d.getTime() + 2 * 3600 * 1000);
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: d.toISOString(),
    enddt: end.toISOString(),
    body: event.message || event.description || "",
    location: [event.venue, event.address].filter(Boolean).join(", "),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p}`;
}

function outlook365Url(event: KEvent) {
  const d = zonedWallClockToUtc(event.date, event.timezone);
  const end = new Date(d.getTime() + 2 * 3600 * 1000);
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: d.toISOString(),
    enddt: end.toISOString(),
    body: event.message || event.description || "",
    location: [event.venue, event.address].filter(Boolean).join(", "),
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${p}`;
}


export function CalendarSyncPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const url = useMemo(() => feedUrl(event), [event]);
  const webcal = url.replace(/^https?:\/\//, "webcal://");
  const [copied, setCopied] = useState(false);

  const enabled = event.calendarSyncEnabled ?? true;

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-velvet/15 bg-velvet/5 p-4 text-sm text-ink/80">
        💡 Calendar sync lets guests add your event to Google, Apple, or Outlook with one tap — and keeps it updated if you change the date or venue.
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => updateEvent(eventId, { calendarSyncEnabled: e.target.checked })}
        />
        <span>Show "Add to calendar" buttons on the invite page</span>
      </label>

      <section className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
        <h3 className="font-serif text-lg">One-tap add</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          These are the buttons your guests will see. Try them yourself.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={googleUrl(event)} target="_blank" rel="noreferrer" className="rounded-full bg-secondary px-4 py-2 text-sm">
            Google Calendar
          </a>
          <a href={outlookLiveUrl(event)} target="_blank" rel="noreferrer" className="rounded-full bg-secondary px-4 py-2 text-sm">
            Outlook.com
          </a>
          <a href={outlook365Url(event)} target="_blank" rel="noreferrer" className="rounded-full bg-secondary px-4 py-2 text-sm">
            Outlook 365
          </a>
          <a href={appleIcsHref(event)} target="_blank" rel="noreferrer" className="rounded-full bg-secondary px-4 py-2 text-sm">
            Apple Calendar (.ics)
          </a>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Tip: on iPhone/Mac the Apple link opens Calendar. If a browser downloads it instead, open the .ics from Downloads — Calendar will launch.
        </p>

      </section>

      <section className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
        <h3 className="font-serif text-lg">Subscribable feed</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Share this URL with co-hosts or vendors so the event appears in their calendar — and updates automatically if details change.
        </p>
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <input readOnly value={url} className="flex-1 rounded border border-ink/10 bg-paper px-3 py-2 text-xs font-mono" />
            <button onClick={() => copy(url)} className="rounded-full bg-velvet px-3 py-2 text-xs font-medium text-white">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={webcal} className="rounded-full bg-secondary px-3 py-2 text-xs font-medium">
              Subscribe in Apple
            </a>
            <a
              href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-secondary px-3 py-2 text-xs font-medium"
            >
              Subscribe in Google
            </a>
            <a href={url} target="_blank" rel="noreferrer" className="rounded-full bg-secondary px-3 py-2 text-xs font-medium">
              Open .ics
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The plain https link is a downloadable .ics file (browsers save it instead of opening). Use “Subscribe in Apple” (webcal://) or “Subscribe in Google” for live updates.
          </p>
        </div>
      </section>
    </div>
  );
}

