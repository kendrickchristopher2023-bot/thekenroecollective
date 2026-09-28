import { describe, expect, it } from "vitest";
import {
  confirmedHeads,
  describePlan,
  describeSkipped,
  eventHasStarted,
  moveInOrder,
  openSeats,
  planWaitlistPromotions,
  waitlistEntries,
} from "@/lib/waitlist";
import type { Guest, KEvent } from "@/lib/events-store";

function guest(over: Partial<Guest> & { id: string }): Guest {
  return {
    id: over.id,
    name: over.name ?? over.id,
    status: "invited",
    adults: 1,
    children: 0,
    ...over,
  } as Guest;
}

function ev(over: Partial<KEvent> & { guests: Guest[] }): KEvent {
  return {
    id: "e1",
    title: "Reunion",
    date: "2099-08-29T18:00",
    timezone: "America/New_York",
    capacity: 10,
    waitlistEnabled: true,
    autoPromote: true,
    ...over,
  } as unknown as KEvent;
}

describe("the cap counts people, not guest rows", () => {
  it("plus-ones and children each take a seat", () => {
    const e = ev({
      guests: [
        guest({ id: "a", status: "yes", adults: 2, children: 2 }),
        guest({ id: "b", status: "yes", plusOnes: [{ name: "P" }] as never }),
      ],
    });
    expect(confirmedHeads(e)).toBe(6);
    expect(openSeats(e)).toBe(4);
  });

  it("declined and waitlisted parties do not use seats", () => {
    const e = ev({
      guests: [guest({ id: "a", status: "no", adults: 4 }), guest({ id: "b", status: "waitlisted", adults: 3 })],
    });
    expect(confirmedHeads(e)).toBe(0);
    expect(openSeats(e)).toBe(10);
  });
});

describe("a party is never split", () => {
  const base = (policy?: "skip" | "hold") =>
    ev({
      capacity: 10,
      waitlistPolicy: policy,
      guests: [
        guest({ id: "seated", status: "yes", adults: 8 }),
        guest({ id: "family", status: "waitlisted", adults: 2, children: 2, waitlistPosition: 1 }),
        guest({ id: "solo", status: "waitlisted", adults: 1, waitlistPosition: 2 }),
      ],
    });

  it("skip policy passes over the party that does not fit and promotes the one that does", () => {
    const plan = planWaitlistPromotions(base("skip"));
    expect(plan.seats).toBe(2);
    expect(plan.promote.map((p) => p.guest.id)).toEqual(["solo"]);
    expect(plan.skipped.map((p) => p.guest.id)).toEqual(["family"]);
    expect(plan.heldFor).toBeNull();
  });

  it("hold policy keeps the seats for the party at the front", () => {
    const plan = planWaitlistPromotions(base("hold"));
    expect(plan.promote).toEqual([]);
    expect(plan.heldFor?.guest.id).toBe("family");
    expect(describePlan(plan)).toContain("held for");
  });

  it("defaults to skip when the host has not chosen", () => {
    expect(planWaitlistPromotions(base()).promote.map((p) => p.guest.id)).toEqual(["solo"]);
  });
});

describe("the host's manual order decides who is next", () => {
  it("waitlistPosition wins over insertion order", () => {
    const e = ev({
      guests: [
        guest({ id: "first-added", status: "waitlisted", waitlistPosition: 3 }),
        guest({ id: "chosen", status: "waitlisted", waitlistPosition: 1 }),
        guest({ id: "middle", status: "waitlisted", waitlistPosition: 2 }),
      ],
    });
    expect(waitlistEntries(e).map((x) => x.guest.id)).toEqual(["chosen", "middle", "first-added"]);
    expect(waitlistEntries(e).map((x) => x.position)).toEqual([1, 2, 3]);
  });

  it("unpositioned guests fall to the back, in insertion order", () => {
    const e = ev({
      guests: [
        guest({ id: "new-a", status: "waitlisted" }),
        guest({ id: "ordered", status: "waitlisted", waitlistPosition: 1 }),
        guest({ id: "new-b", status: "waitlisted" }),
      ],
    });
    expect(waitlistEntries(e).map((x) => x.guest.id)).toEqual(["ordered", "new-a", "new-b"]);
  });

  it("moveInOrder is a stable single-item move", () => {
    expect(moveInOrder(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveInOrder(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveInOrder(["a", "b", "c"], "z", 0)).toEqual(["a", "b", "c"]);
  });
});

describe("guards", () => {
  const waiting = [guest({ id: "w", status: "waitlisted" })];

  it("never promotes after the event has started", () => {
    const e = ev({ date: "2020-01-01T18:00", guests: waiting });
    expect(eventHasStarted(e)).toBe(true);
    expect(planWaitlistPromotions(e).blocked).toBe("event_started");
  });

  it("does nothing without a cap", () => {
    expect(planWaitlistPromotions(ev({ capacity: 0, guests: waiting })).blocked).toBe("no_cap");
  });

  it("respects the host's auto-promote switch, but a manual click overrides it", () => {
    const e = ev({ autoPromote: false, guests: waiting });
    expect(planWaitlistPromotions(e).blocked).toBe("waitlist_off");
    expect(planWaitlistPromotions(e, { ignoreAutoPromote: true }).promote).toHaveLength(1);
  });

  it("does nothing when no seats are open", () => {
    const e = ev({
      capacity: 2,
      guests: [guest({ id: "full", status: "yes", adults: 2 }), ...waiting],
    });
    expect(planWaitlistPromotions(e).blocked).toBe("no_seats");
  });

  it("lowering the cap below the confirmed count never removes anyone", () => {
    const e = ev({
      capacity: 2,
      guests: [guest({ id: "a", status: "yes", adults: 5 }), ...waiting],
    });
    expect(confirmedHeads(e)).toBe(5);
    expect(openSeats(e)).toBe(0);
    const plan = planWaitlistPromotions(e);
    expect(plan.blocked).toBe("no_seats");
    expect(e.guests.filter((g) => g.status === "yes")).toHaveLength(1);
  });
});

describe("passed-over parties are visible, never silent", () => {
  it("names the skipped party and never promotes it into too few seats", () => {
    const event: any = {
      capacity: 4,
      waitlistEnabled: true,
      autoPromote: true,
      waitlistPolicy: "skip",
      date: "2099-01-01T18:00",
      timezone: "America/New_York",
      guests: [
        { id: "c1", name: "Confirmed", status: "yes", adults: 2 },
        { id: "w1", name: "Jones family", status: "waitlisted", adults: 4, waitlistPosition: 1 },
        { id: "w2", name: "Alex", status: "waitlisted", adults: 2, waitlistPosition: 2 },
      ],
    };
    const plan = planWaitlistPromotions(event);
    expect(plan.promote.map((e) => e.guest.id)).toEqual(["w2"]);
    expect(plan.skipped.map((e) => e.guest.id)).toEqual(["w1"]);
    const text = describeSkipped(plan);
    expect(text).toContain("Jones family");
    expect(text).toContain("4 people");
    expect(describeSkipped({ ...plan, skipped: [] })).toBe("");
  });
});
