import { describe, expect, it } from "vitest";

import { normalizeEvent, rsvpCounts, type KEvent } from "@/lib/events-store";
import { isStaleBuildError } from "@/lib/error-capture-client";

/**
 * Regression: a cloud/local event record arriving without `guests` crashed the
 * whole /events dashboard with "Cannot read properties of undefined (reading
 * 'forEach')" inside rsvpCounts().
 */
describe("event list guards", () => {
  it("rsvpCounts survives a record with no guests array", () => {
    const broken = { id: "e1", title: "Reunion" } as unknown as KEvent;
    const c = rsvpCounts(broken);
    expect(c.total).toBe(0);
    expect(c.yes).toBe(0);
    expect(c.attendees).toBe(0);
  });

  it("rsvpCounts ignores unknown statuses instead of producing NaN", () => {
    const ev = {
      id: "e2",
      guests: [{ id: "g1", name: "A", status: "bogus" }, { id: "g2", name: "B", status: "yes" }],
    } as unknown as KEvent;
    const c = rsvpCounts(ev);
    expect(c.yes).toBe(1);
    expect(Number.isNaN(c.attendees)).toBe(false);
    expect(c.total).toBe(2);
  });

  it("normalizeEvent guarantees the arrays the UI iterates", () => {
    const ev = normalizeEvent({ id: "e3", title: "X" } as unknown as KEvent);
    expect(Array.isArray(ev.guests)).toBe(true);
    expect(() => rsvpCounts(ev)).not.toThrow();
  });

  it("classifies stale-bundle failures so the refresh prompt fires", () => {
    expect(isStaleBuildError(new Error("Invalid server function ID: foo--bar"))).toBe(true);
    expect(
      isStaleBuildError(new Error("Failed to fetch dynamically imported module: /assets/x.js")),
    ).toBe(true);
    expect(isStaleBuildError(new Error("Network request failed"))).toBe(false);
  });
});
