import { describe, expect, it } from "vitest";
import {
  COMPOSED_MAX_MS,
  ENTRANCE_MS,
  ENTRANCE_PACES,
  FADE_MS,
  FREE_ANIMATIONS,
  INVITE_ANIMATIONS,
  entranceDurationMs,
  entrancePhases,
  normalizePace,
  gateEntrance,
  isJarringForOccasion,
  isPremiumEntrance,
  occasionIsSolemn,
  recommendedEntrances,
} from "@/lib/invite-entrances";

describe("entrance catalogue", () => {
  it("keeps the seven original entrances plus the two new ones", () => {
    const ids = INVITE_ANIMATIONS.map((a) => a.id);
    for (const id of [
      "none",
      "envelope",
      "airplane",
      "confetti",
      "curtain",
      "fireworks",
      "balloons",
      "sparkle",
    ]) {
      expect(ids).toContain(id);
    }
    expect(ids).toContain("lightning");
    expect(ids).toContain("dawn");
  });

  it("only includes no-animation and the envelope on every plan", () => {
    expect(FREE_ANIMATIONS).toEqual(["none", "envelope"]);
    expect(isPremiumEntrance("envelope")).toBe(false);
    expect(isPremiumEntrance("lightning")).toBe(true);
    expect(isPremiumEntrance("dawn")).toBe(true);
  });

  it("is composed and still within the budget at every pace", () => {
    for (const a of INVITE_ANIMATIONS) {
      for (const p of ENTRANCE_PACES) {
        expect(entrancePhases(a.id, p.id).composed).toBeLessThanOrEqual(COMPOSED_MAX_MS);
      }
    }
    expect(entranceDurationMs("nonsense")).toBe(ENTRANCE_MS.envelope);
  });
});

describe("phase budget", () => {
  it("spends time on a held beat, an ease in, a settle and stillness", () => {
    const t = entrancePhases("envelope", "balanced");
    expect(t.hold).toBeGreaterThanOrEqual(300);
    expect(t.settle).toBeGreaterThan(t.travel * 0.5);
    expect(t.rest).toBeGreaterThanOrEqual(FADE_MS);
    expect(t.composed).toBe(t.hold + t.travel + t.settle);
    expect(t.total).toBe(t.composed + t.rest);
  });

  it("moves the whole piece in proportion when the pace changes", () => {
    const subtle = entrancePhases("dawn", "subtle");
    const balanced = entrancePhases("dawn", "balanced");
    const cinematic = entrancePhases("dawn", "cinematic");
    expect(subtle.total).toBeLessThan(balanced.total);
    expect(cinematic.total).toBeGreaterThan(balanced.total);
    // The settle is never clipped away to save time.
    for (const t of [subtle, balanced, cinematic]) {
      expect(t.settle / t.travel).toBeGreaterThan(0.6);
      expect(t.hold).toBeGreaterThan(200);
    }
  });

  it("keeps the reveal shorter in the builder preview", () => {
    expect(entrancePhases("confetti", "balanced", 0.55).total).toBeLessThan(
      entrancePhases("confetti", "balanced").total,
    );
  });

  it("treats no animation as no time at all", () => {
    expect(entrancePhases("none", "cinematic").total).toBe(0);
  });

  it("falls back to the balanced pace", () => {
    expect(normalizePace(undefined)).toBe("balanced");
    expect(normalizePace("nonsense")).toBe("balanced");
    expect(normalizePace("cinematic")).toBe("cinematic");
  });
});

describe("plan gate", () => {
  it("falls back to the envelope below the Host plan", () => {
    expect(gateEntrance("lightning", "postcard")).toBe("envelope");
    expect(gateEntrance("confetti", "whisper")).toBe("envelope");
    expect(gateEntrance("dawn", "host")).toBe("dawn");
    expect(gateEntrance("fireworks", "atelier")).toBe("fireworks");
  });

  it("keeps the included choices at every plan", () => {
    expect(gateEntrance("none", "postcard")).toBe("none");
    expect(gateEntrance("envelope", "postcard")).toBe("envelope");
  });

  it("treats an unknown id as the envelope", () => {
    expect(gateEntrance("hyperdrive", "atelier")).toBe("envelope");
    expect(gateEntrance(null, "atelier")).toBe("envelope");
  });
});

describe("occasion matching", () => {
  it("recognises solemn occasions", () => {
    expect(occasionIsSolemn("Memorial for Grandma Ruthie")).toBe(true);
    expect(occasionIsSolemn("A celebration of life")).toBe(true);
    expect(occasionIsSolemn("Kendrick Family Reunion")).toBe(false);
  });

  it("never recommends a shower for a memorial", () => {
    const rec = recommendedEntrances("Memorial service");
    expect(rec).not.toContain("confetti");
    expect(rec).not.toContain("fireworks");
    expect(rec[0]).toBe("dawn");
  });

  it("flags a jarring pick so the host is asked once", () => {
    expect(isJarringForOccasion("confetti", "Memorial service")).toBe(true);
    expect(isJarringForOccasion("dawn", "Memorial service")).toBe(false);
    expect(isJarringForOccasion("confetti", "40th birthday")).toBe(false);
  });

  it("suggests festive entrances for festive events", () => {
    expect(recommendedEntrances("Maya's 30th Birthday")).toContain("confetti");
    expect(recommendedEntrances("Awards gala")).toContain("curtain");
  });
});
