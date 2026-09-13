import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMINDER_TIME_ZONE,
  isDaytimeInZone,
  localHourInZone,
  reminderTimeZone,
} from "@/lib/reminder-window";

// 2026-08-09T12:00:00Z is 8:00 AM in New York (EDT) and 5:00 AM in Los Angeles.
const morningEast = new Date("2026-08-09T12:00:00Z");
// 2026-08-09T04:00:00Z is midnight in New York.
const nightEast = new Date("2026-08-09T04:00:00Z");

describe("reminder daytime window", () => {
  it("falls back to the default zone when none is stored", () => {
    expect(reminderTimeZone(null)).toBe(DEFAULT_REMINDER_TIME_ZONE);
    expect(reminderTimeZone("  ")).toBe(DEFAULT_REMINDER_TIME_ZONE);
    expect(reminderTimeZone("Europe/London")).toBe("Europe/London");
  });

  it("reads the local hour per zone", () => {
    expect(localHourInZone("America/New_York", morningEast)).toBe(8);
    expect(localHourInZone("America/Los_Angeles", morningEast)).toBe(5);
    expect(localHourInZone("America/New_York", nightEast)).toBe(0);
  });

  it("sends at 8am local and holds before it", () => {
    expect(isDaytimeInZone("America/New_York", morningEast)).toBe(true);
    expect(isDaytimeInZone("America/Los_Angeles", morningEast)).toBe(false);
  });

  it("holds overnight in the fallback zone", () => {
    expect(isDaytimeInZone(null, nightEast)).toBe(false);
    expect(isDaytimeInZone(undefined, morningEast)).toBe(true);
  });

  it("closes the window at 8pm local", () => {
    // 2026-08-10T00:00:00Z is 8:00 PM in New York.
    expect(isDaytimeInZone("America/New_York", new Date("2026-08-10T00:00:00Z"))).toBe(false);
    expect(isDaytimeInZone("America/New_York", new Date("2026-08-09T23:59:00Z"))).toBe(true);
  });

  it("does not crash on a bad zone string", () => {
    expect(typeof isDaytimeInZone("Not/AZone", morningEast)).toBe("boolean");
  });
});
