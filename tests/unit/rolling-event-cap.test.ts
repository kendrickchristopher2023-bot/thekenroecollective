import { describe, it, expect } from "vitest";
import {
  POSTCARD_ROLLING_CREATE_LIMIT,
  nextSlotOpensAt,
  rollingCapMessage,
  rollingWindowStart,
} from "@/lib/rolling-event-cap";

const now = new Date("2026-08-22T00:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(now.getTime() - d * DAY).toISOString();

describe("postcard rolling creation cap", () => {
  it("caps at 3 per rolling 12 months", () => {
    expect(POSTCARD_ROLLING_CREATE_LIMIT).toBe(3);
  });

  it("window starts 365 days back", () => {
    expect(rollingWindowStart(now).toISOString()).toBe("2025-08-22T00:00:00.000Z");
  });

  it("ignores creations older than the window", () => {
    expect(nextSlotOpensAt([ago(400), ago(370)], now)).toBeNull();
  });

  it("next slot opens 12 months after the oldest in-window creation", () => {
    const next = nextSlotOpensAt([ago(300), ago(100), ago(10)], now)!;
    expect(next.toISOString().slice(0, 10)).toBe("2026-10-26");
  });

  it("message explains the window, archiving, and the next slot date", () => {
    const msg = rollingCapMessage([ago(300), ago(100), ago(10)], now);
    expect(msg).toContain("3 new events per rolling 12 months");
    expect(msg).toContain("you've created 3 since August 22, 2025");
    expect(msg).toContain("archiving frees your active-event slot but does not free a new-event slot");
    expect(msg).toContain("next free event slot opens October 26, 2026");
    expect(msg).toContain("Upgrade to Whisper");
  });
});
