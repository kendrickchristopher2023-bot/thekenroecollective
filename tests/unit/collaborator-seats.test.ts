import { describe, expect, it } from "vitest";
import { COLLABORATOR_INVITE_TTL_DAYS, TIER_LIMITS } from "@/lib/tier-limits";

// Christopher's approved ladder. These numbers are enforced server-side in
// inviteEventMember via collaboratorSeatState — keep this test as the guard so a
// future tier edit can't silently hand out free collaborator seats.
describe("collaborator seat caps", () => {
  it("matches the approved per-tier ladder", () => {
    expect(TIER_LIMITS.postcard.collaboratorSeats).toBe(0);
    expect(TIER_LIMITS.whisper.collaboratorSeats).toBe(1);
    expect(TIER_LIMITS.host.collaboratorSeats).toBe(2);
    expect(TIER_LIMITS.atelier.collaboratorSeats).toBe(5);
  });

  it("keeps collaborators a paid feature on the free tier", () => {
    expect(TIER_LIMITS.postcard.collaboratorSeats).toBe(0);
  });

  it("expires unaccepted invites on the same clock as Projects invites", () => {
    expect(COLLABORATOR_INVITE_TTL_DAYS).toBe(14);
  });
});

// Downgrades do NOT grandfather: over-cap collaborators lose access so the host
// is always back within the cap and can invite someone new inside it.
describe("downgrade seat reclaim order", () => {
  type Row = { id: string; role: "cohost" | "viewer"; status: string; created_at: string };
  const keepOrder = (rows: Row[]) => {
    const rank = (r: Row) =>
      (r.status === "active" ? 0 : 2) + (r.status === "active" && r.role === "viewer" ? 1 : 0);
    return [...rows].sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at));
  };

  it("drops pending invites and viewers before long-standing co-hosts", () => {
    const rows: Row[] = [
      { id: "pending", role: "cohost", status: "invited", created_at: "2026-01-01" },
      { id: "viewer", role: "viewer", status: "active", created_at: "2026-01-02" },
      { id: "newCohost", role: "cohost", status: "active", created_at: "2026-03-01" },
      { id: "oldCohost", role: "cohost", status: "active", created_at: "2026-02-01" },
    ];
    const cap = 1;
    const ordered = keepOrder(rows);
    expect(ordered.slice(0, cap).map((r) => r.id)).toEqual(["oldCohost"]);
    expect(ordered.slice(cap).map((r) => r.id)).toEqual(["newCohost", "viewer", "pending"]);
  });

  it("clears every seat when the plan has none", () => {
    const rows: Row[] = [{ id: "a", role: "cohost", status: "active", created_at: "2026-01-01" }];
    expect(keepOrder(rows).slice(TIER_LIMITS.postcard.collaboratorSeats)).toHaveLength(1);
  });
});
