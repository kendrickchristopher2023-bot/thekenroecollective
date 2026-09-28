import { describe, expect, it } from "vitest";
import { buildMasterReport, masterReportMatrix } from "@/lib/master-guest-report";
import {
  billableAdults,
  billableChildren,
  partyHeadcount,
  partyMemberCount,
  type KEvent,
} from "@/lib/events-store";

// Quinton Kendrick on demo-reunion-200: 1 adult + 1 named adult plus-one + 2
// kids = 4 people. The report must agree with the seating chart and payment
// helpers for the same guest, otherwise the numbers disagree across screens.
const quinton = {
  id: "g-quinton",
  name: "Quinton Kendrick",
  email: "quinton@example.com",
  phone: "555-0100",
  status: "yes",
  adults: 1,
  children: 2,
  pets: 0,
  plusOnes: [{ name: "Monica K", isChild: false }],
  shirtSize: "L",
  dietary: "No pork",
} as any;

const declined = { id: "g-2", name: "Ada Kendrick", status: "no", adults: 2 } as any;
const pending = { id: "g-3", name: "Ray Kendrick", email: "ray@example.com", status: "pending", adults: 1 } as any;

const event = {
  id: "demo-test",
  title: "Kendrick Reunion",
  date: "2026-08-29T18:00:00",
  timezone: "America/New_York",
  guests: [quinton, declined, pending],
} as unknown as KEvent;

describe("master guest report", () => {
  const report = buildMasterReport(event);
  const row = report.rows.find((r) => r.id === "g-quinton")!;

  it("matches the shared party helpers for a guest with named plus-ones", () => {
    expect(row.headcount).toBe(partyHeadcount(quinton));
    expect(row.headcount).toBe(4);
    expect(row.adults).toBe(billableAdults(quinton));
    expect(row.adults).toBe(2);
    expect(row.children).toBe(billableChildren(quinton));
    expect(row.children).toBe(2);
    expect(row.seatCount).toBe(partyMemberCount(quinton));
  });

  it("lists every plus-one by name rather than as a count", () => {
    expect(row.members.map((m) => m.name)).toContain("Monica K");
    expect(row.plusOneNames).toEqual(["Monica K"]);
  });

  it("counts attendees from confirmed guests only", () => {
    expect(report.totals.attendees).toBe(4);
    expect(report.totals.adults).toBe(2);
    expect(report.totals.children).toBe(2);
    expect(report.totals.declined).toBe(1);
    expect(report.totals.pending).toBe(1);
  });

  it("surfaces non-responders for the reminder flow", () => {
    expect(report.nonResponders.map((r) => r.id)).toEqual(["g-3"]);
  });

  it("aggregates dietary notes for the caterer", () => {
    const labels = report.dietaryAggregate.map((d) => d.label.toLowerCase()).join(" ");
    const free = report.dietaryFreeText.map((d) => d.note.toLowerCase()).join(" ");
    expect(`${labels} ${free}`).toContain("pork");
  });

  it("exports a CSV matrix with one header row and one row per guest", () => {
    const rows = masterReportMatrix(report);
    expect(rows.length).toBe(report.rows.length + 1);
    expect(String(rows[0]![0]).toLowerCase()).toContain("name");
  });
});
