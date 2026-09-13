import { describe, expect, it } from "vitest";
import {
  bringCsvRows,
  bringTotals,
  groupByCategory,
  looksLikeDuplicate,
  openItems,
  matchGuestRsvp,
  rsvpLabel,
  slotsRemaining,
  stillNeededSummary,
  toCsv,
  type BringItem,
} from "@/lib/bring-sheet";

function item(over: Partial<BringItem> = {}): BringItem {
  return {
    id: over.id ?? "i1",
    name: over.name ?? "Potato salad",
    note: over.note ?? null,
    category: over.category ?? "salad",
    slotsNeeded: over.slotsNeeded ?? 1,
    serves: over.serves ?? null,
    suggested: over.suggested ?? false,
    claims: over.claims ?? [],
  };
}

const claim = (id: string, name: string) => ({
  id,
  name,
  dish: null,
  note: null,
  createdAt: "2026-01-01T00:00:00Z",
});

describe("bring sheet slots", () => {
  it("never returns a negative number of open slots", () => {
    const full = item({ slotsNeeded: 1, claims: [claim("c1", "A"), claim("c2", "B")] });
    expect(slotsRemaining(full)).toBe(0);
  });

  it("treats a zero or missing slot count as one", () => {
    expect(slotsRemaining(item({ slotsNeeded: 0 }))).toBe(1);
  });

  it("counts open slots on a multi-slot item", () => {
    expect(slotsRemaining(item({ slotsNeeded: 3, claims: [claim("c1", "A")] }))).toBe(2);
  });
});

describe("bring totals", () => {
  const items = [
    item({ id: "a", name: "Brownies", category: "baked", slotsNeeded: 2, claims: [claim("c1", "Ann")] }),
    item({ id: "b", name: "Bag of ice", category: "supplies", slotsNeeded: 2 }),
    item({ id: "c", name: "Chili", category: "main", suggested: true, claims: [claim("c2", "Ben")] }),
  ];

  it("sums claimed, needed and open slots", () => {
    const t = bringTotals(items);
    expect(t.items).toBe(3);
    expect(t.claimed).toBe(2);
    expect(t.slotsNeeded).toBe(5);
    expect(t.openSlots).toBe(3);
    expect(t.guestSuggested).toBe(1);
  });

  it("counts distinct helpers, not claims", () => {
    const dup = [item({ id: "a", slotsNeeded: 2, claims: [claim("c1", "Ann"), claim("c2", "ann")] })];
    expect(bringTotals(dup).people).toBe(1);
  });

  it("lists only items with open slots", () => {
    expect(openItems(items).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("summarises what is still needed", () => {
    expect(stillNeededSummary(items)).toMatch(/Brownies/);
    expect(stillNeededSummary([item({ claims: [claim("c1", "Ann")] })])).toBe("");
  });
});

describe("grouping and csv", () => {
  it("groups by category and keeps categories with items only", () => {
    const groups = groupByCategory([
      item({ id: "a", category: "dessert" }),
      item({ id: "b", category: "dessert" }),
      item({ id: "c", category: "drinks" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["dessert", "drinks"]);
    expect(groups[0]!.items).toHaveLength(2);
  });

  it("exports a header row plus one row per item", () => {
    const rows = bringCsvRows([item({ claims: [claim("c1", "Ann")] })]);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(toCsv(rows).split("\n")[0]).toContain("Item");
  });
});

describe("duplicate detection", () => {
  const items = [item({ id: "a", name: "Potato salad", claims: [claim("c1", "Ann")] })];

  it("flags a case-insensitive match against something already claimed", () => {
    expect(looksLikeDuplicate("potato SALAD", items)).toBe("Potato salad");
  });

  it("does not flag an unrelated dish", () => {
    expect(looksLikeDuplicate("Cornbread", items)).toBeNull();
  });
});

describe("RSVP linkage", () => {
  const guests = [
    { name: "Ann  Lee", status: "yes" },
    { name: "Bob Ray", status: "no" },
    { name: "Cara Kim", status: "pending" },
  ];

  it("matches names case and whitespace insensitively", () => {
    expect(matchGuestRsvp("ann lee", guests)).toBe("yes");
    expect(matchGuestRsvp("  BOB   RAY ", guests)).toBe("no");
    expect(matchGuestRsvp("Cara Kim", guests)).toBe("pending");
  });

  it("never guesses for unknown or empty names", () => {
    expect(matchGuestRsvp("Someone Else", guests)).toBe("unknown");
    expect(matchGuestRsvp("", guests)).toBe("unknown");
    expect(matchGuestRsvp("Ann Lee", [])).toBe("unknown");
  });

  it("labels each state in plain language", () => {
    expect(rsvpLabel("yes")).toBe("Attending");
    expect(rsvpLabel("no")).toBe("Declined");
    expect(rsvpLabel("pending")).toBe("Not replied");
    expect(rsvpLabel(undefined)).toBe("Not on guest list");
  });

  it("carries RSVP into the CSV", () => {
    const rows = bringCsvRows([
      { id: "i1", name: "Pie", note: null, category: "dessert", slotsNeeded: 1, serves: null, suggested: false, claims: [{ id: "c1", name: "Ann Lee", dish: "Pie", note: null, createdAt: "", rsvp: "yes" as const }] },
    ]);
    expect(rows[0]).toContain("RSVP");
    expect(rows[1]).toContain("Attending");
  });
});
