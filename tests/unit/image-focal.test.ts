import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOCAL,
  focalImageStyle,
  isDefaultFocal,
  parseFocalUrl,
  withFocalUrl,
} from "@/lib/image-focal";

const URL = "https://cdn.example.com/a/photo.jpg";

describe("image focal points", () => {
  it("existing URLs with no focal point stay centered and unchanged", () => {
    const parsed = parseFocalUrl(URL);
    expect(parsed.src).toBe(URL);
    expect(parsed.focal).toEqual(DEFAULT_FOCAL);
    expect(focalImageStyle(parsed.focal)).toEqual({
      objectFit: "cover",
      objectPosition: "50% 50%",
    });
  });

  it("round-trips a focal point through the URL fragment", () => {
    const next = withFocalUrl(URL, { x: 50, y: 18, scale: 1.4, fit: "cover" });
    expect(next).toBe(`${URL}#f=50,18,1.4`);
    expect(parseFocalUrl(next)).toEqual({
      src: URL,
      focal: { x: 50, y: 18, scale: 1.4, fit: "cover" },
    });
  });

  it("reset to center removes the fragment entirely", () => {
    const adjusted = withFocalUrl(URL, { x: 20, y: 0, scale: 2, fit: "cover" });
    expect(withFocalUrl(adjusted, DEFAULT_FOCAL)).toBe(URL);
    expect(isDefaultFocal(DEFAULT_FOCAL)).toBe(true);
  });

  it("clamps out-of-range values instead of producing broken CSS", () => {
    const { focal } = parseFocalUrl(`${URL}#f=999,-40,99`);
    expect(focal).toEqual({ x: 100, y: 0, scale: 3, fit: "cover" });
  });

  it("supports fitting the whole photo (zoom out) with contain", () => {
    const next = withFocalUrl(URL, { x: 50, y: 50, scale: 1, fit: "contain" });
    expect(next).toBe(`${URL}#f=50,50,1,contain`);
    expect(focalImageStyle(parseFocalUrl(next).focal).objectFit).toBe("contain");
  });

  it("zooming in scales from the chosen focus", () => {
    const style = focalImageStyle({ x: 30, y: 20, scale: 2, fit: "cover" });
    expect(style.transform).toBe("scale(2)");
    expect(style.transformOrigin).toBe("30% 20%");
  });

  it("ignores empty values", () => {
    expect(parseFocalUrl("").src).toBe("");
    expect(withFocalUrl("", DEFAULT_FOCAL)).toBe("");
  });
});
