import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_PLUS_ONES,
  MAX_PARTY_COUNT,
  clampPartyCount,
  committedHeadcount,
  confirmedHeadcount,
  partyHeadcount,
  maxPartyHeads,
  partyHeadsFrom,
} from "@/lib/events-store";
import type { Guest, KEvent } from "@/lib/events-store";

/**
 * RECURRENCE GUARDS for two live correctness bugs:
 *
 *  1. Capacity was enforced ONLY in the browser, so a crafted or concurrent
 *     RSVP could push an event past its cap. The authoritative check now lives
 *     in public.public_update_guest (row-locked) and the client must respect
 *     its verdict.
 *  2. Door check-in accepted writes from anyone who knew an event id. The share
 *     token is now verified inside public.public_set_checkin, so every client
 *     write path MUST send it.
 */
const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const SYNC = readFileSync(join(ROOT, "src", "lib", "events-sync.functions.ts"), "utf8");
const DOOR = readFileSync(join(ROOT, "src", "routes", "checkin.$eventId.tsx"), "utf8");
const INVITE = readFileSync(join(ROOT, "src", "routes", "invite.$eventId.tsx"), "utf8");
const CHECKIN_MIGRATION = readFileSync(join(ROOT, "supabase", "migrations", "20260828232709_e5f16fd1-d9b6-4e6d-b041-429ac76e6312.sql"), "utf8");

function guest(p: Partial<Guest>): Guest {
  return { id: "g", name: "G", status: "yes", ...p } as Guest;
}
function ev(guests: Guest[]): KEvent {
  return { id: "e", title: "E", date: "2026-09-01T18:00", guests } as KEvent;
}

describe("shared headcount helper", () => {
  it("counts the guest, their children and their named plus-ones", () => {
    expect(partyHeadcount(guest({ adults: 2, children: 1, plusOnes: [{ name: "A" }] }))).toBe(4);
  });

  it("defaults a guest with no adult count to one seat", () => {
    expect(partyHeadcount(guest({}))).toBe(1);
  });

  it("only counts confirmed guests and can exclude the guest being edited", () => {
    const event = ev([
      guest({ id: "a", adults: 2 }),
      guest({ id: "b", status: "maybe", adults: 4 }),
      guest({ id: "c", adults: 1, plusOnes: [{ name: "P" }] }),
    ]);
    expect(confirmedHeadcount(event)).toBe(4);
    expect(confirmedHeadcount(event, "c")).toBe(2);
  });

  it("keeps the plus-ones ceiling at the value the SQL clamp mirrors", () => {
    expect(MAX_PLUS_ONES).toBe(20);
  });
});

describe("door check-in token is always sent", () => {
  it("the server function accepts and forwards a share token", () => {
    expect(SYNC).toMatch(/shareToken: z\.string\(\)/);
    expect(SYNC).toContain("_share_token");
  });

  it("every client check-in write includes the token", () => {
    const calls = DOOR.match(/submitGuestCheckin\(\{[\s\S]{0,220}?\}\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(
        call,
        "A door check-in write omits shareToken — the server will reject it as forbidden.",
      ).toContain("shareToken");
    }
  });

  it("keeps the door token server-managed and does not copy it into duplicated events", () => {
    expect(SYNC).toContain('.select("data,share_token")');
    expect(SYNC).toContain("shareToken: owned?.share_token");
    // Per-guest in-flight lock (one slow row never freezes the whole door list)
    // and the door page reads the server copy instead of writing the local store.
    expect(DOOR).toContain("pending[g.id]");
    expect(DOOR).toContain("syncFromServer");
    expect(DOOR).not.toContain("checkInGuest(");
    const STORE = readFileSync(join(ROOT, "src", "lib", "events-store.ts"), "utf8");
    expect(STORE).toContain("shareToken: _serverManagedToken");
    expect(STORE).toContain("shareToken: _token");
  });

  it("removes the obsolete overload and keeps one six-argument check-in RPC", () => {
    expect(CHECKIN_MIGRATION).toContain("DROP FUNCTION IF EXISTS public.public_set_checkin(text, text, boolean, text, text)");
    expect((CHECKIN_MIGRATION.match(/CREATE OR REPLACE FUNCTION public\.public_set_checkin\(/g) ?? [])).toHaveLength(1);
    expect(CHECKIN_MIGRATION).toContain("_heads integer DEFAULT NULL::integer");
  });
});

describe("RSVP respects the server capacity verdict", () => {
  it("handles over_capacity and waitlisted outcomes from the server", () => {
    expect(INVITE).toContain("over_capacity");
    expect(INVITE).toContain('res.outcome === "waitlisted"');
  });

  it("still returns the verdict from the RSVP server function", () => {
    expect(SYNC).toMatch(/reason: r\.reason/);
    expect(SYNC).toMatch(/outcome: r\.outcome/);
  });
});

describe("host-side capacity warning counts everyone who has not declined", () => {
  it("includes pending and maybe guests, excludes declines and waitlist", () => {
    const event = ev([
      guest({ id: "a", status: "pending", adults: 4 }),
      guest({ id: "b", status: "maybe", adults: 2 }),
      guest({ id: "c", status: "yes", adults: 1 }),
      guest({ id: "d", status: "no", adults: 5 }),
      guest({ id: "e", status: "waitlisted", adults: 5 }),
    ]);
    // The live bug: confirmedHeadcount saw 1 here, so a host could add guests
    // far past the cap with no warning while everyone was still pending.
    expect(confirmedHeadcount(event)).toBe(1);
    expect(committedHeadcount(event)).toBe(7);
    expect(committedHeadcount(event, "a")).toBe(3);
  });

  it("the host add-guest and edit-guest warnings both use it", () => {
    const HOST = readFileSync(join(ROOT, "src", "routes", "events.$eventId.index.tsx"), "utf8");
    expect((HOST.match(/committedHeadcount\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("party counters are capped at the plus-ones ceiling", () => {
  it("clamps adults/kids/pets into 0..20", () => {
    expect(MAX_PARTY_COUNT).toBe(MAX_PLUS_ONES);
    expect(clampPartyCount(99)).toBe(20);
    expect(clampPartyCount(-5)).toBe(0);
    expect(clampPartyCount(7.6)).toBe(7);
    expect(clampPartyCount(Number.NaN)).toBe(0);
  });

  it("host add/edit and the guest RSVP form all clamp through the helper", () => {
    const HOST = readFileSync(join(ROOT, "src", "routes", "events.$eventId.index.tsx"), "utf8");
    expect((HOST.match(/clampPartyCount\(/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((INVITE.match(/clampPartyCount\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("persistent over-capacity banner", () => {
  it("is rendered in the host guest list and driven by committedHeadcount", () => {
    const HOST = readFileSync(join(ROOT, "src", "routes", "events.$eventId.index.tsx"), "utf8");
    const BANNER = readFileSync(join(ROOT, "src", "components", "over-capacity-banner.tsx"), "utf8");
    expect(HOST).toContain("<OverCapacityBanner event={event} />");
    expect(BANNER).toContain("committedHeadcount(event)");
    expect(BANNER).toContain("invited, capacity");
  });
});

/**
 * RECURRENCE GUARD: Adults / Kids were a second escape valve around the host's
 * plus-ones allowance. With "1 plus-one per guest" a guest could set Adults to
 * 3 with zero named plus-ones and bring two unnamed extras. The allowance is
 * now a HEADCOUNT rule (1 + allowance), enforced in public_update_guest and
 * mirrored in the guest RSVP form and the host add/edit flows.
 */
describe("plus-ones allowance caps total party heads", () => {
  it("derives the ceiling as the guest plus their allowance", () => {
    expect(maxPartyHeads({ plusOnesAllowed: 0 } as KEvent)).toBe(1);
    expect(maxPartyHeads({ plusOnesAllowed: 1 } as KEvent)).toBe(2);
    expect(maxPartyHeads({ plusOnesAllowed: 4 } as KEvent)).toBe(5);
    // Never above the hard per-row ceiling.
    expect(maxPartyHeads({ plusOnesAllowed: 999 } as KEvent)).toBe(MAX_PARTY_COUNT);
  });

  it("counts adults, kids and named plus-ones against that one ceiling", () => {
    // The live bug: 3 adults + 0 plus-ones passed an allowance of 1.
    expect(partyHeadsFrom(3, 0, 0)).toBeGreaterThan(maxPartyHeads({ plusOnesAllowed: 1 } as KEvent));
    expect(partyHeadsFrom(1, 0, 1)).toBe(2);
    expect(partyHeadsFrom(1, 1, 0)).toBe(2);
  });

  it("the RSVP form clamps both counters and honours the server verdict", () => {
    expect(INVITE).toContain("maxPartyHeads(event)");
    // Adults are derived (you + named guests), so the only adult number a guest
    // can still type is the legacy unnamed-heads field.
    expect(INVITE).toContain("extraAdultsMax");
    expect(INVITE).toContain("childrenMax");
    expect(INVITE).toContain('res.reason === "over_allowance"');
  });

  it("the host add and edit flows face the same ceiling", () => {
    const HOST = readFileSync(join(ROOT, "src", "routes", "events.$eventId.index.tsx"), "utf8");
    expect(HOST).toContain("addHeadCeiling");
    expect(HOST).toContain("editHeadCeiling");
    expect(HOST).toContain("maxPartyHeads(");
  });

  it("the server function still surfaces the allowance verdict", () => {
    expect(SYNC).toMatch(/maxParty: typeof r\.maxParty/);
  });
});
