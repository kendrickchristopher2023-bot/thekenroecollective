import { describe, it, expect } from "vitest";
import {
  billableAdults,
  guestAttendanceAmount,
  memberRole,
  partyMemberCount,
  type Guest,
  type KEvent,
} from "@/lib/events-store";
import { reconOwed } from "@/lib/payment-reconciliation";

function guest(over: Partial<Guest> = {}): Guest {
  return {
    id: "g1",
    name: "Chris K",
    status: "yes",
    adults: 1,
    children: 0,
    ...over,
  } as Guest;
}

const event = {
  id: "e1",
  title: "Dinner",
  paymentEnabled: true,
  paymentPerHead: true,
  paymentAmount: 25,
  guests: [],
} as unknown as KEvent;

describe("derived adults", () => {
  it("counts the guest plus every named plus-one", () => {
    expect(billableAdults(guest())).toBe(1);
    expect(
      billableAdults(guest({ plusOnes: [{ name: "Ada" }, { name: "  " }, { name: "Bo" }] })),
    ).toBe(3);
  });

  it("keeps unnamed adult heads the host recorded", () => {
    expect(billableAdults(guest({ adults: 3 }))).toBe(3);
    expect(billableAdults(guest({ adults: 2, plusOnes: [{ name: "Ada" }] }))).toBe(3);
  });

  it("bills named plus-ones, matching the reconciliation report", () => {
    const g = guest({ plusOnes: [{ name: "Ada" }, { name: "Bo" }] });
    expect(guestAttendanceAmount(event, g)).toBe(75);
    expect(reconOwed(event as never, g as never)).toBe(75);
  });

  it("gives named plus-ones adult seats in the seating chart", () => {
    const g = guest({ adults: 1, children: 2, plusOnes: [{ name: "Ada" }] });
    expect(partyMemberCount(g)).toBe(4);
    expect(Array.from({ length: 4 }, (_, index) => memberRole(g, index))).toEqual([
      "adult",
      "adult",
      "kid",
      "kid",
    ]);
  });
});
