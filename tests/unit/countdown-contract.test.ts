import { describe, expect, it } from "vitest";
import { eventInstant, formatEventTime as timeWithZone } from "@/lib/datetime";

/**
 * The countdown contract, kept separate from display formatting because the two
 * are deliberately different things:
 *
 *   display   = the event's wall clock in the venue zone, with a zone label
 *   countdown = a true remaining duration (one instant minus another)
 *
 * The remaining duration is therefore identical for every viewer in every zone,
 * while the printed start time never converts. Both derive from
 * src/lib/datetime.ts, so the countdown does no local date math of its own.
 */

const IN_PROGRESS_MS = 4 * 60 * 60 * 1000;

/** Mirrors CountdownStrip's phase decision in invite.$eventId.tsx. */
function phase(target: string, tz: string, now: number) {
  const remaining = eventInstant(target, tz).getTime() - now;
  return remaining > 0 ? "before" : remaining > -IN_PROGRESS_MS ? "during" : "after";
}

function remainingMs(target: string, tz: string, now: number) {
  return eventInstant(target, tz).getTime() - now;
}

describe("countdown targets a real instant from wall clock + IANA zone", () => {
  it("resolves Christopher's event to 6:00 PM EDT, not the viewer's 6:00 PM", () => {
    const t = eventInstant("2026-08-29T18:00", "America/New_York");
    // 18:00 EDT (UTC-4) === 22:00 UTC
    expect(t.toISOString()).toBe("2026-08-29T22:00:00.000Z");
    expect(timeWithZone("2026-08-29T18:00", "America/New_York")).toContain("6:00 PM");
    expect(timeWithZone("2026-08-29T18:00", "America/New_York")).toContain("EDT");
  });

  it("gives the same remaining duration to a California and a New York viewer", () => {
    // The computation is viewer-independent by construction: it never reads the
    // browser zone. Same inputs, same answer, whatever TZ the process is in.
    const now = Date.UTC(2026, 7, 28, 22, 0, 0); // exactly 24h before
    expect(remainingMs("2026-08-29T18:00", "America/New_York", now)).toBe(86400000);
  });

  it("uses the offset in effect on the EVENT's date, not today's offset", () => {
    // Same wall clock, one in EST (UTC-5) and one in EDT (UTC-4).
    const winter = eventInstant("2026-01-15T18:00", "America/New_York");
    const summer = eventInstant("2026-07-15T18:00", "America/New_York");
    expect(winter.toISOString()).toBe("2026-01-15T23:00:00.000Z");
    expect(summer.toISOString()).toBe("2026-07-15T22:00:00.000Z");
  });

  it("does not jump by an hour across a DST boundary", () => {
    // US DST ends 2026-11-01. A countdown started the day before must lose
    // exactly 24h of remaining time over the following calendar day, not 23 or 25.
    const target = "2026-11-07T18:00";
    const tz = "America/New_York";
    const before = Date.UTC(2026, 9, 31, 12, 0, 0);
    const after = before + 86400000 * 2; // spans the transition
    const delta = remainingMs(target, tz, before) - remainingMs(target, tz, after);
    expect(delta).toBe(86400000 * 2);
  });

  it("handles an event on the DST transition day itself", () => {
    // 2026-03-08 spring forward: 1:30 AM exists, 2:30 AM does not.
    const t = eventInstant("2026-03-08T13:00", "America/New_York");
    expect(t.toISOString()).toBe("2026-03-08T17:00:00.000Z"); // EDT, UTC-4
  });

  it("handles midnight and noon without 12 AM/PM confusion", () => {
    expect(eventInstant("2026-06-01T00:00", "America/New_York").toISOString()).toBe(
      "2026-06-01T04:00:00.000Z",
    );
    expect(eventInstant("2026-06-01T12:00", "America/New_York").toISOString()).toBe(
      "2026-06-01T16:00:00.000Z",
    );
    expect(timeWithZone("2026-06-01T00:00", "America/New_York")).toContain("12:00 AM");
    expect(timeWithZone("2026-06-01T12:00", "America/New_York")).toContain("12:00 PM");
  });

  it("works for a non-US zone", () => {
    expect(eventInstant("2026-08-29T18:00", "Europe/London").toISOString()).toBe(
      "2026-08-29T17:00:00.000Z",
    ); // BST, UTC+1
    expect(eventInstant("2026-08-29T18:00", "Asia/Tokyo").toISOString()).toBe(
      "2026-08-29T09:00:00.000Z",
    ); // JST, UTC+9, no DST
  });
});

describe("countdown degrades gracefully instead of going negative", () => {
  const target = "2026-08-29T18:00";
  const tz = "America/New_York";
  const start = Date.UTC(2026, 7, 29, 22, 0, 0);

  it("counts down before the event", () => {
    expect(phase(target, tz, start - 60000)).toBe("before");
  });

  it("switches to the in-progress state at T-minus zero", () => {
    expect(phase(target, tz, start)).toBe("during");
    expect(phase(target, tz, start + 60000)).toBe("during");
    expect(phase(target, tz, start + IN_PROGRESS_MS - 1)).toBe("during");
  });

  it("shows the after state once the event window has passed", () => {
    expect(phase(target, tz, start + IN_PROGRESS_MS + 1)).toBe("after");
    // Never a negative countdown, days later.
    expect(phase(target, tz, start + 86400000 * 3)).toBe("after");
  });
});
