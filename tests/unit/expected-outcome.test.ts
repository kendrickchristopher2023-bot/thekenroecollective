import { describe, it, expect } from "vitest";
import { expectedError, looksExpected, stripExpectedMark } from "@/lib/expected-outcome";
import { toUserMessage } from "@/lib/user-error";

describe("expected outcomes are not errors", () => {
  it("marks a deliberate refusal, invisibly to the customer", () => {
    const err = expectedError("This piece can't be lengthened.");
    expect(looksExpected(err.message, err.name)).toBe(true);
    expect(stripExpectedMark(err.message)).toBe("This piece can't be lengthened.");
    expect(toUserMessage(err)).toBe("This piece can't be lengthened.");
    expect(toUserMessage(err)).not.toContain("\u200b");
  });

  it("classifies authored gate and validation wording as expected", () => {
    expect(looksExpected("Unlock the Media Converter from Pricing or upgrade to Atelier.")).toBe(
      true,
    );
    expect(looksExpected("You can only save events you own or co-host.")).toBe(true);
    expect(
      looksExpected(
        "This piece was made before we started keeping its arrangement, so it can't be lengthened. Composing it again is the only route.",
      ),
    ).toBe(true);
  });

  it("still logs real failures, however politely worded", () => {
    expect(looksExpected("Failed to fetch")).toBe(false);
    // A signed-in caller being refused is a real failure, but nobody signed in
    // at all is just a visitor to send to the sign-in screen.
    expect(looksExpected("Unauthorized: you do not have access")).toBe(false);
    expect(looksExpected("Unauthorized: No authorization header provided")).toBe(true);
    expect(looksExpected("The request timed out, please try again.")).toBe(false);
    expect(looksExpected("Invalid server function ID: src_lib_x")).toBe(false);
    expect(looksExpected("Cannot read properties of null (reading 'style')")).toBe(false);
    expect(looksExpected("")).toBe(false);
  });
});
