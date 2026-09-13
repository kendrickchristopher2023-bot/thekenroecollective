import { describe, expect, it } from "vitest";
import { buildGuestReport, guestReportMatrix, guestReportSummaryPairs } from "@/lib/guest-report";

const event = {
  id: "evt1",
  title: "A Summer Jam",
  plusOnesAllowed: 2,
  kidsEnabled: true,
  petsEnabled: true,
  tshirtSizesEnabled: true,
  paymentEnabled: true,
  paymentAmount: 25,
  guests: [
    {
      id: "g1",
      name: "Ada Rowe",
      email: "ada@example.com",
      status: "yes",
      adults: 1,
      children: 1,
      pets: 2,
      dietary: "Gluten free",
      accessibilityNotes: "Step-free access",
      shirtSize: "m",
      plusOnes: [{ name: "Miles", dietary: "Vegan", shirtSize: "l" }],
    },
    { id: "g2", name: "No Reply", status: "pending" },
  ],
};

describe("guest report", () => {
  const report = buildGuestReport(event as never, "evt1");

  it("includes every submitted guest field the old CSV dropped", () => {
    for (const col of [
      "Dietary restrictions",
      "Accessibility needs",
      "T-shirt size",
      "Plus-one names",
      "Plus-one shirt sizes",
      "Payment status",
    ]) {
      expect(report.columns).toContain(col);
    }
    const row = report.rows[0]!;
    expect(row[report.columns.indexOf("Dietary restrictions")]).toContain("Gluten free");
    expect(row[report.columns.indexOf("Accessibility needs")]).toContain("Step-free");
    expect(String(row[report.columns.indexOf("Plus-one names")])).toContain("Miles");
  });

  it("hides optional columns when the event has them switched off", () => {
    const plain = buildGuestReport(
      {
        id: "e2",
        title: "Plain",
        kidsEnabled: false,
        petsEnabled: false,
        guests: [{ id: "a", name: "A", status: "yes" }],
      } as never,
      "e2",
    );
    expect(plain.columns).not.toContain("T-shirt size");
    expect(plain.columns).not.toContain("Pets");
    expect(plain.columns).not.toContain("Kids");
    expect(plain.columns).not.toContain("Payment status");
  });

  it("emits a csv matrix with a header row and one row per guest", () => {
    const matrix = guestReportMatrix(report);
    expect(matrix.length).toBe(report.rows.length + 1);
    expect(matrix[0]).toEqual(report.columns);
  });

  it("summarises rsvp, dietary and accessibility counts", () => {
    const pairs = guestReportSummaryPairs(report);
    const map = new Map(pairs.map((p) => [p.label, p.value]));
    expect(map.get("Guest rows")).toBe("2");
    expect(map.get("Attending")).toBe("1");
    expect(report.summary.withDietary).toBe(1);
    expect(report.summary.withAccessibility).toBe(1);
  });
});
