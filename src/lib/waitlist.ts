// Waitlist ordering, seat math and promotion planning.
//
// ONE source of truth for "who is next and do they fit". The host panel, the
// manual promote button and the unattended cron worker all call
// planWaitlistPromotions, so the host can never see a different answer than the
// robot produces at 2am.
//
// Two structural rules, both deliberate:
//
// 1. The cap counts PEOPLE, not guest rows. Everything here goes through
//    partyHeadcount() (guest + children + named plus-ones), the same helper the
//    RSVP form and the SQL capacity check use. Promoting one "guest" can add
//    four heads and that is exactly what we account for.
// 2. A party is NEVER partially promoted. You cannot tell someone half their
//    family is in. If the next party does not fit, we either skip to the next
//    party that does (default) or hold the seats for them, per the host's
//    chosen policy.

import { partyHeadcount, type Guest, type KEvent } from "@/lib/events-store";
import { eventInstant } from "@/lib/datetime";

/**
 * What to do when the next party on the list is larger than the seats that
 * just opened.
 *
 * - "skip": promote the next party that fits, leave the big party waiting.
 *   Fills the room, but a family of five can be leapfrogged repeatedly.
 * - "hold": leave the seats empty and wait until enough open for the party at
 *   the front. Strictly fair, may leave seats unused.
 *
 * Recommended default: "skip". A held seat helps nobody, and the host can
 * always promote out of order manually. Partial promotion is not an option.
 */
export type WaitlistPolicy = "skip" | "hold";

export const DEFAULT_WAITLIST_POLICY: WaitlistPolicy = "skip";

export function waitlistPolicyOf(event: Pick<KEvent, "waitlistPolicy">): WaitlistPolicy {
  return event.waitlistPolicy === "hold" ? "hold" : DEFAULT_WAITLIST_POLICY;
}

/** People currently holding a confirmed seat. Heads, not rows. */
export function confirmedHeads(event: Pick<KEvent, "guests">): number {
  let n = 0;
  for (const g of event.guests) if (g.status === "yes") n += partyHeadcount(g);
  return n;
}

/** Seats still available under the cap. 0 when uncapped or full/over. */
export function openSeats(event: Pick<KEvent, "guests" | "capacity">): number {
  const cap = Number(event.capacity ?? 0);
  if (!(cap > 0)) return 0;
  return Math.max(0, cap - confirmedHeads(event));
}

export interface WaitlistEntry {
  guest: Guest;
  /** 1-based position the host sees and controls. */
  position: number;
  /** People in this party. */
  heads: number;
}

/**
 * The waitlist in host order.
 *
 * An explicit `waitlistPosition` (set by drag-to-reorder) always wins. Rows
 * without one keep their insertion order and sort after the ordered ones, so
 * turning on manual ordering never silently reshuffles the queue.
 */
export function waitlistEntries(event: Pick<KEvent, "guests">): WaitlistEntry[] {
  const rows = event.guests
    .map((guest, index) => ({ guest, index }))
    .filter((r) => r.guest.status === "waitlisted");

  rows.sort((a, b) => {
    const pa = typeof a.guest.waitlistPosition === "number" ? a.guest.waitlistPosition : Number.POSITIVE_INFINITY;
    const pb = typeof b.guest.waitlistPosition === "number" ? b.guest.waitlistPosition : Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return a.index - b.index;
  });

  return rows.map((r, i) => ({ guest: r.guest, position: i + 1, heads: partyHeadcount(r.guest) }));
}

/** Has the event already started? Auto-promote must never fire after this. */
export function eventHasStarted(
  event: Pick<KEvent, "date" | "timezone">,
  now: Date = new Date(),
): boolean {
  if (!event.date) return false;
  try {
    return eventInstant(event.date, event.timezone ?? undefined).getTime() <= now.getTime();
  } catch {
    return false;
  }
}

export interface PromotionPlan {
  /** Seats available before any promotion. */
  seats: number;
  /** Parties to promote, in order. Whole parties only. */
  promote: WaitlistEntry[];
  /** Parties passed over because they did not fit in the remaining seats. */
  skipped: WaitlistEntry[];
  /** Under "hold": the party the remaining seats are being kept for. */
  heldFor: WaitlistEntry | null;
  /** Seats still open once the plan is applied. */
  seatsLeft: number;
  /** Why nothing can be promoted, when nothing can. */
  blocked: null | "no_cap" | "waitlist_off" | "no_seats" | "empty_waitlist" | "event_started";
}

export interface PlanOptions {
  now?: Date;
  /** Ignore the host's autoPromote switch (manual "promote next" click). */
  ignoreAutoPromote?: boolean;
  /** Override the stored policy for a what-if preview. */
  policy?: WaitlistPolicy;
}

/**
 * Decide who gets promoted right now. Pure — no writes, no sends. Both the
 * host UI preview and the cron worker call this, so the explanation the host
 * reads is literally the decision the worker makes.
 */
export function planWaitlistPromotions(
  event: Pick<KEvent, "guests" | "capacity" | "waitlistEnabled" | "autoPromote" | "waitlistPolicy" | "date" | "timezone">,
  opts: PlanOptions = {},
): PromotionPlan {
  const empty = (blocked: PromotionPlan["blocked"], seats = 0): PromotionPlan => ({
    seats,
    promote: [],
    skipped: [],
    heldFor: null,
    seatsLeft: seats,
    blocked,
  });

  const cap = Number(event.capacity ?? 0);
  if (!(cap > 0)) return empty("no_cap");
  if (!event.waitlistEnabled) return empty("waitlist_off");
  if (!opts.ignoreAutoPromote && event.autoPromote === false) return empty("waitlist_off");
  if (eventHasStarted(event, opts.now ?? new Date())) return empty("event_started");

  const entries = waitlistEntries(event);
  if (!entries.length) return empty("empty_waitlist");

  const seats = openSeats(event);
  if (seats <= 0) return empty("no_seats");

  const policy = opts.policy ?? waitlistPolicyOf(event);
  const promote: WaitlistEntry[] = [];
  const skipped: WaitlistEntry[] = [];
  let left = seats;
  let heldFor: WaitlistEntry | null = null;

  for (const entry of entries) {
    if (left <= 0) break;
    if (entry.heads <= left) {
      promote.push(entry);
      left -= entry.heads;
      continue;
    }
    if (policy === "hold") {
      heldFor = entry;
      break;
    }
    skipped.push(entry);
  }

  return { seats, promote, skipped, heldFor, seatsLeft: left, blocked: null };
}

/** Plain-English summary of a plan, for the host card and the promotion log. */
export function describePlan(plan: PromotionPlan): string {
  switch (plan.blocked) {
    case "no_cap":
      return "No attendance cap set, so nobody is ever waitlisted.";
    case "waitlist_off":
      return "Waitlist or auto-promote is off, so nobody is promoted automatically.";
    case "event_started":
      return "The event has already started, so auto-promote is stopped.";
    case "empty_waitlist":
      return "Nobody is on the waitlist.";
    case "no_seats":
      return "No seats are open.";
    default:
      break;
  }
  const bits: string[] = [];
  if (plan.promote.length) {
    const heads = plan.promote.reduce((n, e) => n + e.heads, 0);
    bits.push(
      `${plan.promote.length} ${plan.promote.length === 1 ? "party" : "parties"} (${heads} ${heads === 1 ? "person" : "people"}) would be promoted`,
    );
  }
  if (plan.heldFor) {
    bits.push(
      `${plan.seatsLeft} ${plan.seatsLeft === 1 ? "seat" : "seats"} held for ${plan.heldFor.guest.name || "the next party"} (needs ${plan.heldFor.heads})`,
    );
  }
  if (plan.skipped.length) {
    bits.push(`${plan.skipped.length} passed over as too large for the open seats`);
  }
  if (!bits.length) return "Nothing to promote right now.";
  return `${bits.join("; ")}.`;
}

/**
 * Name the parties that were passed over, and why.
 *
 * Skipping is never silent: the host sees it on the card, and the same sentence
 * is written into the promotion history when the unattended worker does it, so
 * the host can explain the decision to the guest who asks.
 */
export function describeSkipped(plan: PromotionPlan): string {
  if (!plan.skipped.length) return "";
  const parts = plan.skipped.map((e) => {
    const name = e.guest.name || "One party";
    return `${name} (${e.heads} ${e.heads === 1 ? "person" : "people"})`;
  });
  const seats = plan.seatsLeft;
  return `Passed over for now: ${parts.join(", ")}. Only ${seats} ${seats === 1 ? "seat is" : "seats are"} open and a party is never split, so they keep their place in the queue.`;
}

/**
 * Move one id inside an ordered list. Used by drag-to-reorder and the
 * up/down buttons (which exist because dragging is unusable on a phone).
 */
export function moveInOrder(ids: string[], id: string, toIndex: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return ids;
  const next = ids.slice();
  next.splice(from, 1);
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, id);
  return next;
}
