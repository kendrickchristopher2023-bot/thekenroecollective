import { describe, expect, it } from "vitest";
import {
  eventInstant,
  formatEventCompact,
  formatEventDate,
  formatEventForMessage,
  formatEventTime,
  toDateTimeLocalInput,
  viewerLocalLine,
} from "@/lib/datetime";
import { formatEventDate as storeFormatEventDate } from "@/lib/events-store";
import { formatInviteDate } from "@/lib/events-invites.server";
import { buildIcs, instantFrom, toZonedStamp } from "@/lib/ics";
import { formatDateOnly, formatDateOnlyLong } from "@/lib/date-only";
import { spokenAddress } from "@/lib/speakable";

/**
 * The structural guarantee: an event is a WALL CLOCK AT A PLACE. Every surface
 * prints that wall clock, labeled with the venue zone, never converted into the
 * viewer's zone. These tests are the contract; the ESLint guard in
 * eslint.config.js keeps formatting from leaking back out of src/lib/datetime.ts.
 */
const NY = "America/New_York";

describe("spoken event addresses", () => {
  it("reads suite numbers naturally", () => {
    expect(spokenAddress("1640 Oakhurst Commons Dr Suite 105, Charlotte, NC 28205")).toBe(
      "sixteen forty Oakhurst Commons Drive, Suite one oh five, Charlotte, North Carolina",
    );
  });
});

describe("one formatter, one answer", () => {
  it("6:00 PM in a UTC-4 venue renders 6:00 PM with its zone label", () => {
    const p = formatEventDate("2026-08-29T18:00", NY);
    expect(p.time).toBe("6:00 PM");
    expect(p.timeWithZone).toBe("6:00 PM EDT");
    expect(p.full).toBe("Saturday, August 29, 2026 at 6:00 PM EDT");
    expect(p.dateNumeric).toBe("8/29/2026");
  });

  it("every downstream surface agrees with the canonical module", () => {
    const canonical = formatEventDate("2026-08-29T18:00", NY);
    expect(storeFormatEventDate("2026-08-29T18:00", NY).time).toBe(canonical.time);
    expect(formatInviteDate("2026-08-29T18:00", NY)).toEqual({
      date: canonical.long,
      time: canonical.time,
      timeWithZone: canonical.timeWithZone,
      full: canonical.full,
    });
    expect(formatEventCompact("2026-08-29T18:00", NY)).toBe(canonical.compact);
    expect(toZonedStamp(instantFrom("2026-08-29T18:00", NY), NY)).toBe("20260829T180000");
  });
});

describe("the viewer's zone never changes the displayed time", () => {
  const cases = ["America/Los_Angeles", "Europe/London", "Asia/Tokyo", "Pacific/Honolulu", "UTC"];
  it("a guest anywhere sees the venue clock", () => {
    for (const viewer of cases) {
      const prev = process.env.TZ;
      process.env.TZ = viewer;
      try {
        expect(formatEventTime("2026-08-29T18:00", NY)).toBe("6:00 PM EDT");
        expect(formatEventDate("2026-08-29T18:00", NY).dateOnly).toBe("August 29, 2026");
      } finally {
        process.env.TZ = prev;
      }
    }
  });

  it("the virtual-event helper is the only viewer conversion, and it is opt-in", () => {
    expect(viewerLocalLine("2026-08-29T18:00", NY, "America/Los_Angeles")).toBe(
      "That is 3:00 PM your time (PDT)",
    );
    // Same zone as the venue: no confusing extra line.
    expect(viewerLocalLine("2026-08-29T18:00", NY, NY)).toBeNull();
  });
});

describe("DST is resolved for the event's own date, not today's offset", () => {
  it("winter (EST, UTC-5) and summer (EDT, UTC-4) both keep 6:00 PM", () => {
    expect(formatEventDate("2027-01-16T18:00", NY).timeWithZone).toBe("6:00 PM EST");
    expect(eventInstant("2027-01-16T18:00", NY).toISOString()).toBe("2027-01-16T23:00:00.000Z");
    expect(formatEventDate("2027-07-16T18:00", NY).timeWithZone).toBe("6:00 PM EDT");
    expect(eventInstant("2027-07-16T18:00", NY).toISOString()).toBe("2027-07-16T22:00:00.000Z");
  });

  it("either side of a spring-forward transition", () => {
    // 2027-03-14 is the US spring-forward date.
    expect(formatEventDate("2027-03-13T18:00", NY).timeWithZone).toBe("6:00 PM EST");
    expect(formatEventDate("2027-03-15T18:00", NY).timeWithZone).toBe("6:00 PM EDT");
  });

  it("on the transition day itself, after the jump", () => {
    const p = formatEventDate("2027-03-14T18:00", NY);
    expect(p.time).toBe("6:00 PM");
    expect(p.zoneLabel).toBe("EDT");
    expect(eventInstant("2027-03-14T18:00", NY).toISOString()).toBe("2027-03-14T22:00:00.000Z");
  });

  it("either side of a fall-back transition", () => {
    expect(formatEventDate("2026-10-31T18:00", NY).timeWithZone).toBe("6:00 PM EDT");
    expect(formatEventDate("2026-11-07T18:00", NY).timeWithZone).toBe("6:00 PM EST");
    expect(formatEventDate("2026-11-01T18:00", NY).time).toBe("6:00 PM");
  });

  it("an event stored before a DST change still shows its own wall clock after it", () => {
    // Stored in August, displayed in December: still 6:00 PM at the venue.
    const stored = "2026-12-19T18:00";
    expect(formatEventDate(stored, NY).timeWithZone).toBe("6:00 PM EST");
    expect(toDateTimeLocalInput(stored, NY)).toBe("2026-12-19T18:00");
  });
});

describe("midnight and noon are never confused", () => {
  it("00:00 is 12:00 AM on its own calendar day", () => {
    const p = formatEventDate("2026-08-29T00:00", NY);
    expect(p.time).toBe("12:00 AM");
    expect(p.dateOnly).toBe("August 29, 2026");
    expect(p.weekday).toBe("Saturday");
  });

  it("12:00 is 12:00 PM, not 12:00 AM", () => {
    expect(formatEventDate("2026-08-29T12:00", NY).time).toBe("12:00 PM");
  });

  it("23:59 does not roll into the next day", () => {
    const p = formatEventDate("2026-08-29T23:59", NY);
    expect(p.time).toBe("11:59 PM");
    expect(p.dateNumeric).toBe("8/29/2026");
  });
});

describe("non-US venues", () => {
  it("London and Tokyo keep their own wall clocks and labels", () => {
    expect(formatEventDate("2026-08-29T18:00", "Europe/London").timeWithZone).toBe("6:00 PM GMT+1");
    expect(formatEventDate("2026-08-29T18:00", "Asia/Tokyo").time).toBe("6:00 PM");
    expect(eventInstant("2026-08-29T18:00", "Asia/Tokyo").toISOString()).toBe(
      "2026-08-29T09:00:00.000Z",
    );
  });

  it("a southern-hemisphere zone with inverted DST", () => {
    expect(formatEventDate("2026-01-15T18:00", "Australia/Sydney").time).toBe("6:00 PM");
    expect(formatEventDate("2026-07-15T18:00", "Australia/Sydney").time).toBe("6:00 PM");
  });
});

describe("legacy instant-stored events", () => {
  it("are read in the venue zone, never the runtime's", () => {
    expect(formatEventDate("2026-11-07T22:30:00.000Z", NY).time).toBe("5:30 PM");
    expect(formatInviteDate("2026-11-07T22:30:00.000Z", NY).time).toBe("5:30 PM");
    // No stored zone: the US default, not UTC.
    expect(formatEventDate("2026-11-07T22:30:00.000Z").time).toBe("5:30 PM");
  });
});

describe("the calendar file carries the zone, so reminders fire at the right hour", () => {
  it("DTSTART is a floating local stamp with an explicit TZID", () => {
    const ics = buildIcs({
      uid: "u1",
      title: "Tenia's Birthday Dinner",
      start: instantFrom("2026-08-29T18:00", NY),
      timeZone: NY,
    });
    expect(ics).toContain("DTSTART;TZID=America/New_York:20260829T180000");
    expect(ics).not.toContain("DTSTART:20260829T180000Z");
  });

  it("across a DST boundary the stamp is still the venue wall clock", () => {
    expect(toZonedStamp(instantFrom("2027-01-16T18:00", NY), NY)).toBe("20270116T180000");
    expect(toZonedStamp(instantFrom("2027-07-16T18:00", NY), NY)).toBe("20270716T180000");
  });

  it("non-US zone", () => {
    const ics = buildIcs({
      uid: "u2",
      title: "London dinner",
      start: instantFrom("2026-08-29T18:00", "Europe/London"),
      timeZone: "Europe/London",
    });
    expect(ics).toContain("DTSTART;TZID=Europe/London:20260829T180000");
  });
});

describe("date-only values (task due dates, RSVP deadlines) never shift a day", () => {
  it("stays the same calendar date", () => {
    expect(formatDateOnly("2026-08-15")).toBe("8/15/2026");
    expect(formatDateOnlyLong("2026-08-15")).toBe("August 15, 2026");
    expect(formatDateOnlyLong("2026-01-01")).toBe("January 1, 2026");
  });
});

describe("the host builder round trip cannot move an event", () => {
  it("read then write is byte-identical for a wall clock", () => {
    for (const zone of [NY, "America/Los_Angeles", "Europe/London", "Asia/Tokyo"]) {
      expect(toDateTimeLocalInput("2026-08-29T18:00", zone)).toBe("2026-08-29T18:00");
    }
  });

  it("message formatting always includes a zone label", () => {
    const m = formatEventForMessage("2026-08-29T18:00", NY);
    expect(m.timeWithZone).toMatch(/EDT$/);
    expect(m.full).toContain("EDT");
  });
});
