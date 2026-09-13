/**
 * The master guest report: every fact about every guest for one event, in one
 * structured model.
 *
 * Pure and store-free on purpose so the host panel, the CSV export, the printed
 * PDF and the server-side report all render the SAME numbers. Every count comes
 * from the shared party helpers in events-store (`billableAdults`,
 * `billableChildren`, `partyMemberCount`, `guestOwedAmount`), so this report
 * cannot disagree with the seating chart or the payment itemisation.
 */
import {
  billableAdults,
  billableChildren,
  findGuestTable,
  guestCollected,
  guestOwedAmount,
  isCheckedIn,
  partyHeadcount,
  partyMemberCount,
  type Guest,
  type KEvent,
} from "@/lib/events-store";
import { SHIRT_SIZE_LABELS, SHIRT_SIZE_ORDER, type ShirtSize } from "@/lib/tshirt-sizes";

export type MasterStatusKey = "yes" | "maybe" | "no" | "pending" | "waitlisted";

export const MASTER_STATUS_LABELS: Record<MasterStatusKey, string> = {
  yes: "Confirmed",
  maybe: "Maybe",
  no: "Declined",
  pending: "No response",
  waitlisted: "Waitlisted",
};

export interface PartyMember {
  name: string;
  role: "Guest" | "Plus-one (adult)" | "Plus-one (child)" | "Child" | "Pet";
  dietary: string;
  accessibility: string;
  shirt: string;
}

export interface MasterGuestRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: MasterStatusKey;
  statusLabel: string;
  /** Adults we count and bill, including named adult plus-ones. */
  adults: number;
  /** Children we count and bill, including plus-ones flagged as children. */
  children: number;
  pets: number;
  /** People in the party (adults + children). Matches capacity + headcount. */
  headcount: number;
  /** Seats the seating chart lays out for this party (people + pets). */
  seatCount: number;
  members: PartyMember[];
  plusOneNames: string[];
  dietary: string;
  accessibility: string;
  shirtSizes: string;
  owed: number;
  paid: number;
  balance: number;
  payStatus: "not billed" | "paid" | "partial" | "unpaid";
  checkedIn: boolean;
  table: string;
  notes: string;
}

export interface DietaryCount {
  label: string;
  count: number;
}

export interface MasterReportTotals {
  guests: number;
  invited: number;
  confirmed: number;
  maybe: number;
  declined: number;
  pending: number;
  waitlisted: number;
  adults: number;
  children: number;
  pets: number;
  attendees: number;
  seats: number;
  checkedIn: number;
  owed: number;
  paid: number;
  outstanding: number;
}

export interface MasterReport {
  eventId: string;
  title: string;
  rows: MasterGuestRow[];
  totals: MasterReportTotals;
  dietaryAggregate: DietaryCount[];
  dietaryFreeText: { name: string; note: string }[];
  shirtTally: { label: string; count: number }[];
  shirtsMissing: number;
  nonResponders: MasterGuestRow[];
  flags: { payments: boolean; shirts: boolean; pets: boolean; kids: boolean; seating: boolean };
  /**
   * The RSVP form does not collect an emergency contact today, so the emergency
   * sheet falls back to each party's own phone number. Surfaced honestly in the
   * UI instead of inventing a field.
   */
  emergencyContactCollected: false;
}

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function statusOf(g: Guest): MasterStatusKey {
  const s = text(g.status);
  return (["yes", "maybe", "no", "waitlisted"] as string[]).includes(s)
    ? (s as MasterStatusKey)
    : "pending";
}

function shirtLabel(v: unknown): string {
  const key = text(v);
  if (!key) return "";
  return SHIRT_SIZE_LABELS[key as ShirtSize] ?? key;
}

/** Keyword buckets for the caterer-facing aggregate. */
const DIET_RULES: { label: string; test: RegExp }[] = [
  { label: "Vegan", test: /\bvegan\b/i },
  { label: "Vegetarian", test: /\bvegetarian|veggie\b/i },
  { label: "Pescatarian", test: /\bpescatarian\b/i },
  { label: "Gluten free", test: /gluten|celiac|coeliac/i },
  { label: "Nut allergy", test: /\bnut|peanut|almond|cashew/i },
  { label: "Dairy free", test: /dairy|lactose|milk|cheese/i },
  { label: "Shellfish allergy", test: /shellfish|shrimp|crab|lobster|prawn/i },
  { label: "Egg allergy", test: /\begg/i },
  { label: "Soy allergy", test: /\bsoy/i },
  { label: "Halal", test: /halal/i },
  { label: "Kosher", test: /kosher/i },
  { label: "No pork", test: /no pork|pork free/i },
  { label: "No alcohol", test: /no alcohol|alcohol free|sober/i },
  { label: "Diabetic / low sugar", test: /diabet|low sugar|sugar free/i },
];

export function buildMasterReport(event: KEvent): MasterReport {
  const guests = Array.isArray(event.guests) ? event.guests : [];
  const payments = !!event.paymentEnabled || (event.paymentAmount ?? 0) > 0;
  const shirts = !!event.tshirtSizesEnabled;
  const pets = event.petsEnabled !== false;
  const kids = event.kidsEnabled !== false;
  const seating = (event.seatingTables ?? []).length > 0;

  const totals: MasterReportTotals = {
    guests: guests.length,
    invited: guests.length,
    confirmed: 0,
    maybe: 0,
    declined: 0,
    pending: 0,
    waitlisted: 0,
    adults: 0,
    children: 0,
    pets: 0,
    attendees: 0,
    seats: 0,
    checkedIn: 0,
    owed: 0,
    paid: 0,
    outstanding: 0,
  };

  const dietCounts = new Map<string, number>();
  const dietFree: { name: string; note: string }[] = [];
  const shirtCounts = new Map<string, number>();
  let shirtsMissing = 0;

  function tallyDiet(name: string, note: string) {
    const value = note.trim();
    if (!value) return;
    let matched = false;
    for (const rule of DIET_RULES) {
      if (rule.test.test(value)) {
        dietCounts.set(rule.label, (dietCounts.get(rule.label) ?? 0) + 1);
        matched = true;
      }
    }
    if (!matched) dietFree.push({ name, note: value });
  }

  const rows: MasterGuestRow[] = guests.map((g) => {
    const status = statusOf(g);
    const plus = Array.isArray(g.plusOnes) ? g.plusOnes : [];
    const adults = billableAdults(g);
    const children = billableChildren(g);
    const petCount = Math.max(0, g.pets ?? 0);
    const headcount = partyHeadcount(g);
    const seatCount = partyMemberCount(g);

    totals[status === "yes" ? "confirmed" : status === "maybe" ? "maybe" : status === "no" ? "declined" : status === "waitlisted" ? "waitlisted" : "pending"] += 1;
    if (status === "yes") {
      totals.adults += adults;
      totals.children += children;
      totals.pets += petCount;
      totals.attendees += headcount;
      totals.seats += seatCount;
    }
    if (isCheckedIn(event, g.id)) totals.checkedIn += 1;

    const members: PartyMember[] = [
      {
        name: text(g.name) || "Guest",
        role: "Guest",
        dietary: text(g.dietary),
        accessibility: text(g.accessibilityNotes),
        shirt: shirtLabel(g.shirtSize),
      },
      ...plus.map((p) => ({
        name: text((p as any).name) || "Plus-one",
        role: ((p as any).isChild ? "Plus-one (child)" : "Plus-one (adult)") as PartyMember["role"],
        dietary: text((p as any).dietary),
        accessibility: text((p as any).accessibility),
        shirt: shirtLabel((p as any).shirtSize),
      })),
    ];
    const unnamedKids = Math.max(0, (g.children ?? 0));
    for (let i = 0; i < unnamedKids; i++) {
      members.push({ name: `Child ${i + 1} (unnamed)`, role: "Child", dietary: "", accessibility: "", shirt: "" });
    }
    for (let i = 0; i < petCount; i++) {
      members.push({ name: `Pet ${i + 1}`, role: "Pet", dietary: "", accessibility: "", shirt: "" });
    }

    if (status !== "no") {
      for (const m of members) {
        if (m.role === "Pet") continue;
        tallyDiet(m.name, m.dietary);
        if (shirts) {
          if (m.shirt) shirtCounts.set(m.shirt, (shirtCounts.get(m.shirt) ?? 0) + 1);
          else if (status === "yes" && m.role !== "Child") shirtsMissing += 1;
        }
      }
    }

    const owed = guestOwedAmount(event, g);
    const paid = Math.max(0, guestCollected(event, g));
    const balance = Math.max(0, owed - paid);
    if (status !== "no") {
      totals.owed += owed;
      totals.paid += paid;
      totals.outstanding += balance;
    }

    const payStatus: MasterGuestRow["payStatus"] =
      owed <= 0 ? "not billed" : paid >= owed ? "paid" : paid > 0 ? "partial" : "unpaid";

    const table = findGuestTable(event, g.id);

    return {
      id: g.id,
      name: text(g.name) || "Guest",
      email: text(g.email),
      phone: text(g.phone),
      status,
      statusLabel: MASTER_STATUS_LABELS[status],
      adults,
      children,
      pets: petCount,
      headcount,
      seatCount,
      members,
      plusOneNames: plus.map((p) => text((p as any).name)).filter(Boolean),
      dietary: members
        .filter((m) => m.dietary)
        .map((m) => `${m.name}: ${m.dietary}`)
        .join("; "),
      accessibility: members
        .filter((m) => m.accessibility)
        .map((m) => `${m.name}: ${m.accessibility}`)
        .join("; "),
      shirtSizes: members
        .filter((m) => m.shirt)
        .map((m) => `${m.name}: ${m.shirt}`)
        .join("; "),
      owed,
      paid,
      balance,
      payStatus,
      checkedIn: isCheckedIn(event, g.id),
      table: table ? table.label || "Table" : "",
      notes: text((g as any).notes ?? (g as any).hostNote),
    };
  });

  const dietaryAggregate = [...dietCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const shirtTally = SHIRT_SIZE_ORDER.map((s) => SHIRT_SIZE_LABELS[s])
    .filter((label) => shirtCounts.has(label))
    .map((label) => ({ label, count: shirtCounts.get(label) ?? 0 }));

  return {
    eventId: event.id,
    title: event.title || "Untitled event",
    rows,
    totals,
    dietaryAggregate,
    dietaryFreeText: dietFree,
    shirtTally,
    shirtsMissing,
    nonResponders: rows.filter((r) => r.status === "pending"),
    flags: { payments, shirts, pets, kids, seating },
    emergencyContactCollected: false,
  };
}

/** Flat CSV matrix for the master report (one row per guest party). */
export function masterReportMatrix(
  report: MasterReport,
  /** Optional guest id -> invitation open label, appended as a final column. */
  openLabels?: Map<string, string>,
): (string | number)[][] {

  const f = report.flags;
  const header = [
    "Name",
    "Email",
    "Phone",
    "RSVP",
    "Adults",
    ...(f.kids ? ["Children"] : []),
    ...(f.pets ? ["Pets"] : []),
    "Party headcount",
    ...(f.seating ? ["Seats (incl. pets)", "Table"] : []),
    "Party members",
    "Plus-one names",
    "Dietary / allergies",
    "Accessibility needs",
    ...(f.shirts ? ["T-shirt sizes"] : []),
    ...(f.payments ? ["Owed", "Paid", "Balance", "Payment status"] : []),
    "Checked in",
    "Host notes",
    ...(openLabels ? ["Invitation opened"] : []),
  ];

  const body = report.rows.map((r) => [
    r.name,
    r.email,
    r.phone,
    r.statusLabel,
    r.adults,
    ...(f.kids ? [r.children] : []),
    ...(f.pets ? [r.pets] : []),
    r.headcount,
    ...(f.seating ? [r.seatCount, r.table] : []),
    r.members.map((m) => `${m.name} (${m.role})`).join("; "),
    r.plusOneNames.join("; "),
    r.dietary,
    r.accessibility,
    ...(f.shirts ? [r.shirtSizes] : []),
    ...(f.payments
      ? [r.owed.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2), r.payStatus]
      : []),
    r.checkedIn ? "yes" : "no",
    r.notes,
    ...(openLabels ? [openLabels.get(r.id) ?? "Not tracked"] : []),
  ]);

  return [header, ...body];
}

/** Per-person CSV: one line per human, plus-ones on their own rows. */
export function masterPeopleMatrix(report: MasterReport): (string | number)[][] {
  const header = ["Party", "Person", "Role", "RSVP", "Dietary / allergies", "Accessibility", "T-shirt size", "Table"];
  const body: (string | number)[][] = [];
  for (const r of report.rows) {
    for (const m of r.members) {
      body.push([r.name, m.name, m.role, r.statusLabel, m.dietary, m.accessibility, m.shirt, r.table]);
    }
  }
  return [header, ...body];
}
