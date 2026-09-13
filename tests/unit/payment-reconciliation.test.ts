import { describe, expect, it } from "vitest";
import { reconcileEvent, rollUp, methodBreakdown } from "@/lib/payment-reconciliation";
import { remindablePaymentGuests, type KEvent, type Guest } from "@/lib/events-store";

const data = {
  title: "Reunion",
  paymentEnabled: true,
  paymentAmount: 100,
  guests: [
    {
      id: "a",
      name: "Alex",
      status: "yes",
      payment: {
        status: "partial",
        history: [{ id: "h1", at: "", amount: 40, method: "cashapp", kind: "payment" }],
      },
    },
    {
      id: "b",
      name: "Bo",
      status: "yes",
      payment: {
        status: "paid",
        history: [
          { id: "h2", at: "", amount: 100, method: "zelle", kind: "payment" },
          { id: "h3", at: "", amount: -25, method: "zelle", kind: "refund" },
        ],
      },
    },
    { id: "c", name: "Cy", status: "yes", payment: { status: "sent" } },
  ],
};

describe("reconcileEvent", () => {
  const r = reconcileEvent("e1", data);

  it("splits billed, collected and outstanding", () => {
    expect(r.billed).toBe(300);
    expect(r.collected).toBe(115);
    expect(r.refunded).toBe(25);
    expect(r.outstanding).toBe(185);
  });

  it("counts unpaid and partial guests separately", () => {
    expect(r.unpaidGuests).toBe(1);
    expect(r.partialGuests).toBe(2);
  });

  it("breaks money down by self-reported method", () => {
    const byMethod = Object.fromEntries(methodBreakdown(data).map((m) => [m.method, m.net]));
    expect(byMethod["cashapp"]).toBe(40);
    expect(byMethod["zelle"]).toBe(75);
  });

  it("attributes legacy records with no history to Other", () => {
    const legacy = methodBreakdown({
      paymentAmount: 50,
      guests: [{ id: "x", payment: { status: "paid", paidAmount: 50 } }],
    });
    expect(legacy).toEqual([
      expect.objectContaining({ method: "other", received: 50, net: 50, entries: 1 }),
    ]);
  });
});

describe("rollUp", () => {
  it("adds events together and merges methods", () => {
    const total = rollUp([reconcileEvent("e1", data), reconcileEvent("e2", data)]);
    expect(total.events).toBe(2);
    expect(total.billed).toBe(600);
    expect(total.collected).toBe(230);
    expect(total.byMethod.find((m) => m.method === "cashapp")?.net).toBe(80);
  });
});

describe("remindablePaymentGuests", () => {
  const ev = {
    id: "e1",
    title: "Reunion",
    paymentEnabled: true,
    paymentAmount: 100,
    guests: data.guests as unknown as Guest[],
  } as KEvent;

  it("separates unpaid from part paid so bulk sends never overlap", () => {
    const unpaid = remindablePaymentGuests(ev, "unpaid").map((g) => g.id);
    const partial = remindablePaymentGuests(ev, "partial").map((g) => g.id);
    expect(unpaid).toEqual(["c"]);
    expect(partial).toEqual(["a"]);
    expect(unpaid.some((id) => partial.includes(id))).toBe(false);
  });

  it("all is the union of both scopes", () => {
    expect(remindablePaymentGuests(ev, "all").map((g) => g.id).sort()).toEqual(["a", "c"]);
  });
});
