import { describe, expect, it } from "vitest";
import { buildGuestReport, guestNeedRows } from "@/lib/guest-report";

const event = {
  title: "Needs Test",
  guests: [
    {
      id: "g1",
      name: "Dana Ellis",
      status: "yes",
      dietary: "Nut allergy",
      accessibilityNotes: "Step-free access",
      plusOnes: [{ name: "Riley Vance", dietary: "Vegetarian" }],
    },
    { id: "g2", name: "Sam Okoro", status: "yes" },
    { id: "g3", name: "Ada Rowe", status: "maybe", accessibilityNotes: "ASL interpreter" },
  ],
};

describe("guestNeedRows", () => {
  const rows = guestNeedRows(buildGuestReport(event, "ev1"));

  it("lists only guests with dietary or accessibility notes", () => {
    expect(rows.map((r) => r.name)).toEqual([
      "Dana Ellis",
      "Dana Ellis's party",
      "Ada Rowe",
    ]);
  });

  it("keeps both note kinds and the RSVP status", () => {
    expect(rows[0]).toMatchObject({
      dietary: "Nut allergy",
      accessibility: "Step-free access",
      rsvp: "Attending",
    });
    expect(rows[1]?.dietary).toContain("Riley Vance: Vegetarian");
    expect(rows[2]).toMatchObject({ accessibility: "ASL interpreter", dietary: "" });
  });

  it("counts needs in the report summary", () => {
    const report = buildGuestReport(event, "ev1");
    expect(report.summary.withDietary).toBe(1);
    expect(report.summary.withAccessibility).toBe(2);
  });
});
