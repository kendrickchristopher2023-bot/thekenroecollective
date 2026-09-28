// The soundtrack is internal-only for now. These lock in that rule and prove
// the switch back to a customer feature still works when we want it.
import { describe, expect, it } from "vitest";
import { canManageSoundtrack, SOUNDTRACK_AUDIENCE } from "@/lib/wall-soundtrack-access";

describe("soundtrack audience", () => {
  it("is owners only today", () => {
    expect(SOUNDTRACK_AUDIENCE).toBe("owners_only");
  });

  it("lets the software owners in", () => {
    expect(canManageSoundtrack({ isOwner: true })).toBe(true);
  });

  it("keeps every customer out, Atelier included", () => {
    expect(canManageSoundtrack({ isOwner: false })).toBe(false);
    expect(canManageSoundtrack({ isOwner: false, hasAtelier: true })).toBe(false);
  });
});
