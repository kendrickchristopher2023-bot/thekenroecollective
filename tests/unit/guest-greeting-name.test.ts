import { describe, expect, it } from "vitest";
import { greetingFirstName, greetingNameOrNull } from "@/lib/guest-name";

describe("greeting names", () => {
  it("never greets a guest by a bare title", () => {
    expect(greetingNameOrNull("Ms.")).toBeNull();
    expect(greetingNameOrNull("Mr")).toBeNull();
    expect(greetingNameOrNull("Dr.")).toBeNull();
    expect(greetingNameOrNull("")).toBeNull();
    expect(greetingNameOrNull(null)).toBeNull();
  });

  it("strips honorifics and suffixes to reach the first name", () => {
    expect(greetingFirstName("Ms. Cameron Wright")).toBe("Cameron");
    expect(greetingFirstName("Dr Rosa Osei Jr")).toBe("Rosa");
    expect(greetingFirstName("Malik Kendrick III")).toBe("Malik");
  });

  it("falls back to the full name when only a title-like token remains", () => {
    expect(greetingNameOrNull("Auntie")).toBeNull();
    expect(greetingNameOrNull("Quinton")).toBe("Quinton");
  });
});
