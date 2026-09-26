import { describe, expect, it } from "vitest";
import { composeScheduleSms, normalizeJoinUrl, renderTemplate, smsSegments } from "@/lib/schedule-messages";

describe("schedule message presentation", () => {
  it("leads first texts with the schedule and keeps attribution and STOP on separate lines", () => {
    const out = composeScheduleSms({
      title: "Kendrick Family Reunion Call",
      message: "Hi Chris, our next call is Sunday.\nhttps://example.com/sc/abc",
      hostName: "Chris",
      firstText: true,
    });
    expect(out).toMatch(/^Kendrick Family Reunion Call\n/);
    expect(out).toContain("\n\nSent with The Kenroe Collective for Chris.\nReply STOP to opt out.");
    expect(out).not.toContain("abcReply");
  });

  it("does not duplicate a title already at the beginning", () => {
    const out = composeScheduleSms({ title: "Reunion Call", message: "Reunion Call starts soon.", firstText: false });
    expect(out).toBe("Reunion Call starts soon.");
  });

  it("preserves compliance text when a long body is shortened", () => {
    const out = composeScheduleSms({ title: "Reunion", message: "x".repeat(700), hostName: "Chris", firstText: true });
    expect(out.length).toBeLessThanOrEqual(480);
    expect(out.endsWith("Reply STOP to opt out.")).toBe(true);
    expect(smsSegments(out).segments).toBeGreaterThan(1);
  });

  it("renders an optional description merge field", () => {
    expect(renderTemplate("Details: {description}", { description: "Meeting ID: 123\nPasscode: 456" }))
      .toBe("Details: Meeting ID: 123\nPasscode: 456");
  });
});

describe("schedule join-link normalization", () => {
  it.each([
    ["www.zoom.com/j/123", "https://www.zoom.com/j/123"],
    ["zoom.us/j/123", "https://zoom.us/j/123"],
    ["https://meet.google.com/abc", "https://meet.google.com/abc"],
  ])("normalizes %s", (input, expected) => expect(normalizeJoinUrl(input)).toBe(expected));

  it.each(["javascript:alert(1)", "data:text/html,bad", "not-a-link"])("rejects unsafe or incomplete %s", (input) => {
    expect(() => normalizeJoinUrl(input)).toThrow();
  });
});