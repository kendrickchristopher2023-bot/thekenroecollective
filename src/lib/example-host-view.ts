// The read-only host view of the showcase wedding ("See a finished example").
//
// This module shapes the fictional showcase row into exactly what the example
// page shows and nothing more. It is deliberately a pure function so a test can
// prove two things: no contact detail ever leaves the server (the showcase
// people are invented, but the habit matters), and the counts on the page are
// the same arithmetic the real dashboard uses.

import { rsvpCounts, type KEvent, type SeatingTable, type TimelineBlock } from "@/lib/events-store";

export const EXAMPLE_HOST_PATH = "/example/host" as const;

/** The one calm line the example is allowed to say about itself. */
export const EXAMPLE_NOTE = "This is an example. Create your own event to try it.";

export type ExampleGuest = {
  id: string;
  name: string;
  status: "yes" | "no" | "maybe" | "pending" | "waitlisted";
  party: number;
  plusOnes: string[];
  dietary: string | null;
  table: string | null;
};

export type ExampleTable = {
  id: string;
  label: string;
  capacity: number;
  seated: string[];
};

export type ExampleHostView = {
  id: string;
  title: string;
  date: string;
  timezone: string | null;
  venue: string | null;
  address: string | null;
  dressCode: string | null;
  capacity: number | null;
  hosts: { name: string; role: string | null }[];
  counts: {
    invited: number;
    yes: number;
    maybe: number;
    no: number;
    pending: number;
    attendees: number;
    adults: number;
    children: number;
    dietary: number;
  };
  guests: ExampleGuest[];
  tables: ExampleTable[];
  runOfShow: { id: string; time: string; durationMin: number | null; title: string; owner: string | null }[];
  bring: { id: string; title: string; note: string | null; slots: number; claimedBy: string[] }[];
  photos: { id: string; url: string; label: string | null }[];
  song: { title: string; artist: string | null; url: string } | null;
  voiceNote: { url: string } | null;
  wishes: number;
  comments: number;
};

type BringRow = {
  id: string;
  name: string;
  note?: string | null;
  slotsNeeded?: number | null;
  claims?: { name?: string | null; dish?: string | null }[] | null;
};

type PhotoRow = { id: string; url: string; label?: string | null };

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Shape the showcase event for the example page.
 *
 * Only names, statuses, party sizes, dietary notes and seat labels survive.
 * Emails, phones, mailing addresses, notes to the host, thank-you drafts and
 * every other host-only field are dropped by construction: the output type has
 * no place to put them.
 */
export function shapeExampleHostView(
  event: KEvent,
  extras: {
    bring?: BringRow[] | null;
    photos?: PhotoRow[] | null;
    wishes?: number;
    comments?: number;
  } = {},
): ExampleHostView {
  const guests = Array.isArray(event.guests) ? event.guests : [];
  const tables: SeatingTable[] = Array.isArray(event.seatingTables) ? event.seatingTables : [];
  const nameOf = new Map(guests.map((g) => [g.id, g.name]));
  const tableOf = new Map<string, string>();
  for (const t of tables) {
    if (t.kind === "element") continue;
    for (const gid of t.guestIds ?? []) tableOf.set(gid, t.label);
  }

  const c = rsvpCounts(event);
  const dietary = guests.filter((g) => str(g.dietary)).length;

  const hosts = Array.isArray(event.hosts)
    ? event.hosts.map((h) => ({ name: h.name, role: str(h.role) }))
    : [];
  const timeline: TimelineBlock[] = Array.isArray(event.timelineBlocks) ? event.timelineBlocks : [];

  return {
    id: event.id,
    title: event.title,
    date: event.date,
    timezone: str(event.timezone),
    venue: str(event.venue),
    address: str(event.address),
    dressCode: str(event.dressCode),
    capacity: typeof event.capacity === "number" ? event.capacity : null,
    hosts,
    counts: {
      invited: c.total,
      yes: c.yes,
      maybe: c.maybe,
      no: c.no,
      pending: c.pending,
      attendees: c.attendees,
      adults: c.adults,
      children: c.children,
      dietary,
    },
    guests: guests.map((g) => ({
      id: g.id,
      name: g.name,
      status: g.status,
      party: 1 + (Array.isArray(g.plusOnes) ? g.plusOnes.length : 0) + (g.children ?? 0),
      plusOnes: Array.isArray(g.plusOnes) ? g.plusOnes.map((p) => p.name) : [],
      dietary: str(g.dietary),
      table: tableOf.get(g.id) ?? null,
    })),
    tables: tables
      .filter((t) => t.kind !== "element")
      .map((t) => ({
        id: t.id,
        label: t.label,
        capacity: t.capacity,
        seated: (t.guestIds ?? []).map((gid) => nameOf.get(gid) ?? "Guest"),
      })),
    runOfShow: timeline
      .slice()
      .sort((a, b) => a.time.localeCompare(b.time))
      .map((b) => ({
        id: b.id,
        time: b.time,
        durationMin: typeof b.durationMin === "number" ? b.durationMin : null,
        title: b.title,
        owner: str(b.owner),
      })),
    bring: (extras.bring ?? []).map((b) => ({
      id: b.id,
      title: b.name,
      note: str(b.note),
      slots: typeof b.slotsNeeded === "number" ? b.slotsNeeded : 1,
      claimedBy: (b.claims ?? []).map((cl) => {
        const who = str(cl.name) ?? "Someone";
        const dish = str(cl.dish);
        return dish ? `${who} (${dish})` : who;
      }),
    })),
    photos: (extras.photos ?? []).map((p) => ({ id: p.id, url: p.url, label: str(p.label) })),
    song: event.songUrl
      ? { title: str(event.songTitle) ?? "The event song", artist: str(event.songArtist), url: event.songUrl }
      : null,
    voiceNote: event.voiceMessage ? { url: event.voiceMessage } : null,
    wishes: extras.wishes ?? 0,
    comments: extras.comments ?? 0,
  };
}

/** Wall-clock "18:30" to "6:30 PM" without a timezone shift. */
export function clockLabel(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = Number(m[1]);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m[2]} ${suffix}`;
}
