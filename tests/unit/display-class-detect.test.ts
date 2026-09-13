import { describe, expect, it, vi, afterEach } from "vitest";
import { detectDisplayClass } from "@/hooks/use-display-class";

function screen(width: number, pointer: "fine" | "coarse") {
  vi.stubGlobal("window", {
    innerWidth: width,
    matchMedia: (q: string) => ({ matches: q.includes(pointer) }),
    localStorage: { getItem: () => null, setItem: () => {} },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("detectDisplayClass", () => {
  it("treats a 1920 laptop with a trackpad as a laptop", () => {
    screen(1920, "fine");
    expect(detectDisplayClass()).toBe("laptop");
  });
  it("treats a 1920 touch/remote screen as a TV", () => {
    screen(1920, "coarse");
    expect(detectDisplayClass()).toBe("tv");
  });
  it("keeps an iPad Pro landscape (touch only) as laptop, not TV", () => {
    screen(1366, "coarse");
    expect(detectDisplayClass()).toBe("laptop");
    screen(1376, "coarse");
    expect(detectDisplayClass()).toBe("laptop");
  });
  it("treats a very wide canvas as a TV even with a mouse", () => {
    screen(2560, "fine");
    expect(detectDisplayClass()).toBe("tv");
  });
  it("still detects phones and tablets", () => {
    screen(390, "coarse");
    expect(detectDisplayClass()).toBe("phone");
    screen(820, "coarse");
    expect(detectDisplayClass()).toBe("tablet");
  });
});
