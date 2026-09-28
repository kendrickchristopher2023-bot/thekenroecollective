import { describe, it, expect } from "vitest";
import {
  groupGuestsByTogetherRules,
  seatingRuleViolations,
} from "@/lib/events-store";
import type { Guest, KEvent, SeatingRule, SeatingTable } from "@/lib/events-store";

/**
 * RECURRENCE GUARD for: a persisted "keep together" rule (e.g. Chris Kendrick
 * + Adrian Monroe) rendered fine in the Seating rules panel, but the chart
 * still split the pair after auto-assign / shuffle.
 *
 * Root cause: events-store.ts `shuffleSeating` built its union-find guest
 * groups from a guest list that EXCLUDED anyone already seated at a locked
 * table. When one half of a "together" pair was locked in place, the other
 * half had no union partner, so it was bin-packed onto an unrelated table —
 * even though the rule was valid and both guests were attending.
 */

function guest(id: string, name: string, status: Guest["status"] = "yes"): Guest {
  return { id, name, status } as Guest;
}

function rule(guestAId: string, guestBId: string): SeatingRule {
  return { id: `r-${guestAId}-${guestBId}`, type: "together", guestAId, guestBId };
}

describe("groupGuestsByTogetherRules", () => {
  it("merges a pair into one group even when one guest is already locked to a table", () => {
    const chris = guest("chris", "Chris Kendrick");
    const adrian = guest("adrian", "Adrian Monroe");
    const bystander = guest("sam", "Sam Rivera");

    // Locked guests must still be passed in (this is the fix): previously the
    // caller filtered them out before calling into the grouping step.
    const groups = groupGuestsByTogetherRules(
      [chris, adrian, bystander],
      [rule("chris", "adrian")],
    );

    const groupWithChris = groups.find((g) => g.some((gu) => gu.id === "chris"));
    expect(groupWithChris?.map((g) => g.id).sort()).toEqual(["adrian", "chris"]);
  });

  it("does not merge a rule referencing a non-attending guest", () => {
    const chris = guest("chris", "Chris Kendrick");
    const adrian = guest("adrian", "Adrian Monroe", "no");

    // adrian excluded from the attending list entirely (e.g. declined RSVP)
    const groups = groupGuestsByTogetherRules([chris], [rule("chris", "adrian")]);
    expect(groups).toEqual([[chris]]);
  });
});

describe("seatingRuleViolations", () => {
  function table(id: string, guestIds: string[], extra: Partial<SeatingTable> = {}): SeatingTable {
    return { id, label: id, shape: "round", capacity: 8, guestIds, ...extra } as SeatingTable;
  }

  function event(guests: Guest[], tables: SeatingTable[], rules: SeatingRule[]): KEvent {
    return {
      id: "e1",
      title: "Test event",
      date: "2026-09-01T18:00",
      guests,
      seatingTables: tables,
      seatingRules: rules,
    } as KEvent;
  }

  it("flags a together-rule pair seated at different tables", () => {
    const chris = guest("chris", "Chris Kendrick");
    const adrian = guest("adrian", "Adrian Monroe");
    const ev = event(
      [chris, adrian],
      [table("t1", ["chris"]), table("t2", ["adrian"])],
      [rule("chris", "adrian")],
    );
    const violations = seatingRuleViolations(ev);
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toMatch(/should sit together/);
  });

  it("reports no violation once both guests share a table", () => {
    const chris = guest("chris", "Chris Kendrick");
    const adrian = guest("adrian", "Adrian Monroe");
    const ev = event(
      [chris, adrian],
      [table("t1", ["chris", "adrian"])],
      [rule("chris", "adrian")],
    );
    expect(seatingRuleViolations(ev)).toHaveLength(0);
  });
});
