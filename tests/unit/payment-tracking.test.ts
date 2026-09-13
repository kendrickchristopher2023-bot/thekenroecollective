import { describe, expect, it } from "vitest";
import {
  paymentReport,
  paymentReminderEligible,
  guestCollected,
  refundedTotal,
  derivePaymentStatus,
  PAYMENT_REMINDER_MAX,
  type KEvent,
  type Guest,
  type PaymentStatus,
} from "@/lib/events-store";

function guest(over: Partial<Guest> = {}): Guest {
  return {
    id: over.id ?? "g1",
    name: "Alex",
    status: "yes",
    adults: 1,
    children: 0,
    ...over,
  } as Guest;
}

function event(guests: Guest[], over: Partial<KEvent> = {}): KEvent {
  return {
    id: "e1",
    title: "Test",
    guests,
    paymentEnabled: true,
    paymentAmount: 100,
    paymentCurrency: "USD",
    ...over,
  } as KEvent;
}

describe("paymentReport", () => {
  it("counts partial payments in collected instead of dropping them", () => {
    const g = guest({
      payment: {
        status: "partial",
        history: [{ id: "h1", at: new Date().toISOString(), amount: 40, method: "venmo", kind: "payment" }],
      },
    });
    const r = paymentReport(event([g]));
    expect(r.billed).toBe(100);
    expect(r.collected).toBe(40);
    expect(r.outstanding).toBe(60);
    expect(r.byStatus.partial).toBe(1);
  });

  it("nets refunds out of collected while keeping the payment record", () => {
    const g = guest({
      payment: {
        status: "refunded",
        history: [
          { id: "h1", at: "2026-01-01T00:00:00Z", amount: 100, method: "cash", kind: "payment" },
          { id: "h2", at: "2026-01-05T00:00:00Z", amount: -100, method: "cash", kind: "refund" },
        ],
      },
    });
    const ev = event([g]);
    expect(guestCollected(ev, g)).toBe(0);
    expect(refundedTotal(g)).toBe(100);
    const r = paymentReport(ev);
    expect(r.collected).toBe(0);
    expect(r.refunded).toBe(100);
    // The original payment is still on file.
    expect(g.payment!.history!.length).toBe(2);
  });

  it("still honours the legacy paidAmount figure with no history", () => {
    const g = guest({ payment: { status: "paid", paidAmount: 100 } });
    expect(paymentReport(event([g])).collected).toBe(100);
  });

  it("treats a legacy paid guest with no amount as fully paid", () => {
    const g = guest({ payment: { status: "paid" } });
    expect(guestCollected(event([g]), g)).toBe(100);
  });
});

describe("derivePaymentStatus", () => {
  const ev = event([]);
  it("marks partial when some money is in", () => {
    const g = guest({ payment: { status: "sent", history: [{ id: "a", at: "", amount: 20, method: "cash", kind: "payment" }] } });
    expect(derivePaymentStatus(ev, g, "sent")).toBe("partial");
  });
  it("marks paid once the balance is settled", () => {
    const g = guest({ payment: { status: "partial", history: [{ id: "a", at: "", amount: 100, method: "cash", kind: "payment" }] } });
    expect(derivePaymentStatus(ev, g, "partial")).toBe("paid");
  });
  it("marks refunded when everything went back", () => {
    const g = guest({
      payment: {
        status: "paid",
        history: [
          { id: "a", at: "", amount: 100, method: "cash", kind: "payment" },
          { id: "b", at: "", amount: -100, method: "cash", kind: "refund" },
        ],
      },
    });
    expect(derivePaymentStatus(ev, g, "paid")).toBe("refunded");
  });
  it("never resurrects a canceled guest", () => {
    const g = guest({ payment: { status: "canceled", history: [{ id: "a", at: "", amount: 100, method: "cash", kind: "payment" }] } });
    expect(derivePaymentStatus(ev, g, "canceled")).toBe("canceled");
  });
});

describe("paymentReminderEligible", () => {
  const now = Date.parse("2026-06-01T12:00:00Z");
  const base = { status: "sent" as PaymentStatus, remindersSent: 0 };

  it("nudges a confirmed guest with a balance", () => {
    const g = guest({ payment: base });
    expect(paymentReminderEligible(event([g]), g, now)).toBe(true);
  });

  it("skips guests who are fully paid, refunded or canceled", () => {
    for (const status of ["paid", "refunded", "canceled"] as PaymentStatus[]) {
      const g = guest({ payment: { ...base, status } });
      expect(paymentReminderEligible(event([g]), g, now)).toBe(false);
    }
  });

  it("skips guests who never got a link", () => {
    const g = guest({ payment: { status: "not_sent" } });
    expect(paymentReminderEligible(event([g]), g, now)).toBe(false);
  });

  it("skips declined guests and maybes who did not opt in", () => {
    expect(paymentReminderEligible(event([]), guest({ status: "no", payment: base }), now)).toBe(false);
    expect(paymentReminderEligible(event([]), guest({ status: "maybe", payment: base }), now)).toBe(false);
    expect(
      paymentReminderEligible(event([]), guest({ status: "maybe", payment: { ...base, remindersOptIn: true } }), now),
    ).toBe(true);
  });

  it("caps the number of nudges", () => {
    const g = guest({ payment: { ...base, remindersSent: PAYMENT_REMINDER_MAX } });
    expect(paymentReminderEligible(event([g]), g, now)).toBe(false);
  });

  it("enforces 72h spacing between nudges", () => {
    const recent = guest({
      payment: { ...base, remindersSent: 1, lastReminderAt: new Date(now - 24 * 3600_000).toISOString() },
    });
    expect(paymentReminderEligible(event([recent]), recent, now)).toBe(false);
    const old = guest({
      payment: { ...base, remindersSent: 1, lastReminderAt: new Date(now - 80 * 3600_000).toISOString() },
    });
    expect(paymentReminderEligible(event([old]), old, now)).toBe(true);
  });

  it("stops once the balance is covered even if the status label lags", () => {
    const g = guest({
      payment: { ...base, history: [{ id: "a", at: "", amount: 100, method: "zelle", kind: "payment" }] },
    });
    expect(paymentReminderEligible(event([g]), g, now)).toBe(false);
  });
});

describe("paymentReport adult/child split", () => {
  it("splits billed attendance into adult and child money at the child rate", () => {
    const g = guest({
      adults: 2,
      children: 2,
      plusOnes: [{ name: "Kid Sis", isChild: true }, { name: "Uncle" }] as any,
    });
    const r = paymentReport(event([g], { paymentAmountChild: 25 }));
    expect(r.adultHeads).toBe(3); // 2 adults + adult plus-one
    expect(r.childHeads).toBe(3); // 2 children + child plus-one
    expect(r.billedAdults).toBe(300);
    expect(r.billedChildren).toBe(75);
    expect(r.billedAdults + r.billedChildren).toBe(r.billedAttendance);
    expect(r.childRate).toBe(25);
  });

  it("falls back to the adult rate when no child rate is set", () => {
    const r = paymentReport(event([guest({ adults: 1, children: 1 })]));
    expect(r.childRate).toBe(100);
    expect(r.billedChildren).toBe(100);
    expect(r.billedAdults + r.billedChildren).toBe(r.billedAttendance);
  });
});
