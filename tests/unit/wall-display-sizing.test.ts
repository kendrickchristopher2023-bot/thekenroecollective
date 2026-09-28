import { describe, expect, it } from "vitest";
import { WALL_CHROME, PACE_STEPS, PACE_LABELS } from "@/lib/wall-chrome";

describe("wall display sizing", () => {
  it("covers every display class with a chrome preset", () => {
    for (const key of ["phone", "tablet", "laptop", "tv"] as const) {
      expect(WALL_CHROME[key]).toBeDefined();
      expect(WALL_CHROME[key].rotateMs).toBeGreaterThan(0);
    }
  });

  it("holds photos longer as the screen gets further away", () => {
    expect(WALL_CHROME.phone.rotateMs).toBeLessThan(WALL_CHROME.tv.rotateMs);
    expect(WALL_CHROME.laptop.rotateMs).toBeLessThanOrEqual(WALL_CHROME.tv.rotateMs);
  });

  it("hides the QR panel only on a phone", () => {
    expect(WALL_CHROME.phone.compactQr).toBe(true);
    expect(WALL_CHROME.laptop.compactQr).toBe(false);
    expect(WALL_CHROME.tv.compactQr).toBe(false);
  });

  it("labels every pace step", () => {
    for (const step of PACE_STEPS) expect(PACE_LABELS[String(step)]).toBeTruthy();
  });
});
