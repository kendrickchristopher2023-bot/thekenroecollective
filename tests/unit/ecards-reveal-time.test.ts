import { describe, expect, it } from "vitest";
import {
  revealInputToUtcIso,
  utcIsoToLocalInput,
  wallClockInZoneToUtc,
} from "@/lib/ecards-reveal-time";

describe("eCard reveal time round trip", () => {
  it("reads a naive wall clock in the given zone, not as UTC", () => {
    // 6:00 PM in New York on 8/15/2026 is EDT (UTC-4), so 22:00 UTC.
    expect(revealInputToUtcIso("2026-08-15T18:00", "America/New_York")).toBe(
      "2026-08-15T22:00:00.000Z",
    );
    // 9:00 AM Pacific in August is PDT (UTC-7).
    expect(revealInputToUtcIso("2026-08-15T09:00", "America/Los_Angeles")).toBe(
      "2026-08-15T16:00:00.000Z",
    );
    // Winter date, standard offsets.
    expect(revealInputToUtcIso("2026-01-10T18:00", "America/New_York")).toBe(
      "2026-01-10T23:00:00.000Z",
    );
    // A zone ahead of UTC.
    expect(revealInputToUtcIso("2026-08-15T18:00", "Asia/Tokyo")).toBe("2026-08-15T09:00:00.000Z");
  });

  it("passes an absolute instant through untouched", () => {
    expect(revealInputToUtcIso("2026-08-15T22:00:00.000Z", "America/New_York")).toBe(
      "2026-08-15T22:00:00.000Z",
    );
    expect(revealInputToUtcIso("2026-08-15T18:00:00-04:00", "UTC")).toBe(
      "2026-08-15T22:00:00.000Z",
    );
  });

  it("is symmetric: save then load gives back the same wall clock", () => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    for (const wall of ["2026-08-15T18:00", "2026-01-10T07:30", "2026-06-01T23:45"]) {
      expect(utcIsoToLocalInput(revealInputToUtcIso(wall, zone))).toBe(wall);
    }
  });

  it("never shifts by appending Z to a wall clock", () => {
    const utc = wallClockInZoneToUtc("2026-08-15T18:00", "America/New_York");
    expect(utc.toISOString()).not.toBe("2026-08-15T18:00:00.000Z");
  });
});
