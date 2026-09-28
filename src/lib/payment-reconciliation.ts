// Payment reconciliation math.
//
// Deliberately pure and dependency-free so the same numbers can be computed in
// the browser (host reports) and on the server (owner/admin reconciliation)
// straight off the stored event JSON.
//
// IMPORTANT: every figure here is SELF-REPORTED by the host. Cash App, Venmo,
// Zelle, PayPal, cash and checks are logged by hand, so nothing in this report
// is platform-verified. Always render the caveat alongside the totals.

import { attendanceFare, billableAdultCount } from "@/lib/party-fare";

export const RECONCILIATION_CAVEAT =
  "Self-reported by hosts. These figures come from payments hosts logged by hand (Cash App, Venmo, Zelle, PayPal, cash, check), not from a verified platform charge.";

export const RECON_METHODS = [
  "cash",
  "cashapp",
  "venmo",
  "zelle",
  "paypal",
  "check",
  "stripe",
  "other",
] as const;
export type ReconMethod = (typeof RECON_METHODS)[number];

export const RECON_METHOD_LABELS: Record<ReconMethod, string> = {
  cash: "Cash",
  cashapp: "Cash App",
  venmo: "Venmo",
  zelle: "Zelle",
  paypal: "PayPal",
  check: "Check",
  stripe: "Card (Stripe)",
  other: "Other",
};

function normalizeMethod(m: unknown): ReconMethod {
  return (RECON_METHODS as readonly string[]).includes(String(m)) ? (m as ReconMethod) : "other";
}

export type MethodTotals = {
  method: ReconMethod;
  label: string;
  received: number;
  refunded: number;
  net: number;
  entries: number;
};

export type EventReconciliation = {
  eventId: string;
  title: string;
  currency: string;
  paymentEnabled: boolean;
  guests: number;
  billed: number;
  collected: number;
  refunded: number;
  outstanding: number;
  unpaidGuests: number;
  partialGuests: number;
  byMethod: MethodTotals[];
};

type AnyRec = Record<string, any>;

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function headcount(g: AnyRec): number {
  return billableAdultCount(g) + Math.max(0, num(g?.children));
}

/**
 * Priced shirts on a guest's RSVP. Kept as a local pure copy of the rules in
 * events-store (band pricing, youth falling back to adult, frozen snapshot
 * wins) so this module stays dependency-free while still agreeing with the
 * numbers the host and the guest saw.
 */
function shirtCharge(data: AnyRec, g: AnyRec): number {
  const frozen = g?.payment?.shirtAmount;
  if (typeof frozen === "number" && Number.isFinite(frozen) && frozen >= 0) return frozen;

  const pricingOn = data?.paymentEnabled === true && data?.tshirtSizesEnabled === true && data?.shirtPricingEnabled === true;
  if (!pricingOn) return 0;
  const status = String(g?.status ?? "");
  if (status === "no" || status === "waitlisted") return 0;

  const adult = Math.max(0, num(data?.shirtPriceAdult));
  const youthRaw = data?.shirtPriceYouth;
  const youth = youthRaw === undefined || youthRaw === null || youthRaw === "" ? adult : Math.max(0, num(youthRaw));
  if (adult <= 0 && youth <= 0) return 0;
  const priceOf = (size: unknown) => (String(size ?? "").startsWith("youth_") ? youth : adult);
  const sized = (size: unknown) => typeof size === "string" && size.length > 0 && size !== "unsure";

  let total = 0;
  if (sized(g?.shirtSize)) total += priceOf(g.shirtSize);
  for (const p of Array.isArray(g?.plusOnes) ? g.plusOnes : []) {
    if (sized(p?.shirtSize)) total += priceOf(p.shirtSize);
  }
  if (data?.extraShirtsEnabled === true) {
    const cap = Math.max(0, Math.min(10, Math.floor(num(data?.maxExtraShirtsPerRsvp ?? 10))));
    let used = 0;
    for (const line of Array.isArray(g?.extraShirts) ? g.extraShirts : []) {
      if (!sized(line?.size) || used >= cap) continue;
      const qty = Math.min(Math.max(0, Math.floor(num(line?.qty))), cap - used);
      used += qty;
      total += qty * priceOf(line.size);
    }
  }
  return total;
}

/**
 * Amount this guest's party owes. Shares the fare contract with
 * guestOwedAmount in events-store, so children are billed at
 * `paymentAmountChild` instead of the adult rate.
 */
export function reconOwed(data: AnyRec, g: AnyRec): number {
  return attendanceFare(data, g) + shirtCharge(data, g);
}

/** Attendance-only portion, for itemised reporting. */
export function reconAttendance(data: AnyRec, g: AnyRec): number {
  return attendanceFare(data, g);
}

function history(g: AnyRec): AnyRec[] {
  return Array.isArray(g?.payment?.history) ? g.payment.history : [];
}

/** Net money on file for a guest, honouring the append-only history. */
export function reconCollected(data: AnyRec, g: AnyRec): number {
  const hist = history(g);
  if (hist.length) return hist.reduce((s, h) => s + num(h?.amount), 0);
  const legacy = g?.payment?.paidAmount;
  if (typeof legacy === "number") return Math.max(0, legacy);
  return g?.payment?.status === "paid" ? reconOwed(data, g) : 0;
}

/** Per-method received / refunded / net split for one event's stored JSON. */
export function methodBreakdown(data: AnyRec): MethodTotals[] {
  const acc = new Map<ReconMethod, MethodTotals>();
  const bump = (m: ReconMethod) => {
    let row = acc.get(m);
    if (!row) {
      row = { method: m, label: RECON_METHOD_LABELS[m], received: 0, refunded: 0, net: 0, entries: 0 };
      acc.set(m, row);
    }
    return row;
  };

  const guests: AnyRec[] = Array.isArray(data?.guests) ? data.guests : [];
  for (const g of guests) {
    const hist = history(g);
    if (hist.length) {
      for (const h of hist) {
        const row = bump(normalizeMethod(h?.method));
        const amt = num(h?.amount);
        if (amt >= 0) row.received += amt;
        else row.refunded += Math.abs(amt);
        row.net += amt;
        row.entries += 1;
      }
      continue;
    }
    // Legacy record with no history: attribute to "Other" so nothing is lost.
    const legacy = reconCollected(data, g);
    if (legacy > 0) {
      const row = bump("other");
      row.received += legacy;
      row.net += legacy;
      row.entries += 1;
    }
  }

  return RECON_METHODS.map((m) => acc.get(m)).filter((r): r is MethodTotals => !!r && r.entries > 0);
}

/** Full reconciliation for one event's stored JSON. */
export function reconcileEvent(eventId: string, data: AnyRec): EventReconciliation {
  const guests: AnyRec[] = Array.isArray(data?.guests) ? data.guests : [];
  let billed = 0;
  let collected = 0;
  let refunded = 0;
  let unpaidGuests = 0;
  let partialGuests = 0;

  for (const g of guests) {
    const status = String(g?.payment?.status ?? "not_sent");
    const owed = reconOwed(data, g);
    if (status !== "canceled") billed += owed;
    const net = reconCollected(data, g);
    collected += Math.max(0, net);
    refunded += history(g).filter((h) => num(h?.amount) < 0).reduce((s, h) => s + Math.abs(num(h?.amount)), 0);
    if (status === "canceled" || owed <= 0) continue;
    if (net <= 0) unpaidGuests += 1;
    else if (net < owed) partialGuests += 1;
  }

  return {
    eventId,
    title: String(data?.title ?? "Untitled event"),
    currency: String(data?.paymentCurrency ?? "USD"),
    paymentEnabled: !!data?.paymentEnabled,
    guests: guests.length,
    billed,
    collected,
    refunded,
    outstanding: Math.max(0, billed - collected),
    unpaidGuests,
    partialGuests,
    byMethod: methodBreakdown(data),
  };
}

/** Roll several event reconciliations into one across-all-events total. */
export function rollUp(rows: EventReconciliation[]) {
  const byMethod = new Map<ReconMethod, MethodTotals>();
  let billed = 0;
  let collected = 0;
  let refunded = 0;

  for (const r of rows) {
    billed += r.billed;
    collected += r.collected;
    refunded += r.refunded;
    for (const m of r.byMethod) {
      const row =
        byMethod.get(m.method) ??
        ({ method: m.method, label: m.label, received: 0, refunded: 0, net: 0, entries: 0 } as MethodTotals);
      row.received += m.received;
      row.refunded += m.refunded;
      row.net += m.net;
      row.entries += m.entries;
      byMethod.set(m.method, row);
    }
  }

  return {
    events: rows.length,
    billed,
    collected,
    refunded,
    outstanding: Math.max(0, billed - collected),
    byMethod: RECON_METHODS.map((m) => byMethod.get(m)).filter((r): r is MethodTotals => !!r),
  };
}
