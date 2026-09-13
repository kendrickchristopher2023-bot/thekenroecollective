import { describe, expect, it } from "vitest";
import { attendanceCsvRows, shirtCsvRows } from "@/lib/report-csv";
import { ACCOUNT_REPORTS, visibleAccountReports } from "@/lib/report-directory";

const event = {
  title: "A Summer Jam",
  tshirtSizesEnabled: true,
  guests: [
    {
      id: "g1",
      name: "Christopher Kendrick",
      email: "chris@example.com",
      status: "yes",
      adults: 2,
      children: 1,
      shirtSize: "adult_l",
      plusOnes: [{ name: "Dana Reeves", shirtSize: "adult_m" }],
    },
    { id: "g2", name: "Nope Person", status: "no", shirtSize: "adult_s" },
    { id: "g3", name: "No Size", status: "yes" },
  ],
};

describe("attendanceCsvRows", () => {
  it("returns a header plus one row per guest", () => {
    const rows = attendanceCsvRows(event, "ev1");
    expect(rows[0]).toContain("Name");
    expect(rows[0]).toContain("RSVP");
    expect(rows).toHaveLength(4);
  });

  it("omits guest-submitted note columns", () => {
    const header = attendanceCsvRows(event, "ev1")[0] as string[];
    expect(header).not.toContain("Dietary restrictions");
    expect(header).not.toContain("Accessibility needs");
  });
});

describe("shirtCsvRows", () => {
  it("tallies attending guests and their plus-ones, skipping declines", () => {
    const rows = shirtCsvRows(event);
    const flat = rows.map((r) => r.join("|"));
    expect(flat).toContain("Adult L|1");
    expect(flat).toContain("Adult M|1");
    expect(flat.some((r) => r.startsWith("Adult S"))).toBe(false);
    expect(flat).toContain("Total shirts|2");
    expect(flat).toContain("No size chosen|1");
  });

  it("lists each person with their size and who they came with", () => {
    const flat = shirtCsvRows(event).map((r) => r.join("|"));
    expect(flat.some((r) => r.includes("Dana Reeves") && r.includes("Plus-one of Christopher Kendrick"))).toBe(true);
    expect(flat.some((r) => r.includes("No Size") && r.includes("Not chosen"))).toBe(true);
  });
});

describe("report directory", () => {
  it("hides owner-only reports from plain admins", () => {
    const admin = visibleAccountReports(false);
    expect(admin.every((r) => !r.ownerOnly)).toBe(true);
    expect(visibleAccountReports(true)).toHaveLength(ACCOUNT_REPORTS.length);
  });

  it("gives every report a destination", () => {
    for (const r of ACCOUNT_REPORTS) expect(r.ownerTab ?? r.route).toBeTruthy();
  });
});
