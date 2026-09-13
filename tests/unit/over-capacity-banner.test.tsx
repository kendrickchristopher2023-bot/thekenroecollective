import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OverCapacityBanner } from "@/components/over-capacity-banner";
import type { Guest, KEvent } from "@/lib/events-store";

function guest(p: Partial<Guest>): Guest {
  return { id: Math.random().toString(36).slice(2), name: "G", status: "pending", ...p } as Guest;
}
function ev(capacity: number | undefined, guests: Guest[]): KEvent {
  return { id: "e", title: "E", date: "2026-09-01T18:00", capacity, guests } as KEvent;
}
const text = (event: KEvent) =>
  renderToStaticMarkup(<OverCapacityBanner event={event} />).replace(/<[^>]+>/g, "");

describe("OverCapacityBanner", () => {
  it("renders nothing without a cap", () => {
    expect(text(ev(undefined, [guest({ adults: 9 })]))).toBe("");
  });

  it("renders nothing while within the cap", () => {
    expect(text(ev(10, [guest({ adults: 2 }), guest({ adults: 1 })]))).toBe("");
  });

  it("shows invited vs capacity and the overage once over", () => {
    // 5 + 3 (guest + 2 kids) + 4 (guest + 3 plus-ones) = 12 committed, cap 5.
    const out = text(
      ev(5, [
        guest({ adults: 5 }),
        guest({ adults: 1, children: 2, status: "maybe" }),
        guest({ adults: 1, plusOnes: [{ name: "a" }, { name: "b" }, { name: "c" }], status: "yes" }),
        guest({ adults: 8, status: "no" }),
        guest({ adults: 8, status: "waitlisted" }),
      ]),
    );
    expect(out).toContain("12 invited, capacity 5");
    expect(out).toContain("7 over");
  });
});

describe("OverCapacityBanner: plus-one pushes an at-capacity event over", () => {
  it("goes from silent at exactly capacity to showing the overage once a plus-one lands", () => {
    const atCap = ev(5, [
      guest({ id: "a", status: "yes", adults: 1, plusOnes: [{ name: "p1" }, { name: "p2" }] }),
      guest({ id: "b", status: "yes", adults: 1 }),
      guest({ id: "c", status: "pending", adults: 1 }),
    ]);
    expect(text(atCap)).toBe("");
    const withPlusOne = ev(5, [
      guest({ id: "a", status: "yes", adults: 1, plusOnes: [{ name: "p1" }, { name: "p2" }] }),
      guest({ id: "b", status: "yes", adults: 1, plusOnes: [{ name: "p3" }] }),
      guest({ id: "c", status: "pending", adults: 1 }),
    ]);
    const out = text(withPlusOne);
    expect(out).toContain("6 invited, capacity 5");
    expect(out).toContain("1 over");
  });
});
