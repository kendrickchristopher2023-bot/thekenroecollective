/**
 * Review rules for "ask the host to add me" join requests.
 *
 * A request carries a party size (the requester plus any extra guests they
 * said they'd bring). Approving one is a real headcount and money event, so the
 * same three questions a normal RSVP answers are answered here, in one pure
 * place shared by the host panel, the guest-facing request form and the tests:
 *
 *   1. How many people is this really?  → partyLabel / partyPhrase
 *   2. What will they owe?              → requestOwed
 *   3. Does the event have room?        → capacityVerdict
 */

export interface RequestPricingEvent {
  paymentEnabled?: boolean;
  paymentAmount?: number;
  paymentAmountChild?: number;
}

export interface RequestCapacityEvent {
  capacity?: number;
  waitlistEnabled?: boolean;
}

/** Clamp a stored/typed party size into the supported 1..20 range. */
export function normalizeParty(size: unknown): number {
  const n = Math.floor(Number(size));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(20, n));
}

/** "+ 1 guest = 2 people" style phrase. Empty string for a party of one. */
export function partyPhrase(size: unknown): string {
  const n = normalizeParty(size);
  if (n <= 1) return "";
  const extra = n - 1;
  return `+ ${extra} ${extra === 1 ? "guest" : "guests"} = ${n} people`;
}

/** "Moses Little + 1 guest = 2 people" — never just the name. */
export function partyLabel(name: string, size: unknown): string {
  const phrase = partyPhrase(size);
  return phrase ? `${name} ${phrase}` : `${name} (1 person)`;
}

/**
 * What this party owes if the host turned payments on. Every head in a join
 * request is treated as an adult: the requester never enters ages, so the
 * higher price is quoted and the guest can only ever be charged less once
 * they fill in their real RSVP.
 */
export function requestOwed(event: RequestPricingEvent, size: unknown): number {
  if (!event?.paymentEnabled) return 0;
  const per = Number(event.paymentAmount ?? 0);
  if (!Number.isFinite(per) || per <= 0) return 0;
  return per * normalizeParty(size);
}

export function formatMoney(cents: number): string {
  return `$${cents.toFixed(2)}`;
}

export type CapacityVerdict = "fits" | "waitlist" | "over";

export interface CapacityCheck {
  verdict: CapacityVerdict;
  /** Seats left before this request is applied. Null when no cap is set. */
  remaining: number | null;
  /** Heads this request would add. */
  heads: number;
}

/**
 * Same rule the RSVP path uses: a party that doesn't fit under the cap goes to
 * the waitlist when the host enabled one, and is otherwise refused. `committed`
 * is the host-facing headcount (everyone who hasn't declined and isn't
 * waitlisted), so approving can't quietly blow past the cap.
 */
export function capacityVerdict(
  event: RequestCapacityEvent,
  committed: number,
  size: unknown,
): CapacityCheck {
  const heads = normalizeParty(size);
  const cap = Number(event?.capacity ?? 0);
  if (!Number.isFinite(cap) || cap <= 0) {
    return { verdict: "fits", remaining: null, heads };
  }
  const remaining = Math.max(0, cap - Math.max(0, committed));
  if (heads <= remaining) return { verdict: "fits", remaining, heads };
  return { verdict: event?.waitlistEnabled ? "waitlist" : "over", remaining, heads };
}
