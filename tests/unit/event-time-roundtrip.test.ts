import { describe, expect, it } from "vitest";
import { eventDateTimeLocalInput, eventInstant, eventTimeInVenueZone } from "@/lib/event-time";
import { formatDateOnly } from "@/lib/date-only";

describe("event date/time round trip (venue zone)", () => {
  for (const zone of ["America/New_York", "America/Los_Angeles", "Europe/Paris"]) {
    it(`keeps the typed wall clock in ${zone}`, () => {
      const typed = "2026-08-15T18:00";
      // Save path: the naive wall clock is stored unchanged.
      const stored = typed;
      // Load path: the field shows the same wall clock again.
      expect(eventDateTimeLocalInput(stored, zone)).toBe(typed);
      // Display path: 6:00 PM in the venue zone, never 2:00 PM.
      expect(eventTimeInVenueZone(stored, zone)).toContain("6:00 PM");
    });
  }

  it("shows a stored UTC instant as the venue wall clock, not the browser clock", () => {
    // 22:00 UTC is 6:00 PM Eastern in August.
    expect(eventDateTimeLocalInput("2026-08-15T22:00:00.000Z", "America/New_York")).toBe(
      "2026-08-15T18:00",
    );
    expect(eventDateTimeLocalInput("2026-08-15T22:00:00.000Z", "America/Los_Angeles")).toBe(
      "2026-08-15T15:00",
    );
  });

  it("interprets a naive wall clock in the venue zone", () => {
    expect(eventInstant("2026-08-15T18:00", "America/New_York").toISOString()).toBe(
      "2026-08-15T22:00:00.000Z",
    );
    expect(eventInstant("2026-08-15T18:00", "America/Los_Angeles").toISOString()).toBe(
      "2026-08-16T01:00:00.000Z",
    );
  });
});

describe("date-only values", () => {
  it("does not roll back a day in negative-offset zones", () => {
    expect(formatDateOnly("2026-08-15")).toBe("8/15/2026");
    expect(formatDateOnly("2026-01-01")).toBe("1/1/2026");
    expect(formatDateOnly(null)).toBe("");
  });
});
