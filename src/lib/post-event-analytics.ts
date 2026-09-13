// Post-event wrap-up maths.
//
// Pure and dependency-light on purpose: the same numbers are shown to the host
// in the day-of toolkit and can be recomputed server-side from the stored event
// JSON for reports. Nothing here mutates the event.

import type { KEvent, Guest } from "./events-store";
import { partyHeadcount, isWalkIn, checkInSummary } from "./events-store";
import { reconcileEvent } from "./payment-reconciliation";

export type NoShowRow = {
  id: string;
  name: string;
  heads: number;
  status: string;
};

export type PostEventWrapUp = {
  /** Invited rows (walk-ins excluded, since they were never invited). */
  invited: number;
  responded: number;
  responseRate: number;
  yes: number;
  no: number;
  maybe: number;
  pending: number;
  waitlisted: number;
  /** Heads expected from yes/maybe rows. */
  expectedHeads: number;
  /** Heads that actually came through the door (invited + walk-ins). */
  arrivedHeads: number;
  invitedArrivedHeads: number;
  walkInHeads: number;
  walkInCount: number;
  attendanceRate: number;
  noShows: NoShowRow[];
  noShowHeads: number;
  /** Guests who said no but showed up anyway (checked in with status no). */
  surpriseArrivals: number;
  kids: number;
  pets: number;
  dietaryNotes: number;
  accessibilityNotes: number;
  currency: string;
  billed: number;
  collected: number;
  outstanding: number;
  /** ISO timestamps of the first and last check-in, when there were any. */
  firstArrivalAt?: string;
  lastArrivalAt?: string;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function rate(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function wrapUpEvent(event: KEvent): PostEventWrapUp {
  const guests: Guest[] = Array.isArray(event.guests) ? event.guests : [];
  const invitedRows = guests.filter((g) => !isWalkIn(g));
  const countBy = (s: string) => invitedRows.filter((g) => String(g.status) === s).length;

  const yes = countBy("yes");
  const no = countBy("no");
  const maybe = countBy("maybe");
  const pending = countBy("pending");
  const waitlisted = countBy("waitlisted");
  const responded = yes + no + maybe;

  const door = checkInSummary(event);
  const checkedIn = new Set((event.checkIns ?? []).map((c) => c.guestId));

  const noShows: NoShowRow[] = invitedRows
    .filter((g) => (g.status === "yes" || g.status === "maybe") && !checkedIn.has(g.id))
    .map((g) => ({ id: g.id, name: g.name || "Unnamed guest", heads: partyHeadcount(g), status: String(g.status) }));

  const surpriseArrivals = invitedRows.filter((g) => g.status === "no" && checkedIn.has(g.id)).length;

  const arrivalTimes = (event.checkIns ?? [])
    .map((c) => String(c.at ?? ""))
    .filter(Boolean)
    .sort();

  const money = reconcileEvent(event.id, event as unknown as Record<string, any>);

  const attended = invitedRows.filter((g) => checkedIn.has(g.id));
  const kids = attended.reduce((s, g) => s + n(g.children), 0);
  const pets = attended.reduce((s, g) => s + n(g.pets), 0);

  return {
    invited: invitedRows.length,
    responded,
    responseRate: rate(responded, invitedRows.length),
    yes,
    no,
    maybe,
    pending,
    waitlisted,
    expectedHeads: door.expectedHeads,
    arrivedHeads: door.totalOnSiteHeads,
    invitedArrivedHeads: door.invitedArrivedHeads,
    walkInHeads: door.walkInHeads,
    walkInCount: door.walkInCount,
    attendanceRate: rate(door.invitedArrivedHeads, door.expectedHeads),
    noShows,
    noShowHeads: noShows.reduce((s, r) => s + r.heads, 0),
    surpriseArrivals,
    kids,
    pets,
    dietaryNotes: guests.filter((g) => String(g.dietary ?? "").trim().length > 0).length,
    accessibilityNotes: guests.filter((g) => String(g.accessibilityNotes ?? "").trim().length > 0).length,
    currency: money.currency,
    billed: money.billed,
    collected: money.collected,
    outstanding: money.outstanding,
    firstArrivalAt: arrivalTimes[0],
    lastArrivalAt: arrivalTimes[arrivalTimes.length - 1],
  };
}

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Flat CSV of the wrap-up, plus one row per no-show so hosts can follow up. */
export function wrapUpCsv(event: KEvent, w: PostEventWrapUp): string {
  const lines: string[] = [];
  lines.push(["Metric", "Value"].join(","));
  const rows: [string, string | number][] = [
    ["Event", event.title ?? "Untitled event"],
    ["Invited", w.invited],
    ["Responded", w.responded],
    ["Response rate %", w.responseRate],
    ["Yes", w.yes],
    ["No", w.no],
    ["Maybe", w.maybe],
    ["No reply", w.pending],
    ["Waitlisted", w.waitlisted],
    ["Expected heads", w.expectedHeads],
    ["Arrived heads (total on site)", w.arrivedHeads],
    ["Invited arrived heads", w.invitedArrivedHeads],
    ["Walk-in heads", w.walkInHeads],
    ["Attendance rate %", w.attendanceRate],
    ["No-show parties", w.noShows.length],
    ["No-show heads", w.noShowHeads],
    ["Kids attended", w.kids],
    ["Pets attended", w.pets],
    ["Guests with dietary notes", w.dietaryNotes],
    ["Guests with accessibility notes", w.accessibilityNotes],
    [`Billed (${w.currency})`, w.billed],
    [`Collected (${w.currency})`, w.collected],
    [`Outstanding (${w.currency})`, w.outstanding],
    ["First arrival", w.firstArrivalAt ?? ""],
    ["Last arrival", w.lastArrivalAt ?? ""],
  ];
  for (const [k, v] of rows) lines.push([csvCell(k), csvCell(v)].join(","));
  lines.push("");
  lines.push(["No-show guest", "RSVP", "Heads"].join(","));
  for (const r of w.noShows) lines.push([csvCell(r.name), csvCell(r.status), r.heads].join(","));
  return lines.join("\n");
}
