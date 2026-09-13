import { describe, it, expect } from "vitest";
import { isIgnorable } from "@/lib/error-capture-client";

describe("error capture noise filter", () => {
  it("drops benign ResizeObserver browser quirks", () => {
    expect(
      isIgnorable("ResizeObserver loop completed with undelivered notifications."),
    ).toBe(true);
    expect(isIgnorable("ResizeObserver loop limit exceeded")).toBe(true);
  });

  it("keeps real application errors, including hydration and RSVP failures", () => {
    expect(isIgnorable("Minified React error #418")).toBe(false);
    expect(isIgnorable("Quick RSVP rejected (answer=yes)")).toBe(false);
    expect(isIgnorable("Cannot read properties of null (reading 'style')")).toBe(false);
    expect(isIgnorable("Failed to fetch")).toBe(false);
  });
});
