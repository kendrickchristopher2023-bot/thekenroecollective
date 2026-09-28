import { describe, expect, it } from "vitest";
import { AVERY_5160, CARD_H, CARD_W, addressLines, buildA7EnvelopesPdf, buildAveryLabelsPdf, buildThankYouCardPdf } from "@/lib/thankyou-print-export";
import type { Guest, ThankYouCard } from "@/lib/events-store";

const card: ThankYouCard = { id: "card-1", message: "Thank you for celebrating with us.", signOff: "With love, Amara and Elias", design: "ivory", channel: "print", recipientIds: ["one", "two"], createdAt: "2026-09-11T00:00:00.000Z" };
const guests: Guest[] = [
  { id: "one", name: "Ada Example", email: "ada@example.com", phone: "(555) 555-0101", address: "100 Example Way, Apt 1205, Charlotte, NC 28202", status: "yes" },
  { id: "two", name: "No Address", email: "none@example.com", phone: "(555) 555-0102", status: "yes" },
];

describe("thank-you print files", () => {
  it("keeps apartment addresses together and identifies missing addresses", () => {
    expect(addressLines(guests[0].address)).toEqual(["100 Example Way, Apt 1205", "Charlotte, NC 28202"]);
    expect(addressLines(guests[1].address)).toEqual([]);
  });
  it("makes a 5x7 card with exactly 0.125 inch bleed on every edge", async () => {
    const pdf = await buildThankYouCardPdf(card, "Example Celebration", guests, "shop");
    expect(pdf.getNumberOfPages()).toBe(2);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(CARD_W + 18, 4);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(CARD_H + 18, 4);
  });
  it("makes a US Letter two-up sheet", async () => {
    const pdf = await buildThankYouCardPdf(card, "Example Celebration", guests, "letter");
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(612, 4);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(792, 4);
  });
  it("uses Avery 5160 dimensions and omits guests without addresses", () => {
    expect(AVERY_5160).toMatchObject({ cols: 3, rows: 10, perSheet: 30, labelW: 189, labelH: 72 });
    const pdf = buildAveryLabelsPdf(guests, { guides: true });
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(612, 4);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(792, 4);
  });
  it("makes one A7 envelope page per addressed guest", () => {
    const pdf = buildA7EnvelopesPdf(guests);
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(522, 4);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(378, 4);
  });
});