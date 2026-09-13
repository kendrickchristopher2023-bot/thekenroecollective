// Comprehensive per-event guest report.
//
// Pure and dependency-free on purpose: the exact same columns and totals are
// produced in the browser (host guest-list export) and on the server
// (owner/admin per-event report + emailed report), straight off the stored
// event JSON. Nothing here reads the store or the DOM.
//
// Every field a guest can submit lands in ONE table: RSVP status, party
// composition, named plus-ones with their own dietary/accessibility/shirt data,
// dietary restrictions, accessibility needs, T-shirt size, check-in state and
// payment status. Previously these were scattered across separate exports.

import { RECON_METHOD_LABELS, reconCollected, reconOwed, type ReconMethod } from "@/lib/payment-reconciliation";
import { SHIRT_SIZE_LABELS, SHIRT_SIZE_ORDER, type ShirtSize } from "@/lib/tshirt-sizes";
import {
  guestExtraShirtCount,
  shirtChargeForGuest,
  shirtPricingOn,
  type Guest,
  type KEvent,
} from "@/lib/events-store";

type AnyRec = Record<string, any>;

export type GuestReportCell = string | number;

export interface GuestReportSummary {
  guests: number;
  byStatus: { label: string; key: string; count: number }[];
  adults: number;
  children: number;
  pets: number;
  plusOnes: number;
  attendees: number;
  checkedIn: number;
  withDietary: number;
  withAccessibility: number;
  shirtTally: { label: string; count: number }[];
  shirtsMissing: number;
  billed: number;
  collected: number;
  refunded: number;
  outstanding: number;
}

export interface GuestReport {
  eventId: string;
  title: string;
  columns: string[];
  rows: GuestReportCell[][];
  summary: GuestReportSummary;
  /** Which optional sections are switched on for this event. */
  flags: { payments: boolean; shirts: boolean; pets: boolean; kids: boolean };
}

const STATUS_LABELS: Record<string, string> = {
  yes: "Attending",
  no: "Declined",
  maybe: "Maybe",
  pending: "No reply yet",
  waitlisted: "Waitlisted",
};

const STATUS_ORDER = ["yes", "maybe", "pending", "waitlisted", "no"];

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function plusOnesOf(g: AnyRec): AnyRec[] {
  return Array.isArray(g?.plusOnes) ? g.plusOnes : [];
}

function history(g: AnyRec): AnyRec[] {
  return Array.isArray(g?.payment?.history) ? g.payment.history : [];
}

function partyHeads(g: AnyRec): number {
  return num(g?.adults, 1) + num(g?.children) + plusOnesOf(g).length;
}

function methodsUsed(g: AnyRec): string {
  const seen: string[] = [];
  for (const h of history(g)) {
    const m = String(h?.method ?? "other") as ReconMethod;
    const label = RECON_METHOD_LABELS[m] ?? "Other";
    if (!seen.includes(label)) seen.push(label);
  }
  return seen.join(" / ");
}

function lastPaymentAt(g: AnyRec): string {
  const dates = history(g)
    .map((h) => text(h?.at))
    .filter(Boolean)
    .sort();
  return dates.length ? dates[dates.length - 1]! : "";
}

function refundedOf(g: AnyRec): number {
  return history(g)
    .filter((h) => num(h?.amount) < 0)
    .reduce((s, h) => s + Math.abs(num(h.amount)), 0);
}

/** Payment bucket used across the app: paid / partial / unpaid / n-a. */
export function reportPayBucket(data: AnyRec, g: AnyRec): string {
  const owed = reconOwed(data, g);
  if (owed <= 0) return "not billed";
  const net = reconCollected(data, g);
  if (net >= owed) return "paid";
  if (net > 0) return "partial";
  return "unpaid";
}

function shirtLabel(v: unknown): string {
  const key = text(v);
  if (!key) return "";
  return SHIRT_SIZE_LABELS[key as ShirtSize] ?? key;
}

/**
 * Build the full report for one event's stored JSON. `data` accepts a KEvent or
 * the raw `events.data` payload — they are structurally the same.
 */
export function buildGuestReport(data: AnyRec, eventId?: string): GuestReport {
  const guests: AnyRec[] = Array.isArray(data?.guests) ? data.guests : [];
  const checkIns: AnyRec[] = Array.isArray(data?.checkIns) ? data.checkIns : [];
  const checkedInIds = new Set(checkIns.map((c) => String(c?.guestId ?? "")));

  const payments = data?.paymentEnabled === true || data?.paymentAmount > 0;
  const shirts = data?.tshirtSizesEnabled === true;
  // Shirts only carry money columns when the host actually priced them.
  const shirtsPriced = shirts && shirtPricingOn(data as unknown as KEvent);
  const pets = data?.petsEnabled !== false;
  const kids = data?.kidsEnabled !== false;

  const columns = [
    "Name",
    "Email",
    "Phone",
    "Address",
    "RSVP",
    "Added as",
    "Adults",
    ...(kids ? ["Kids"] : []),
    ...(pets ? ["Pets"] : []),
    "Plus-ones",
    "Plus-one names",
    "Party headcount",
    "Dietary restrictions",
    "Accessibility needs",
    ...(shirts ? ["T-shirt size", "Plus-one shirt sizes"] : []),
    ...(shirtsPriced ? ["Extra shirts", "Shirt charge"] : []),
    "Plus-one dietary",
    "Plus-one accessibility",
    "Checked in",
    "Invited at",
    "RSVP reminders",
    ...(payments
      ? [
          "Owed",
          "Collected (net)",
          "Refunded",
          "Balance",
          "Payment status",
          "Payment methods",
          "Last payment at",
          "Payment reminders",
        ]
      : []),
  ];

  const summary: GuestReportSummary = {
    guests: guests.length,
    byStatus: [],
    adults: 0,
    children: 0,
    pets: 0,
    plusOnes: 0,
    attendees: 0,
    checkedIn: 0,
    withDietary: 0,
    withAccessibility: 0,
    shirtTally: [],
    shirtsMissing: 0,
    billed: 0,
    collected: 0,
    refunded: 0,
    outstanding: 0,
  };
  const statusCounts = new Map<string, number>();
  const shirtCounts = new Map<string, number>();

  const rows: GuestReportCell[][] = guests.map((g) => {
    const status = text(g?.status) || "pending";
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);

    const plus = plusOnesOf(g);
    const adults = num(g?.adults, 1);
    const children = num(g?.children);
    const petCount = num(g?.pets);
    const heads = partyHeads(g);

    if (status === "yes") {
      const childPlus = plus.filter((p) => p?.isChild).length;
      const adultPlus = plus.length - childPlus;
      summary.adults += adults + adultPlus;
      summary.children += children + childPlus;
      summary.pets += petCount;
      summary.plusOnes += plus.length;
      summary.attendees += heads;
    }
    if (checkedInIds.has(String(g?.id ?? ""))) summary.checkedIn += 1;
    if (text(g?.dietary)) summary.withDietary += 1;
    if (text(g?.accessibilityNotes)) summary.withAccessibility += 1;

    if (shirts) {
      const own = shirtLabel(g?.shirtSize);
      if (own) shirtCounts.set(own, (shirtCounts.get(own) ?? 0) + 1);
      else if (status === "yes") summary.shirtsMissing += 1;
      for (const p of plus) {
        const s = shirtLabel(p?.shirtSize);
        if (s) shirtCounts.set(s, (shirtCounts.get(s) ?? 0) + 1);
        else if (status === "yes") summary.shirtsMissing += 1;
      }
    }

    const owed = reconOwed(data, g);
    const collected = reconCollected(data, g);
    const refunded = refundedOf(g);
    if (status !== "no") {
      summary.billed += owed;
      summary.collected += collected;
      summary.refunded += refunded;
      summary.outstanding += Math.max(0, owed - collected);
    }

    const row: GuestReportCell[] = [
      text(g?.name),
      text(g?.email),
      text(g?.phone),
      text(g?.address),
      STATUS_LABELS[status] ?? status,
      text(g?.source) === "walkin" ? "walk-in" : "invite",
      adults,
      ...(kids ? [children] : []),
      ...(pets ? [petCount] : []),
      plus.length,
      plus.map((p) => text(p?.name)).filter(Boolean).join("; "),
      heads,
      text(g?.dietary),
      text(g?.accessibilityNotes),
      ...(shirts
        ? [
            shirtLabel(g?.shirtSize),
            plus.map((p) => `${text(p?.name) || "plus-one"}: ${shirtLabel(p?.shirtSize) || "—"}`).join("; "),
          ]
        : []),
      ...(shirtsPriced
        ? [
            guestExtraShirtCount(data as unknown as KEvent, g as unknown as Guest),
            money(shirtChargeForGuest(data as unknown as KEvent, g as unknown as Guest)),
          ]
        : []),
      plus
        .filter((p) => text(p?.dietary))
        .map((p) => `${text(p?.name) || "plus-one"}: ${text(p?.dietary)}`)
        .join("; "),
      plus
        .filter((p) => text(p?.accessibility))
        .map((p) => `${text(p?.name) || "plus-one"}: ${text(p?.accessibility)}`)
        .join("; "),
      checkedInIds.has(String(g?.id ?? "")) ? "yes" : "no",
      text(g?.invitedAt),
      num(g?.reminderCount),
      ...(payments
        ? [
            money(owed),
            money(collected),
            money(refunded),
            money(Math.max(0, owed - collected)),
            reportPayBucket(data, g),
            methodsUsed(g),
            lastPaymentAt(g),
            num(g?.payment?.remindersSent),
          ]
        : []),
    ];
    return row;
  });

  summary.byStatus = STATUS_ORDER.filter((s) => statusCounts.has(s)).map((s) => ({
    key: s,
    label: STATUS_LABELS[s] ?? s,
    count: statusCounts.get(s) ?? 0,
  }));
  summary.shirtTally = SHIRT_SIZE_ORDER.map((s) => SHIRT_SIZE_LABELS[s])
    .filter((label) => shirtCounts.has(label))
    .map((label) => ({ label, count: shirtCounts.get(label) ?? 0 }));

  return {
    eventId: eventId ?? text(data?.id),
    title: text(data?.title) || "Untitled event",
    columns,
    rows,
    summary,
    flags: { payments, shirts, pets, kids },
  };
}

/** CSV matrix (header + rows) for a built report. */
export function guestReportMatrix(report: GuestReport): GuestReportCell[][] {
  return [report.columns, ...report.rows];
}

/** Label/value pairs for the summary block, shared by the UI and the email. */
export function guestReportSummaryPairs(report: GuestReport): { label: string; value: string }[] {
  const s = report.summary;
  const pairs: { label: string; value: string }[] = [
    { label: "Guest rows", value: String(s.guests) },
    ...s.byStatus.map((b) => ({ label: b.label, value: String(b.count) })),
    { label: "Confirmed headcount", value: String(s.attendees) },
    { label: "Adults (incl. plus-ones)", value: String(s.adults) },
  ];
  if (report.flags.kids) pairs.push({ label: "Kids", value: String(s.children) });
  if (report.flags.pets) pairs.push({ label: "Pets", value: String(s.pets) });
  pairs.push(
    { label: "Checked in", value: String(s.checkedIn) },
    { label: "With dietary notes", value: String(s.withDietary) },
    { label: "With accessibility needs", value: String(s.withAccessibility) },
  );
  if (report.flags.shirts) {
    pairs.push({
      label: "T-shirt sizes",
      value: s.shirtTally.length ? s.shirtTally.map((t) => `${t.label} ×${t.count}`).join(", ") : "none recorded",
    });
    pairs.push({ label: "Shirt size missing", value: String(s.shirtsMissing) });
  }
  if (report.flags.payments) {
    pairs.push(
      { label: "Billed", value: `$${money(s.billed)}` },
      { label: "Collected", value: `$${money(s.collected)}` },
      { label: "Refunded", value: `$${money(s.refunded)}` },
      { label: "Outstanding", value: `$${money(s.outstanding)}` },
    );
  }
  return pairs;
}

/**
 * Guests (and named plus-ones) who submitted dietary or accessibility notes.
 *
 * Hosts, admins and owners need this as its own short list, not buried in a
 * wide table: it is what actually gets relayed to a caterer or a venue.
 */
export interface GuestNeedRow {
  name: string;
  rsvp: string;
  dietary: string;
  accessibility: string;
}

export function guestNeedRows(report: GuestReport): GuestNeedRow[] {
  const col = (name: string) => report.columns.indexOf(name);
  const iName = col("Name");
  const iRsvp = col("RSVP");
  const iDiet = col("Dietary restrictions");
  const iAcc = col("Accessibility needs");
  const iPlusDiet = col("Plus-one dietary");
  const iPlusAcc = col("Plus-one accessibility");
  const cell = (r: GuestReportCell[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");

  const out: GuestNeedRow[] = [];
  for (const r of report.rows) {
    const rsvp = cell(r, iRsvp);
    const own = { dietary: cell(r, iDiet), accessibility: cell(r, iAcc) };
    if (own.dietary || own.accessibility) {
      out.push({ name: cell(r, iName) || "Guest", rsvp, ...own });
    }
    const plusDiet = cell(r, iPlusDiet);
    const plusAcc = cell(r, iPlusAcc);
    if (plusDiet || plusAcc) {
      out.push({
        name: `${cell(r, iName) || "Guest"}'s party`,
        rsvp,
        dietary: plusDiet,
        accessibility: plusAcc,
      });
    }
  }
  return out;
}
