import { describe, it, expect } from "vitest";
import { guestJumpNeedsImport, thankYouMeaningfullyChanged, canonicalJson } from "@/lib/save-gates";
describe("save gates", () => {
  it("lets hand-typed jumps through", () => {
    expect(guestJumpNeedsImport(0, 2)).toBe(false);
    expect(guestJumpNeedsImport(10, 13)).toBe(false);
    expect(guestJumpNeedsImport(10, 60)).toBe(false);
    expect(guestJumpNeedsImport(10, 61)).toBe(true);
  });
  it("ignores key order from jsonb", () => {
    const a = [{ id: "c1", message: "hi", design: "ivory", recipientIds: ["g1"], channel: "email", createdAt: "x" }];
    const b = [{ createdAt: "x", channel: "email", recipientIds: ["g1"], design: "ivory", message: "hi", id: "c1", photo: undefined }];
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(thankYouMeaningfullyChanged(a, b)).toBe(false);
  });
  it("flags add, edit, sent; allows removal", () => {
    const a = [{ id: "c1", message: "hi" }];
    expect(thankYouMeaningfullyChanged(a, [...a, { id: "c2", message: "x" }])).toBe(true);
    expect(thankYouMeaningfullyChanged(a, [{ id: "c1", message: "changed" }])).toBe(true);
    expect(thankYouMeaningfullyChanged(a, [{ id: "c1", message: "hi", sentAt: "now" }])).toBe(true);
    expect(thankYouMeaningfullyChanged(a, [])).toBe(false);
    expect(thankYouMeaningfullyChanged(undefined, undefined)).toBe(false);
    expect(thankYouMeaningfullyChanged(null, [])).toBe(false);
  });
});
