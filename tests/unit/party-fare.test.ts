import { describe, expect, it } from "vitest";
import { reconOwed, reconcileEvent } from "@/lib/payment-reconciliation";
import { attendanceFare, billableAdultCount } from "@/lib/party-fare";
import { computeOwed, guestOwedAmount, type Guest, type KEvent } from "@/lib/events-store";

const event = {
  id: "e1",
  title: "Reunion",
  paymentEnabled: true,
  paymentAmount: 25,
  paymentAmountChild: 10,
  paymentCurrency: "USD",
} as any;

function guest(over: Partial<Guest> = {}): any {
  return { id: "g1", name: "Quinton Kendrick", status: "yes", adults: 1, children: 0, ...over };
}

describe("shared attendance fare", () => {
  it("bills children at the child rate, not the adult rate", () => {
    const g = guest({ adults: 1, children: 2 });
    expect(attendanceFare(event, g)).toBe(45);
    expect(reconOwed(event, g)).toBe(45);
    expect(guestOwedAmount(event as KEvent, g as Guest)).toBe(45);
  });

  it("charges nothing for a party with no attending heads", () => {
    expect(reconOwed(event, guest({ adults: 0, children: 0, pets: 2 }))).toBe(0);
  });

  it("bills a kids-only party entirely at the child rate", () => {
    expect(reconOwed(event, guest({ adults: 0, children: 3 }))).toBe(30);
  });

  it("counts named plus-ones as adults and ignores blank rows", () => {
    const g = guest({
      adults: 1,
      children: 2,
      plusOnes: [{ name: "Monica" }, { name: "  " }],
    });
    expect(billableAdultCount(g)).toBe(2);
    // 2 adults * 25 + 2 kids * 10 = 70
    expect(reconOwed(event, g)).toBe(70);
    expect(guestOwedAmount(event as KEvent, g as Guest)).toBe(70);
  });

  it("bills a plus-one flagged as a child at the child rate", () => {
    const g = guest({
      adults: 1,
      children: 1,
      plusOnes: [{ name: "Lil Kendrick", isChild: true }],
    });
    // 1 adult * 25 + (1 own child + 1 child plus-one) * 10 = 45
    expect(billableAdultCount(g)).toBe(1);
    expect(reconOwed(event, g)).toBe(45);
    expect(guestOwedAmount(event as KEvent, g as Guest)).toBe(45);
  });

  it("treats a per-guest override as an adult-rate override only", () => {
    const g = guest({ adults: 1, children: 1, payment: { status: "sent", amount: 40 } });
    expect(reconOwed(event, g)).toBe(50);
    expect(computeOwed(event as KEvent, 1, 1, 40)).toBe(50);
  });

  it("falls back to the adult rate when no child rate is set", () => {
    const flat = { ...event, paymentAmountChild: undefined };
    expect(reconOwed(flat, guest({ adults: 1, children: 2 }))).toBe(75);
  });

  it("rolls the child rate into the event reconciliation total", () => {
    const data = {
      ...event,
      guests: [guest({ adults: 2, children: 2 }), guest({ id: "g2", adults: 1, children: 0 })],
    };
    const r = reconcileEvent("e1", data);
    // (2*25 + 2*10) + 25 = 95
    expect(r.billed).toBe(95);
    expect(r.outstanding).toBe(95);
  });
});
