import { describe, expect, it } from "vitest";
import { computeOwed, kidsAllowed, petsAllowed, type KEvent } from "@/lib/events-store";

function event(over: Partial<KEvent> = {}): KEvent {
  return {
    id: "e1",
    title: "Test",
    guests: [],
    paymentEnabled: true,
    paymentAmount: 25,
    paymentCurrency: "USD",
    ...over,
  } as KEvent;
}

describe("computeOwed", () => {
  it("owes nothing when nobody is attending, whatever the pet count", () => {
    expect(computeOwed(event(), 0, 0)).toBe(0);
  });

  it("still bills real headcount", () => {
    expect(computeOwed(event(), 2, 0)).toBe(50);
    expect(computeOwed(event({ paymentAmountChild: 10 }), 1, 2)).toBe(45);
  });

  it("honours a per-guest override amount", () => {
    expect(computeOwed(event(), 1, 0, 40)).toBe(40);
    expect(computeOwed(event(), 0, 0, 40)).toBe(0);
  });
});

describe("attendee category toggles", () => {
  it("treats legacy events with no setting as fully enabled", () => {
    expect(kidsAllowed(event())).toBe(true);
    expect(petsAllowed(event())).toBe(true);
  });

  it("respects an explicit opt-out", () => {
    expect(kidsAllowed(event({ kidsEnabled: false }))).toBe(false);
    expect(petsAllowed(event({ petsEnabled: false }))).toBe(false);
  });

  it("treats an explicit opt-in as enabled", () => {
    expect(kidsAllowed(event({ kidsEnabled: true }))).toBe(true);
    expect(petsAllowed(event({ petsEnabled: true }))).toBe(true);
  });
});
