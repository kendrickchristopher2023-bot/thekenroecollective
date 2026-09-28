/**
 * Row builders for the two lightweight per-event CSVs offered from the Reports
 * hub. Both derive from the same event `data` blob the app already stores, so
 * they agree with the guest data report and the event's own Reports tab.
 */
import { buildGuestReport, type GuestReportCell } from "@/lib/guest-report";
import { SHIRT_SIZE_LABELS, isShirtSize, tallyShirtSizes, type ShirtSize } from "@/lib/tshirt-sizes";
import {
  guestExtraShirts,
  shirtPriceForSize,
  shirtPricingOn,
  type KEvent,
} from "@/lib/events-store";


type AnyRec = Record<string, any>;

/** Only the attendance-relevant columns of the full guest report. */
export function attendanceCsvRows(data: AnyRec, eventId?: string): GuestReportCell[][] {
  const report = buildGuestReport(data, eventId);
  const wanted = [
    "Name",
    "Email",
    "RSVP",
    "Adults",
    "Kids",
    "Pets",
    "Plus-ones",
    "Party headcount",
    "Checked in",
  ];
  const idx = wanted
    .map((label) => ({ label, i: report.columns.indexOf(label) }))
    .filter((c) => c.i >= 0);
  return [idx.map((c) => c.label), ...report.rows.map((row) => idx.map((c) => row[c.i] ?? ""))];
}

/**
 * Shirt CSV has three sections: the tally the printer needs, extra shirts
 * ordered as spares, then the per-person detail so the host can chase whoever
 * has not picked a size. When the host prices shirts, every section carries
 * money columns so the CSV doubles as the merch invoice.
 */
export function shirtCsvRows(data: AnyRec): GuestReportCell[][] {
  const guests: AnyRec[] = Array.isArray(data?.guests) ? data.guests : [];
  const tally = tallyShirtSizes(guests as never);
  const ev = data as unknown as KEvent;
  const priced = shirtPricingOn(ev);
  const cur = String(data?.paymentCurrency ?? "USD");

  const rows: GuestReportCell[][] = [
    priced ? ["Size", "Quantity", `Unit price (${cur})`, `Line total (${cur})`] : ["Size", "Quantity"],
  ];
  for (const c of tally.counts) {
    if (!priced) {
      rows.push([c.label, c.count]);
      continue;
    }
    const unit = unitFor(ev, c.label);
    rows.push([c.label, c.count, unit.toFixed(2), (unit * c.count).toFixed(2)]);
  }
  rows.push(["Total shirts", tally.total]);
  rows.push(["No size chosen", tally.missing]);

  // Extras are merchandise, so they are listed apart from the per-person rows:
  // a spare shirt has a size and a price but nobody to wear it.
  const extraRows: GuestReportCell[][] = [];
  let extrasTotal = 0;
  let extrasCost = 0;
  for (const g of guests) {
    if (g?.status === "no" || g?.status === "waitlisted") continue;
    const name = String(g?.name ?? "").trim() || "Guest";
    for (const line of guestExtraShirts(ev, g as never)) {
      extrasTotal += line.qty;
      const unit = priced ? shirtPriceForSize(ev, line.size) : 0;
      extrasCost += unit * line.qty;
      extraRows.push(
        priced
          ? [name, SHIRT_SIZE_LABELS[line.size as ShirtSize], line.qty, unit.toFixed(2), (unit * line.qty).toFixed(2)]
          : [name, SHIRT_SIZE_LABELS[line.size as ShirtSize], line.qty],
      );
    }
  }
  if (extraRows.length) {
    rows.push([]);
    rows.push(
      priced
        ? ["Extra shirts, ordered by", "Size", "Quantity", `Unit price (${cur})`, `Line total (${cur})`]
        : ["Extra shirts, ordered by", "Size", "Quantity"],
    );
    rows.push(...extraRows);
    rows.push(priced ? ["Extras total", extrasTotal, "", extrasCost.toFixed(2)] : ["Extras total", extrasTotal]);
  }

  rows.push([]);
  rows.push(priced ? ["Person", "Attending as", "RSVP", "Size", `Shirt cost (${cur})`] : ["Person", "Attending as", "RSVP", "Size"]);
  for (const g of guests) {
    if (g?.status === "no" || g?.status === "waitlisted") continue;
    const name = String(g?.name ?? "").trim() || "Guest";
    rows.push(personRow(ev, priced, name, "Invited guest", String(g?.status ?? ""), g?.shirtSize));
    for (const p of Array.isArray(g?.plusOnes) ? g.plusOnes : []) {
      const pn = String(p?.name ?? "").trim() || "Plus-one";
      rows.push(personRow(ev, priced, pn, `Plus-one of ${name}`, String(g?.status ?? ""), p?.shirtSize));
    }
  }
  return rows;
}

function personRow(
  ev: KEvent,
  priced: boolean,
  who: string,
  role: string,
  status: string,
  size: unknown,
): GuestReportCell[] {
  const base = [who, role, status, sizeLabel(size)];
  if (!priced) return base;
  const cost = isShirtSize(size) ? shirtPriceForSize(ev, size as string) : 0;
  return [...base, cost.toFixed(2)];
}

/** Resolve a display label like "Youth L" back to its unit price. */
function unitFor(ev: KEvent, label: string): number {
  const size = (Object.keys(SHIRT_SIZE_LABELS) as ShirtSize[]).find((s) => SHIRT_SIZE_LABELS[s] === label);
  return size ? shirtPriceForSize(ev, size) : 0;
}

function sizeLabel(v: unknown): string {
  return isShirtSize(v) ? SHIRT_SIZE_LABELS[v as ShirtSize] : "Not chosen";
}
