import { describe, expect, it } from "vitest";
import { pieceEligibility, pieceLoops } from "@/lib/ecard-pieces";

describe("pieceEligibility", () => {
  const base = { owner: false, paid: false, isDemo: false, removed: false };

  it("lets owners add any of their pieces without paying", () => {
    expect(pieceEligibility({ ...base, owner: true })).toEqual({ ok: true });
    expect(pieceEligibility({ ...base, owner: true, isDemo: true })).toEqual({ ok: true });
  });

  it("requires everyone else to have paid first", () => {
    expect(pieceEligibility(base)).toEqual({ ok: false, reason: "unpaid" });
    expect(pieceEligibility({ ...base, paid: true })).toEqual({ ok: true });
  });

  it("keeps test pieces off customers' cards", () => {
    expect(pieceEligibility({ ...base, paid: true, isDemo: true })).toEqual({
      ok: false,
      reason: "demo",
    });
  });

  it("never allows a taken-down piece, even for owners", () => {
    expect(pieceEligibility({ ...base, owner: true, removed: true })).toEqual({
      ok: false,
      reason: "removed",
    });
  });
});

describe("pieceLoops", () => {
  it("repeats a song only when it is the only piece", () => {
    expect(pieceLoops("song", 1)).toBe(true);
    expect(pieceLoops("song", 2)).toBe(false);
    expect(pieceLoops("poem", 1)).toBe(false);
    expect(pieceLoops("letter", 1)).toBe(false);
  });
});
