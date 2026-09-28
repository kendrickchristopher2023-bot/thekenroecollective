import { describe, expect, it } from "vitest";
import {
  DEFAULT_GUEST_FILTERS,
  filterSortGuests,
  hasActiveGuestFilters,
  needsAttention,
  parseGuestFilters,
  serializeGuestFilters,
} from "@/lib/guest-filters";
import type { KEvent } from "@/lib/events-store";

const event = {
  id: "e1",
  title: "Test",
  paymentEnabled: true,
  paymentAmount: 50,
  tshirtSizesEnabled: true,
  checkIns: [{ guestId: "g2", at: new Date().toISOString() }],
  guests: [
    { id: "g1", name: "Zoe Adams", email: "zoe@x.com", phone: "555-100-2000", status: "pending" },
    {
      id: "g2",
      name: "Aaron Blake",
      email: "aaron@x.com",
      phone: "",
      status: "yes",
      shirtSize: "m",
      adults: 2,
      payment: { status: "paid", paidAmount: 100, history: [{ amount: 100, at: "2026-08-01" }] },
    },
    {
      id: "g3",
      name: "Mia Cruz",
      email: "mia@x.com",
      phone: "",
      status: "yes",
      payment: { status: "partial", paidAmount: 20, history: [{ amount: 20, at: "2026-08-02" }] },
    },
  ],
} as unknown as KEvent;

const f = (patch: Partial<typeof DEFAULT_GUEST_FILTERS>) => ({ ...DEFAULT_GUEST_FILTERS, ...patch });

describe("guest filters", () => {
  it("sorts by name by default", () => {
    expect(filterSortGuests(event, DEFAULT_GUEST_FILTERS).map((g) => g.id)).toEqual(["g2", "g3", "g1"]);
  });

  it("searches name, email, and phone digits", () => {
    expect(filterSortGuests(event, f({ q: "mia" })).map((g) => g.id)).toEqual(["g3"]);
    expect(filterSortGuests(event, f({ q: "aaron@x" })).map((g) => g.id)).toEqual(["g2"]);
    expect(filterSortGuests(event, f({ q: "5551002000" })).map((g) => g.id)).toEqual(["g1"]);
  });

  it("filters by rsvp, payment, check-in, and size", () => {
    expect(filterSortGuests(event, f({ rsvp: "pending" })).map((g) => g.id)).toEqual(["g1"]);
    expect(filterSortGuests(event, f({ pay: "paid" })).map((g) => g.id)).toEqual(["g2"]);
    expect(filterSortGuests(event, f({ pay: "partial" })).map((g) => g.id)).toEqual(["g3"]);
    expect(filterSortGuests(event, f({ chk: "in" })).map((g) => g.id)).toEqual(["g2"]);
    expect(filterSortGuests(event, f({ chk: "out" })).map((g) => g.id)).toEqual(["g3", "g1"]);
    expect(filterSortGuests(event, f({ size: "none" })).map((g) => g.id)).toEqual(["g3", "g1"]);
  });

  it("needs-attention preset covers unreplied and part-paid guests only", () => {
    expect(filterSortGuests(event, f({ preset: "attention" })).map((g) => g.id)).toEqual(["g3", "g1"]);
    expect(needsAttention(event, event.guests[1]!)).toBe(false);
  });

  it("round-trips through URL search params and keeps defaults out of the URL", () => {
    expect(serializeGuestFilters(DEFAULT_GUEST_FILTERS)).toEqual({
      q: undefined,
      rsvp: undefined,
      pay: undefined,
      chk: undefined,
      size: undefined,
      sort: undefined,
      preset: undefined,
    });
    const state = f({ q: "mia", pay: "partial", sort: "balance", preset: "attention" });
    expect(parseGuestFilters(serializeGuestFilters(state) as Record<string, unknown>)).toEqual(state);
    expect(hasActiveGuestFilters(state)).toBe(true);
    expect(hasActiveGuestFilters(DEFAULT_GUEST_FILTERS)).toBe(false);
  });

  it("sorts by largest outstanding balance", () => {
    expect(filterSortGuests(event, f({ sort: "balance" })).map((g) => g.id)[0]).toBe("g1");
  });
});

describe("forgiving guest search", () => {
  const g = (patch: Record<string, unknown>) => ({ id: "x", status: "pending", ...patch });
  const ev = {
    id: "e2",
    guests: [
      g({ id: "m", name: "Malik Osei", email: "malik@x.com" }),
      g({ id: "r", name: "Renée O’Brien", email: "renee@x.com" }),
      g({ id: "w", name: "Wren Alvarez", plusOnes: [{ name: "Theo Alvarez" }] }),
    ],
  } as unknown as KEvent;
  const ids = (q: string) => filterSortGuests(ev, f({ q })).map((x) => x.id);

  it("matches partial words, casing and out-of-order names", () => {
    expect(ids("Malik")).toEqual(["m"]);
    expect(ids("MALIK OSEI")).toEqual(["m"]);
    expect(ids("Ose")).toEqual(["m"]);
    expect(ids("  osei  ")).toEqual(["m"]);
  });

  it("tolerates a typo and missing accents", () => {
    expect(ids("Malick")).toEqual(["m"]);
    expect(ids("renee obrien")).toEqual(["r"]);
  });

  it("still searches plus-one names", () => {
    expect(ids("Theo")).toEqual(["w"]);
  });
});
