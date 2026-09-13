import { describe, expect, it } from "vitest";
import {
  guestExtraShirtCount,
  guestOwedAmount,
  maxExtraShirts,
  shirtChargeLive,
  shirtPricingOn,
  shirtUnitPrice,
  type Guest,
  type KEvent,
} from "@/lib/events-store";
import { reconOwed } from "@/lib/payment-reconciliation";
import { shirtCsvRows } from "@/lib/report-csv";

function ev(over: Partial<KEvent> = {}): KEvent {
  return {
    id: "e1",
    title: "Test",
    guests: [],
    paymentEnabled: true,
    paymentAmount: 20,
    tshirtSizesEnabled: true,
    shirtPricingEnabled: true,
    shirtPriceAdult: 25,
    ...over,
  } as unknown as KEvent;
}

function guest(over: Partial<Guest> = {}): Guest {
  return { id: "g1", name: "Chris Kenroe", status: "yes", adults: 1, ...over } as unknown as Guest;
}

describe("shirt pricing", () => {
  it("stays off until payments, sizes and a price are all in place", () => {
    expect(shirtPricingOn(ev())).toBe(true);
    expect(shirtPricingOn(ev({ paymentEnabled: false }))).toBe(false);
    expect(shirtPricingOn(ev({ tshirtSizesEnabled: false }))).toBe(false);
    expect(shirtPricingOn(ev({ shirtPricingEnabled: false }))).toBe(false);
    expect(shirtPricingOn(ev({ shirtPriceAdult: 0 }))).toBe(false);
  });

  it("falls back to the adult price when youth is blank", () => {
    expect(shirtUnitPrice(ev(), "youth")).toBe(25);
    expect(shirtUnitPrice(ev({ shirtPriceYouth: 15 }), "youth")).toBe(15);
    expect(shirtUnitPrice(ev({ shirtPriceYouth: 0 }), "youth")).toBe(0);
  });

  it("charges each person's own shirt plus extras", () => {
    const e = ev({ shirtPriceYouth: 15, extraShirtsEnabled: true, maxExtraShirtsPerRsvp: 5 });
    const g = guest({
      shirtSize: "adult_l",
      plusOnes: [{ name: "Sam K", shirtSize: "youth_m" }] as never,
      extraShirts: [{ size: "adult_m", qty: 2 }],
    });
    // 25 adult + 15 youth + 2 x 25 extras
    expect(shirtChargeLive(e, g)).toBe(90);
    expect(guestExtraShirtCount(e, g)).toBe(2);
  });

  it("never bills declined or waitlisted RSVPs for shirts", () => {
    const g = guest({ status: "no", shirtSize: "adult_l" });
    expect(shirtChargeLive(ev(), g)).toBe(0);
    expect(shirtChargeLive(ev(), guest({ status: "waitlisted", shirtSize: "adult_l" }))).toBe(0);
  });

  it("clamps extras to the host ceiling and the hard cap", () => {
    expect(maxExtraShirts(ev({ maxExtraShirtsPerRsvp: 99 }))).toBe(10);
    expect(maxExtraShirts(ev({ maxExtraShirtsPerRsvp: -2 }))).toBe(0);
    const e = ev({ extraShirtsEnabled: true, maxExtraShirtsPerRsvp: 3 });
    const g = guest({ extraShirts: [{ size: "adult_m", qty: 9 }] });
    expect(guestExtraShirtCount(e, g)).toBe(3);
    expect(shirtChargeLive(e, g)).toBe(75);
  });

  it("ignores extras when the host never enabled them", () => {
    const g = guest({ extraShirts: [{ size: "adult_m", qty: 4 }] });
    expect(shirtChargeLive(ev(), g)).toBe(0);
  });

  it("adds shirts to the attendance fare", () => {
    const g = guest({ adults: 2, shirtSize: "adult_l" });
    expect(guestOwedAmount(ev(), g)).toBe(20 * 2 + 25);
  });

  it("honours the frozen snapshot so price edits never rewrite a sent invoice", () => {
    const g = guest({ shirtSize: "adult_l", payment: { status: "sent", shirtAmount: 25 } as never });
    // Host doubles the price after billing: the guest still owes the old amount.
    expect(guestOwedAmount(ev({ shirtPriceAdult: 50 }), g)).toBe(20 + 25);
  });

  it("reconciliation agrees with the store math, including the snapshot", () => {
    const e = ev({ paymentPerHead: true, extraShirtsEnabled: true } as Partial<KEvent>);
    const g = guest({ shirtSize: "adult_l", extraShirts: [{ size: "youth_s", qty: 1 }] });
    expect(reconOwed(e as never, g as never)).toBe(guestOwedAmount(e, g));
    const billed = guest({ shirtSize: "adult_l", payment: { status: "sent", shirtAmount: 5 } as never });
    expect(reconOwed(e as never, billed as never)).toBe(guestOwedAmount(e, billed));
  });

  it("puts money columns and an extras section in the shirt CSV", () => {
    const e = ev({
      extraShirtsEnabled: true,
      guests: [guest({ shirtSize: "adult_l", extraShirts: [{ size: "adult_m", qty: 2 }] })],
    });
    const rows = shirtCsvRows(e as never).map((r) => r.join("|"));
    expect(rows[0]).toContain("Unit price (USD)");
    expect(rows.some((r) => r.startsWith("Extra shirts, ordered by"))).toBe(true);
    expect(rows.some((r) => r.includes("Extras total|2||50.00"))).toBe(true);
  });

  it("omits money columns when shirts are collected but not priced", () => {
    const e = ev({ shirtPricingEnabled: false, guests: [guest({ shirtSize: "adult_l" })] });
    expect(shirtCsvRows(e as never)[0]).toEqual(["Size", "Quantity"]);
  });
});
