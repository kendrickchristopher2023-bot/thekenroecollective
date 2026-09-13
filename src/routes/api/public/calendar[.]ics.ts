import { createFileRoute } from "@tanstack/react-router";
import { zonedWallClockToUtc } from "@/lib/events-store";

function fmt(x: Date) {
  return x.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(s: string) {
  return (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export const Route = createFileRoute("/api/public/calendar.ics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const title = u.searchParams.get("t") || "Event";
        const dateStr = u.searchParams.get("d") || new Date().toISOString();
        const venue = u.searchParams.get("v") || "";
        const address = u.searchParams.get("a") || "";
        const description = u.searchParams.get("m") || "";
        const id = u.searchParams.get("id") || "event";
        const tz = u.searchParams.get("tz") || undefined;

        const d = zonedWallClockToUtc(dateStr, tz);
        const end = new Date(d.getTime() + 2 * 3600 * 1000);
        const location = [venue, address].filter(Boolean).join(", ");

        const ics = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//Kenroe//Events//EN",
          "METHOD:PUBLISH",
          "CALSCALE:GREGORIAN",
          "BEGIN:VEVENT",
          `UID:${esc(id)}@thekenroecollective.com`,
          `DTSTAMP:${fmt(new Date())}`,
          `DTSTART:${fmt(d)}`,
          `DTEND:${fmt(end)}`,
          `SUMMARY:${esc(title)}`,
          `DESCRIPTION:${esc(description)}`,
          `LOCATION:${esc(location)}`,
          "END:VEVENT",
          "END:VCALENDAR",
        ].join("\r\n");

        return new Response(ics, {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            "Content-Disposition": `inline; filename="${id}.ics"`,
          },
        });
      },
    },
  },
});
