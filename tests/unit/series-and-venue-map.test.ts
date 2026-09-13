import { describe, expect, it } from "vitest";
import { listSeriesNames, seriesKey, siblingsInSeries, type KEvent } from "@/lib/events-store";

function ev(id: string, seriesName?: string): KEvent {
  return { id, title: id, date: "2027-01-01", guests: [], seriesName } as unknown as KEvent;
}

describe("series grouping", () => {
  it("normalises names so casing and spacing group together", () => {
    expect(seriesKey(" Reunion ")).toBe("reunion");
    expect(seriesKey(undefined)).toBe("");
  });

  it("lists distinct series names alphabetically", () => {
    const list = listSeriesNames([ev("a", "Wedding"), ev("b", "reunion"), ev("c", "Reunion"), ev("d")]);
    expect(list).toEqual(["reunion", "Wedding"]);
  });

  it("finds siblings but never the event itself, and none for standalone events", () => {
    const all = [ev("a", "Reunion"), ev("b", " reunion"), ev("c", "Wedding"), ev("d")];
    expect(siblingsInSeries(all, all[0]!).map((e) => e.id)).toEqual(["b"]);
    expect(siblingsInSeries(all, all[3]!)).toEqual([]);
  });
});
