import { describe, it, expect } from "vitest";
import { wrapUpEvent, wrapUpCsv } from "@/lib/post-event-analytics";
import type { KEvent } from "@/lib/events-store";

function ev(over: Partial<KEvent> = {}): KEvent {
  return {
    id: "e1",
    title: "Summer Social",
    guests: [],
    ...(over as any),
  } as KEvent;
}

const g = (over: Record<string, any>) => ({ id: over.id, name: over.name ?? over.id, email: "", phone: "", ...over });

describe("post-event wrap-up", () => {
  it("counts responses and response rate over invited rows only", () => {
    const e = ev({
      guests: [
        g({ id: "a", status: "yes", adults: 2 }),
        g({ id: "b", status: "no" }),
        g({ id: "c", status: "maybe" }),
        g({ id: "d", status: "pending" }),
        g({ id: "w1", status: "yes", source: "walkin" }),
      ] as any,
    });
    const w = wrapUpEvent(e);
    expect(w.invited).toBe(4);
    expect(w.responded).toBe(3);
    expect(w.responseRate).toBe(75);
    expect(w.pending).toBe(1);
  });

  it("splits arrivals, walk-ins and no-shows by heads", () => {
    const e = ev({
      guests: [
        g({ id: "a", status: "yes", adults: 2 }),
        g({ id: "b", status: "yes", adults: 3 }),
        g({ id: "w1", status: "yes", adults: 2, source: "walkin" }),
      ] as any,
      checkIns: [
        { guestId: "a", at: "2026-08-20T18:00:00.000Z", heads: 2 },
        { guestId: "w1", at: "2026-08-20T19:30:00.000Z", heads: 2 },
      ] as any,
    });
    const w = wrapUpEvent(e);
    expect(w.expectedHeads).toBe(5);
    expect(w.invitedArrivedHeads).toBe(2);
    expect(w.walkInHeads).toBe(2);
    expect(w.arrivedHeads).toBe(4);
    expect(w.attendanceRate).toBe(40);
    expect(w.noShows.map((r) => r.id)).toEqual(["b"]);
    expect(w.noShowHeads).toBe(3);
    expect(w.firstArrivalAt).toBe("2026-08-20T18:00:00.000Z");
    expect(w.lastArrivalAt).toBe("2026-08-20T19:30:00.000Z");
  });

  it("flags arrivals from guests who declined", () => {
    const e = ev({
      guests: [g({ id: "a", status: "no" })] as any,
      checkIns: [{ guestId: "a", at: "2026-08-20T18:00:00.000Z", heads: 1 }] as any,
    });
    expect(wrapUpEvent(e).surpriseArrivals).toBe(1);
  });

  it("carries money and no-show rows into the CSV", () => {
    const e = ev({
      paymentEnabled: true,
      paymentAmount: 25,
      paymentCurrency: "USD",
      guests: [g({ id: "a", status: "yes", name: "Chris K" })] as any,
    });
    const w = wrapUpEvent(e);
    const csv = wrapUpCsv(e, w);
    expect(csv).toContain("Billed (USD),25");
    expect(csv).toContain("Chris K,yes,1");
  });

  it("returns zeroed rates with no guests", () => {
    const w = wrapUpEvent(ev());
    expect(w.responseRate).toBe(0);
    expect(w.attendanceRate).toBe(0);
    expect(w.noShows).toEqual([]);
  });
});
