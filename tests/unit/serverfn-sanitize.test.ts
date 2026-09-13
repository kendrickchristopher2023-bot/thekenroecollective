import { describe, expect, it } from "vitest";

import { toUserMessage } from "@/lib/user-error";

/**
 * A raw validation object or database message must never reach a screen, while
 * sentences we wrote for people pass through untouched.
 */
describe("server call error wording", () => {
  it("replaces machine output with one sentence", () => {
    const zod = `[{"code":"invalid_type","path":["subject"],"message":"Required"}]`;
    const shown = toUserMessage(new Error(zod));
    expect(shown).not.toContain("invalid_type");
    expect(shown.toLowerCase()).toContain("form");
  });

  it("replaces database detail", () => {
    const shown = toUserMessage(new Error('permission denied for table "rfq_requests"'));
    expect(shown).not.toContain("rfq_requests");
  });

  it("keeps authored refusals exactly", () => {
    const authored = "Requesting vendor quotes is available on Host and Atelier plans.";
    expect(toUserMessage(new Error(authored))).toBe(authored);
  });
});
