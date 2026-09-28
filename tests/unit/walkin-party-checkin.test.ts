import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { arrivedHeadcount, checkInSummary, isWalkIn, type KEvent } from "@/lib/events-store";

function evt(partial: Partial<KEvent>): KEvent {
  return { id: "e1", title: "Supper", date: "2026-09-01T18:00", guests: [], ...(partial as object) } as KEvent;
}

describe("walk-ins and party-level check-in", () => {
  const base = evt({
    guests: [
      { id: "g1", name: "Ada", email: "", phone: "", status: "yes", adults: 2, children: 1 },
      { id: "g2", name: "Bo", email: "", phone: "", status: "yes", adults: 1 },
      { id: "w1", name: "Cy", email: "", phone: "", status: "yes", adults: 2, source: "walkin" },
    ],
    checkIns: [
      { guestId: "g1", at: "2026-09-01T18:05:00Z", heads: 3 },
      { guestId: "w1", at: "2026-09-01T18:10:00Z", heads: 2, note: "walk-in" },
    ],
  } as Partial<KEvent>);

  it("counts arrivals as people, not rows", () => {
    expect(arrivedHeadcount(base)).toBe(5);
  });

  it("splits invited arrivals from walk-ins and keeps expected invited-only", () => {
    const s = checkInSummary(base);
    expect(s.invitedArrivedHeads).toBe(3);
    expect(s.walkInHeads).toBe(2);
    expect(s.walkInCount).toBe(1);
    expect(s.expectedHeads).toBe(4); // Ada party of 3 + Bo 1, walk-in excluded
    expect(s.yetToArriveHeads).toBe(1); // Bo
    expect(s.totalOnSiteHeads).toBe(5);
  });

  it("falls back to the guest's party size when heads is missing (legacy rows)", () => {
    const legacy = evt({
      guests: [{ id: "g1", name: "Ada", email: "", phone: "", status: "yes", adults: 2, children: 1 }],
      checkIns: [{ guestId: "g1", at: "2026-09-01T18:05:00Z" }],
    } as Partial<KEvent>);
    expect(arrivedHeadcount(legacy)).toBe(3);
  });

  it("detects walk-ins by flag or id prefix", () => {
    expect(isWalkIn({ id: "walkin-abc", name: "X", email: "", phone: "", status: "yes" })).toBe(true);
    expect(isWalkIn({ id: "g9", name: "X", email: "", phone: "", status: "yes" })).toBe(false);
  });

  it("door page keeps the token-gated write path and offers a walk-in flow", () => {
    const src = readFileSync("src/routes/checkin.$eventId.tsx", "utf8");
    expect(src).toContain("submitWalkIn");
    expect(src).toContain("shareToken: doorToken");
    expect(src).toContain("Add walk-in");
    expect(src).toContain("Check in party of");
  });

  it("host panel reports invited arrived / walk-ins / yet to arrive", () => {
    const src = readFileSync("src/components/checkin-panel.tsx", "utf8");
    expect(src).toContain("Invited arrived");
    expect(src).toContain("Walk-ins");
    expect(src).toContain("Yet to arrive");
  });
});
