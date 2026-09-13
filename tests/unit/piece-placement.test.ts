import { describe, expect, it } from "vitest";
import {
  isMoment,
  placementFor,
  placementLabel,
  pieceKindLabel,
  recommendedKind,
} from "@/lib/wall-soundtrack";

describe("placement by kind", () => {
  it("never loops a letter, whatever is asked for", () => {
    expect(placementFor("letter")).toBe("moment");
    expect(placementFor("letter", "bed")).toBe("moment");
  });

  it("keeps a song as the bed under the photos", () => {
    expect(placementFor("song")).toBe("bed");
    expect(placementFor("song", "moment")).toBe("bed");
  });

  it("lets a poem be either", () => {
    expect(placementFor("poem")).toBe("bed");
    expect(placementFor("poem", "moment")).toBe("moment");
  });

  it("reads an existing wall row", () => {
    expect(isMoment({ kind: "letter" })).toBe(true);
    expect(isMoment({ kind: "poem", placement: "moment" })).toBe(true);
    expect(isMoment({ kind: "poem" })).toBe(false);
    expect(isMoment({ kind: "song" })).toBe(false);
    expect(isMoment(null)).toBe(false);
  });

  it("says plainly what each placement does", () => {
    expect(placementLabel("moment")).toMatch(/once/i);
    expect(placementLabel("bed")).toMatch(/loops/i);
    expect(pieceKindLabel("letter")).toBe("Letter");
  });

  it("recommends a kind for the occasion", () => {
    expect(recommendedKind("Ruthie's memorial").kind).toBe("letter");
    expect(recommendedKind("Tenia's 40th Birthday").kind).toBe("song");
  });
});
