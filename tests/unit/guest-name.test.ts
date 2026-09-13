import { describe, it, expect } from "vitest";
import { shortGuestName, shortGuestNameOr } from "@/lib/guest-name";

describe("shortGuestName", () => {
  it("renders first name + last initial", () => {
    expect(shortGuestName("Chris Kendrick")).toBe("Chris K");
    expect(shortGuestName("riley vance")).toBe("riley V");
  });
  it("uses the final token as the last name", () => {
    expect(shortGuestName("Ana Maria Ortiz")).toBe("Ana O");
  });
  it("passes single names through", () => {
    expect(shortGuestName("Prince")).toBe("Prince");
  });
  it("handles blanks and padding", () => {
    expect(shortGuestName("   ")).toBe("");
    expect(shortGuestName(null)).toBe("");
    expect(shortGuestName("  Sam   Ortiz ")).toBe("Sam O");
  });
  it("falls back positionally for unnamed guests", () => {
    expect(shortGuestNameOr("", "Guest 2")).toBe("Guest 2");
    expect(shortGuestNameOr("Sam Ortiz", "Guest 2")).toBe("Sam O");
  });
});
