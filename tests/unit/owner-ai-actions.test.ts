import { describe, it, expect } from "vitest";
import {
  ACTION_TTL_MS,
  checkApproval,
  displayStatus,
  needsAmountConfirmation,
  parseAmountToCents,
  PAYLOAD_SCHEMAS,
} from "@/lib/owner-ai-actions";

const base = (over: Partial<any> = {}) => ({
  status: "pending" as const,
  expires_at: new Date(Date.now() + ACTION_TTL_MS).toISOString(),
  amount_cents: 5000,
  requires_amount_confirmation: false,
  ...over,
});

describe("owner AI drafted actions", () => {
  it("allows one-click approval at or under $100", () => {
    expect(needsAmountConfirmation(10_000)).toBe(false);
    expect(checkApproval(base({ amount_cents: 10_000 })).ok).toBe(true);
  });

  it("requires the typed amount over $100", () => {
    expect(needsAmountConfirmation(10_001)).toBe(true);
    const row = base({ amount_cents: 15_000, requires_amount_confirmation: true });
    expect(checkApproval(row)).toMatchObject({ ok: false });
    expect(checkApproval(row, { confirmAmountCents: 14_900 })).toMatchObject({ ok: false });
    expect(checkApproval(row, { confirmAmountCents: 15_000 }).ok).toBe(true);
  });

  it("refuses an expired draft", () => {
    const row = base({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(checkApproval(row)).toMatchObject({ ok: false });
    expect(displayStatus(row)).toBe("expired");
  });

  it("refuses a rejected or already executed draft", () => {
    for (const status of ["rejected", "executed", "executing", "failed"] as const) {
      expect(checkApproval(base({ status }))).toMatchObject({ ok: false });
    }
  });

  it("parses typed amounts", () => {
    expect(parseAmountToCents("$150.00")).toBe(15_000);
    expect(parseAmountToCents("150")).toBe(15_000);
    expect(parseAmountToCents("1,500")).toBe(150_000);
    expect(parseAmountToCents("1.234")).toBe(null);
    expect(parseAmountToCents("abc")).toBe(null);
  });

  it("rejects payloads that could never execute", () => {
    expect(() => PAYLOAD_SCHEMAS.refund.parse({ userId: "nope" })).toThrow();
    expect(() =>
      PAYLOAD_SCHEMAS.customer_sms.parse({ userId: crypto.randomUUID(), toPhone: "1", body: "hi" }),
    ).toThrow();
  });
});
