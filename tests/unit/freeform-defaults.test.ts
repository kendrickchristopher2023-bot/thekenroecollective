import { describe, it, expect } from "vitest";
import { freeformSafeArea, freeformDefaultInk } from "@/lib/design-render";
import { TEMPLATES, getTemplate } from "@/lib/design-templates";

describe("free-form defaults", () => {
  it("safe area sits inside the canvas for every template", () => {
    for (const t of TEMPLATES) {
      const a = freeformSafeArea(t);
      expect(a.x, t.id).toBeGreaterThanOrEqual(0);
      expect(a.y, t.id).toBeGreaterThanOrEqual(0);
      expect(a.x + a.w, t.id).toBeLessThanOrEqual(t.width);
      expect(a.y + a.h, t.id).toBeLessThanOrEqual(t.height);
      expect(a.w, t.id).toBeGreaterThan(40);
      expect(a.h, t.id).toBeGreaterThan(40);
    }
  });

  it("apparel safe area lands on the shirt body, not the empty canvas", () => {
    const tee = getTemplate("apparel_event")!;
    const a = freeformSafeArea(tee);
    // Shirt body spans cx +/- 160 and starts well above y=300.
    expect(a.x).toBeGreaterThan(tee.width / 2 - 160);
    expect(a.x + a.w).toBeLessThan(tee.width / 2 + 160);
    expect(a.y).toBeGreaterThanOrEqual(280);
  });

  it("default ink auto-contrasts against the garment / background", () => {
    const tee = getTemplate("apparel_event")!;
    expect(freeformDefaultInk(tee, { shirt_color: "#101a33" })).toBe("#FFFFFF");
    expect(freeformDefaultInk(tee, { shirt_color: "#FDF2F4" })).toBe("#111111");
    const sign = TEMPLATES.find((t) => t.kind === "signage")!;
    expect(freeformDefaultInk(sign, { palette: { ...sign.palette, bg: "#0F172A" } })).toBe("#FFFFFF");
  });
});
