/**
 * Pure search / filter / sort logic for the host guest list.
 *
 * Kept out of the route component so it can be unit tested and reused by the
 * filter-aware CSV exports (the export must always match what's on screen).
 */
import {
  guestCollected,
  guestOwedAmount,
  isCheckedIn,
  partyHeadcount,
  type Guest,
  type KEvent,
} from "@/lib/events-store";
import { normalizeText, withinOneEdit } from "@/lib/guest-lookup";


export type RsvpFilter = "all" | "pending" | "yes" | "no" | "maybe" | "waitlisted";
/** Party-composition filter, driven by the clickable "Who's coming" tiles. */
export type HasFilter = "" | "adults" | "kids" | "pets" | "plusones";
export type PayFilter = "all" | "unpaid" | "partial" | "paid" | "refunded";
export type CheckFilter = "all" | "in" | "out";
export type SortKey = "name" | "name_desc" | "rsvp" | "party" | "balance" | "recent";

export interface GuestFilterState {
  q: string;
  /**
   * RSVP statuses to keep. Empty (or ["all"]) means every status — the tiles can
   * multi-select, e.g. Confirmed + Maybe.
   */
  rsvp: RsvpFilter;
  /** Extra RSVP statuses selected alongside `rsvp` (multi-select from tiles). */
  rsvpMore: RsvpFilter[];
  has: HasFilter;
  pay: PayFilter;
  chk: CheckFilter;
  size: string; // "" = any t-shirt size, "none" = missing a size
  sort: SortKey;
  /** "attention" applies the Needs attention preset. */
  preset: "" | "attention";
}

export const DEFAULT_GUEST_FILTERS: GuestFilterState = {
  q: "",
  rsvp: "all",
  rsvpMore: [],
  has: "",
  pay: "all",
  chk: "all",
  size: "",
  sort: "name",
  preset: "",
};

const RSVP_VALUES: RsvpFilter[] = ["all", "pending", "yes", "no", "maybe", "waitlisted"];
const PAY_VALUES: PayFilter[] = ["all", "unpaid", "partial", "paid", "refunded"];
const CHK_VALUES: CheckFilter[] = ["all", "in", "out"];
const HAS_VALUES: HasFilter[] = ["", "adults", "kids", "pets", "plusones"];
const SORT_VALUES: SortKey[] = ["name", "name_desc", "rsvp", "party", "balance", "recent"];

function pick<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : fallback;
}

/** Read filter state out of route search params (URL-saved filters). */
export function parseGuestFilters(s: Record<string, unknown>): GuestFilterState {
  return {
    q: typeof s.q === "string" ? s.q : "",
    rsvp: pick(s.rsvp, RSVP_VALUES, "all"),
    rsvpMore:
      typeof s.rsvp2 === "string"
        ? s.rsvp2
            .split(",")
            .map((v) => pick(v, RSVP_VALUES, "all"))
            .filter((v): v is RsvpFilter => v !== "all")
        : [],
    has: pick(s.has, HAS_VALUES, ""),
    pay: pick(s.pay, PAY_VALUES, "all"),
    chk: pick(s.chk, CHK_VALUES, "all"),
    size: typeof s.size === "string" ? s.size : "",
    sort: pick(s.sort, SORT_VALUES, "name"),
    preset: s.preset === "attention" ? "attention" : "",
  };
}

/** Only non-default values go into the URL, so a clean list has a clean link. */
export function serializeGuestFilters(f: GuestFilterState): Record<string, string | undefined> {
  return {
    q: f.q || undefined,
    rsvp: f.rsvp === "all" ? undefined : f.rsvp,
    rsvp2: f.rsvpMore.length ? f.rsvpMore.join(",") : undefined,
    has: f.has || undefined,
    pay: f.pay === "all" ? undefined : f.pay,
    chk: f.chk === "all" ? undefined : f.chk,
    size: f.size || undefined,
    sort: f.sort === "name" ? undefined : f.sort,
    preset: f.preset || undefined,
  };
}

export function hasActiveGuestFilters(f: GuestFilterState): boolean {
  return Object.values(serializeGuestFilters(f)).some((v) => v !== undefined);
}

function payBucket(event: KEvent, g: Guest): PayFilter {
  const status = g.payment?.status;
  if (status === "refunded") return "refunded";
  const owed = guestOwedAmount(event, g);
  const paid = guestCollected(event, g);
  if (status === "paid" || (owed > 0 && paid >= owed)) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

function matchesQuery(g: Guest, needle: string): boolean {
  if (!needle) return true;
  const digits = needle.replace(/\D/g, "");
  if (digits.length >= 3 && (g.phone || "").replace(/\D/g, "").includes(digits)) return true;

  const haystack = normalizeText(
    [g.name, g.email, g.phone, g.address, g.dietary, ...(Array.isArray(g.plusOnes) ? g.plusOnes : []).map((p) => p.name)]
      .filter(Boolean)
      .join(" "),
  );
  const query = normalizeText(needle);
  if (!query) return true;
  if (haystack.includes(query)) return true;

  // Every word the host typed has to hit a word in the guest's details, either as
  // a prefix ("Ose" -> "Osei") or with one typo's tolerance ("Malick" -> "Malik").
  const hayTokens = haystack.split(" ").filter(Boolean);
  return query
    .split(" ")
    .filter(Boolean)
    .every((q) =>
      hayTokens.some(
        (h) => h.startsWith(q) || (q.length >= 4 && (h.includes(q) || withinOneEdit(h, q))),
      ),
    );
}


/**
 * "Needs attention": anyone the host still has to chase — no RSVP yet, or said
 * yes but still owes money, or said yes and hasn't arrived while others have.
 */
export function needsAttention(event: KEvent, g: Guest): boolean {
  if (g.status === "pending" || g.status === "waitlisted") return true;
  if (g.status === "yes") {
    if (event.paymentEnabled) {
      const bucket = payBucket(event, g);
      if (bucket === "unpaid" || bucket === "partial") return true;
    }
    if (event.tshirtSizesEnabled && !g.shirtSize) return true;
  }
  return false;
}

/** Every RSVP status the current filter keeps. Empty array = no restriction. */
export function rsvpSelection(f: GuestFilterState): RsvpFilter[] {
  const set = new Set<RsvpFilter>(f.rsvpMore.filter((v) => v !== "all"));
  if (f.rsvp !== "all") set.add(f.rsvp);
  return [...set];
}

const RSVP_ORDER: Record<string, number> = { pending: 0, maybe: 1, yes: 2, waitlisted: 3, no: 4 };

export function filterSortGuests(event: KEvent, f: GuestFilterState): Guest[] {
  const needle = f.q.trim().toLowerCase();
  const out = event.guests.filter((g) => {
    if (!matchesQuery(g, needle)) return false;
    const wanted = rsvpSelection(f);
    if (wanted.length > 0 && !wanted.includes(g.status as RsvpFilter)) return false;
    if (f.has === "adults" && (g.adults ?? 1) < 1) return false;
    if (f.has === "kids" && (g.children ?? 0) < 1 && !(g.plusOnes ?? []).some((p) => p.isChild)) return false;
    if (f.has === "pets" && (g.pets ?? 0) < 1) return false;
    if (f.has === "plusones" && (g.plusOnes ?? []).length < 1) return false;
    if (f.pay !== "all" && payBucket(event, g) !== f.pay) return false;
    if (f.chk !== "all") {
      const inside = isCheckedIn(event, g.id);
      if (f.chk === "in" && !inside) return false;
      if (f.chk === "out" && inside) return false;
    }
    if (f.size) {
      if (f.size === "none") {
        if (g.shirtSize) return false;
      } else if (g.shirtSize !== f.size) return false;
    }
    if (f.preset === "attention" && !needsAttention(event, g)) return false;
    return true;
  });

  const byName = (a: Guest, b: Guest) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });

  switch (f.sort) {
    case "name_desc":
      return out.sort((a, b) => byName(b, a));
    case "rsvp":
      return out.sort((a, b) => (RSVP_ORDER[a.status] ?? 9) - (RSVP_ORDER[b.status] ?? 9) || byName(a, b));
    case "party":
      return out.sort((a, b) => partyHeadcount(b) - partyHeadcount(a) || byName(a, b));
    case "balance":
      return out.sort(
        (a, b) =>
          guestOwedAmount(event, b) - guestCollected(event, b) -
            (guestOwedAmount(event, a) - guestCollected(event, a)) || byName(a, b),
      );
    case "recent":
      return out.sort((a, b) => {
        const at = a.payment?.sentAt ?? a.invitedAt ?? "";
        const bt = b.payment?.sentAt ?? b.invitedAt ?? "";
        return bt.localeCompare(at) || byName(a, b);
      });
    default:
      return out.sort(byName);
  }
}

export { payBucket as guestPayBucket };
