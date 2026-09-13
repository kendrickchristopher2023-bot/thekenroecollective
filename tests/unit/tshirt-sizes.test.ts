import { describe, expect, it } from "vitest";
import {
  SHIRT_SIZES,
  formatShirtTally,
  isShirtSize,
  shirtSizeLabel,
  tallyShirtSizes,
} from "@/lib/tshirt-sizes";

describe("tshirt sizes", () => {
  it("only accepts enum values (no free text can reach the event blob)", () => {
    expect(isShirtSize("adult_m")).toBe(true);
    expect(isShirtSize("Adult M")).toBe(false);
    expect(isShirtSize("<script>")).toBe(false);
    expect(SHIRT_SIZES).toContain("unsure");
  });

  it("counts each person, guest plus every named plus-one", () => {
    const { counts, total, missing } = tallyShirtSizes([
      { status: "yes", shirtSize: "adult_m", plusOnes: [{ shirtSize: "adult_m" }, { shirtSize: "youth_s" }] },
      { status: "maybe", shirtSize: "adult_l" },
      { status: "pending" }, // no size yet
    ]);
    expect(total).toBe(4);
    expect(missing).toBe(1);
    expect(counts.find((c) => c.size === "adult_m")?.count).toBe(2);
    expect(counts.find((c) => c.size === "youth_s")?.count).toBe(1);
    expect(formatShirtTally(counts)).toContain("Adult M ×2");
  });

  it("excludes declined and waitlisted people from the order", () => {
    const { total } = tallyShirtSizes([
      { status: "no", shirtSize: "adult_m" },
      { status: "waitlisted", shirtSize: "adult_l" },
      { status: "yes", shirtSize: "adult_s" },
    ]);
    expect(total).toBe(1);
  });

  it("labels sizes with an explicit youth/adult ladder", () => {
    expect(shirtSizeLabel("youth_l")).toBe("Youth L");
    expect(shirtSizeLabel("adult_3xl")).toBe("Adult 3XL");
    expect(shirtSizeLabel("bogus")).toBe("");
  });
});
