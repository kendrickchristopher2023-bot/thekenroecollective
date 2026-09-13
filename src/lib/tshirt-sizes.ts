// Single source of truth for the optional per-person T-shirt size field.
// Host+ feature, toggled per event via `tshirtSizesEnabled` on event.data.
// The list is intentionally ONE flat ladder with explicit Youth/Adult labels
// (a parent picking "L" for a 6-year-old was the failure mode we designed
// against) and is enum-only so the public RSVP RPC can never be used to stash
// arbitrary strings inside the event blob.

export const SHIRT_SIZES = [
  "unsure",
  "youth_s",
  "youth_m",
  "youth_l",
  "adult_xs",
  "adult_s",
  "adult_m",
  "adult_l",
  "adult_xl",
  "adult_2xl",
  "adult_3xl",
] as const;

export type ShirtSize = (typeof SHIRT_SIZES)[number];

export const SHIRT_SIZE_LABELS: Record<ShirtSize, string> = {
  unsure: "Unsure / skip",
  youth_s: "Youth S",
  youth_m: "Youth M",
  youth_l: "Youth L",
  adult_xs: "Adult XS",
  adult_s: "Adult S",
  adult_m: "Adult M",
  adult_l: "Adult L",
  adult_xl: "Adult XL",
  adult_2xl: "Adult 2XL",
  adult_3xl: "Adult 3XL",
};

/** Order used for tallies and the shirt-order CSV (skips "unsure" last). */
export const SHIRT_SIZE_ORDER: ShirtSize[] = [
  "youth_s",
  "youth_m",
  "youth_l",
  "adult_xs",
  "adult_s",
  "adult_m",
  "adult_l",
  "adult_xl",
  "adult_2xl",
  "adult_3xl",
  "unsure",
];

export function isShirtSize(v: unknown): v is ShirtSize {
  return typeof v === "string" && (SHIRT_SIZES as readonly string[]).includes(v);
}

export function shirtSizeLabel(v: unknown): string {
  return isShirtSize(v) ? SHIRT_SIZE_LABELS[v] : "";
}

type SizedPerson = { shirtSize?: string };
type SizedGuest = SizedPerson & { status?: string; plusOnes?: SizedPerson[] };

/**
 * Tally sizes across every *person* (guest + each named plus-one), not per
 * RSVP. Only attending guests count, since the host orders shirts for people
 * who are actually coming. Guests with no size recorded are reported
 * separately as `missing` so the host knows who still to chase.
 */
export function tallyShirtSizes(guests: SizedGuest[]): {
  counts: { size: ShirtSize; label: string; count: number }[];
  total: number;
  missing: number;
} {
  const counts = new Map<ShirtSize, number>();
  let missing = 0;
  const record = (raw: unknown) => {
    if (isShirtSize(raw)) counts.set(raw, (counts.get(raw) ?? 0) + 1);
    else missing += 1;
  };
  for (const g of guests) {
    if (g.status === "no" || g.status === "waitlisted") continue;
    record(g.shirtSize);
    for (const p of Array.isArray(g.plusOnes) ? g.plusOnes : []) record(p.shirtSize);
  }
  const rows = SHIRT_SIZE_ORDER.filter((s) => (counts.get(s) ?? 0) > 0).map((s) => ({
    size: s,
    label: SHIRT_SIZE_LABELS[s],
    count: counts.get(s) ?? 0,
  }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return { counts: rows, total, missing };
}

/** "Adult M ×10, Adult L ×6" */
export function formatShirtTally(rows: { label: string; count: number }[]): string {
  return rows.map((r) => `${r.label} ×${r.count}`).join(", ");
}

/** Which price band a size falls into. "unsure" is billed as adult when it exists. */
export function shirtBand(size: ShirtSize): "youth" | "adult" {
  return size.startsWith("youth_") ? "youth" : "adult";
}

/** Sizes offered on the RSVP form. With pricing on, "unsure" is removed: an
 * unpriceable size on a billed line is either a wrong invoice or a free shirt. */
export function selectableShirtSizes(pricingOn: boolean): ShirtSize[] {
  return pricingOn ? SHIRT_SIZE_ORDER.filter((s) => s !== "unsure") : SHIRT_SIZE_ORDER;
}
