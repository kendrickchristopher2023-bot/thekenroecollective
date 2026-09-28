import { describe, expect, it } from "vitest";
import { formatEventDate } from "@/lib/events-store";
import { formatInviteDate } from "@/lib/events-invites.server";
import { buildIcs, instantFrom, toZonedStamp } from "@/lib/ics";
import { eventInstant, timeWithZone } from "@/lib/event-time";

/**
 * Regression guard for the timezone double-conversion bug: a 6:00 PM Eastern
 * event was rendering as 2:00 PM everywhere the naive wall clock was parsed as
 * UTC and then formatted a second time in the venue zone.
 *
 * The stored contract: `date` is the wall clock AT THE VENUE, `timezone` is the
 * venue's IANA zone. Every surface must print 6:00 PM.
 */
const DATE = "2026-08-29T18:00"; // Saturday 6:00 PM
const ZONE = "America/New_York"; // UTC-4 in August (EDT)

describe("6:00 PM in a UTC-4 venue zone renders as 6:00 PM", () => {
  it("invitation hero / dashboard / PDF (formatEventDate)", () => {
    const d = formatEventDate(DATE, ZONE);
    expect(d.time).toBe("6:00 PM");
    expect(d.weekday).toBe("Saturday");
    expect(d.dateOnly).toBe("August 29, 2026");
  });

  it("invitation and reminder emails (formatInviteDate)", () => {
    const d = formatInviteDate(DATE, ZONE);
    expect(d.time).toBe("6:00 PM");
    expect(d.date).toBe("Saturday, August 29, 2026");
  });

  it("countdown / venue-time label", () => {
    expect(timeWithZone(DATE, ZONE)).toBe("6:00 PM EDT");
  });

  it("calendar file keeps the venue wall clock", () => {
    const start = instantFrom(DATE, ZONE);
    expect(toZonedStamp(start, ZONE)).toBe("20260829T180000");
    const ics = buildIcs({ uid: "t", title: "T", start, timeZone: ZONE });
    expect(ics).toContain("DTSTART;TZID=America/New_York:20260829T180000");
  });

  it("the instant behind it is 22:00 UTC, so nothing else drifts", () => {
    expect(eventInstant(DATE, ZONE).toISOString()).toBe("2026-08-29T22:00:00.000Z");
    expect(instantFrom(DATE, ZONE).toISOString()).toBe("2026-08-29T22:00:00.000Z");
  });

  it("a different venue zone is not hard-coded to Eastern", () => {
    expect(formatEventDate(DATE, "America/Los_Angeles").time).toBe("6:00 PM");
    expect(formatInviteDate(DATE, "Europe/London").time).toBe("6:00 PM");
    expect(timeWithZone(DATE, "America/Los_Angeles")).toBe("6:00 PM PDT");
  });

  it("an event with no stored zone still shows its own wall clock", () => {
    expect(formatEventDate(DATE).time).toBe("6:00 PM");
    expect(formatInviteDate(DATE).time).toBe("6:00 PM");
  });

  it("legacy instant-stored events are read in the venue zone, never the runtime's", () => {
    // 22:30Z on Nov 7 = 5:30 PM Eastern (EST). Must not print 10:30 PM on a
    // UTC server, which is what an undefined timeZone used to do.
    expect(formatEventDate("2026-11-07T22:30:00.000Z", ZONE).time).toBe("5:30 PM");
    expect(formatInviteDate("2026-11-07T22:30:00.000Z", ZONE).time).toBe("5:30 PM");
    expect(formatEventDate("2026-11-07T22:30:00.000Z").time).toBe("5:30 PM");
    expect(formatInviteDate("2026-11-07T22:30:00.000Z").time).toBe("5:30 PM");
  });

  it("holds across the DST boundary, no fixed offset", () => {
    // Same wall clock in January (EST, UTC-5) and July (EDT, UTC-4).
    expect(formatEventDate("2027-01-16T18:00", ZONE).time).toBe("6:00 PM");
    expect(eventInstant("2027-01-16T18:00", ZONE).toISOString()).toBe("2027-01-16T23:00:00.000Z");
    expect(formatEventDate("2027-07-16T18:00", ZONE).time).toBe("6:00 PM");
    expect(eventInstant("2027-07-16T18:00", ZONE).toISOString()).toBe("2027-07-16T22:00:00.000Z");
  });
});
