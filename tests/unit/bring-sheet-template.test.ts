import { describe, expect, it } from "vitest";
import { parseBringRows, MAX_TEMPLATE_ROWS } from "@/lib/bring-sheet-export";

describe("parseBringRows", () => {
  it("maps headers, normalizes category and clamps slots", () => {
    const r = parseBringRows([
      { "Item Name": "Brownies", Category: "Dessert", "Spots Needed": 2, Serves: 12, Note: "Nut free" },
      { "Item Name": " Ice ", Category: "supplies", "Spots Needed": "99", Serves: "", Note: "" },
      { "Item Name": "Mystery", Category: "not-a-category", "Spots Needed": "", Serves: "0", Note: "" },
    ]);
    expect(r.skipped).toBe(0);
    expect(r.items[0]).toEqual({
      name: "Brownies",
      category: "dessert",
      slotsNeeded: 2,
      serves: 12,
      note: "Nut free",
    });
    expect(r.items[1]).toEqual({ name: "Ice", category: "supplies", slotsNeeded: 20 });
    expect(r.items[2]).toEqual({ name: "Mystery", category: "other", slotsNeeded: 1, serves: 1 });
  });

  it("skips rows without an item name and truncates past the cap", () => {
    const rows = [{ "Item Name": "" }, { Category: "Dessert" }];
    expect(parseBringRows(rows).items).toHaveLength(0);
    expect(parseBringRows(rows).skipped).toBe(2);

    const many = Array.from({ length: MAX_TEMPLATE_ROWS + 5 }, (_, i) => ({
      "Item Name": `Item ${i}`,
    }));
    const parsed = parseBringRows(many);
    expect(parsed.items).toHaveLength(MAX_TEMPLATE_ROWS);
    expect(parsed.truncated).toBe(true);
  });

  it("caps free text at the same lengths the server enforces", () => {
    const parsed = parseBringRows([
      { "Item Name": "x".repeat(400), Note: "y".repeat(900) },
    ]);
    expect(parsed.items[0]!.name).toHaveLength(120);
    expect(parsed.items[0]!.note).toHaveLength(300);
  });
});
