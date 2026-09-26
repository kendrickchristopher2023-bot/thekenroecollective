import { describe, expect, it } from "vitest";
import { composeScheduleSms, DEFAULT_MANUAL_SMS, normalizeJoinUrl, renderTemplate, smsSegments } from "@/lib/schedule-messages";

describe("schedule message presentation", () => {
  it("leads first texts with Reminder, the schedule and keeps attribution and STOP on separate lines", () => {
    const out = composeScheduleSms({
      title: "Kendrick Family Reunion Call",
      message: "Hi Chris, our next call is Sunday.\nhttps://example.com/sc/abc",
      hostName: "Chris",
      firstText: true,
    });
    expect(out).toMatch(/^Reminder: Kendrick Family Reunion Call\n/);
    expect(out).toContain("\n\nSent with The Kenroe Collective for Chris.\nReply STOP to opt out.");
    expect(out).not.toContain("abcReply");
  });

  it("does not duplicate a title already at the beginning", () => {
    const out = composeScheduleSms({ title: "Reunion Call", message: "Reunion Call starts soon.", firstText: false });
    expect(out).toBe("Reminder: Reunion Call\nReunion Call starts soon.");
  });

  it("does not duplicate a Reminder heading already at the beginning", () => {
    const out = composeScheduleSms({ title: "Reunion Call", message: "Reminder: Reunion Call starts soon.", firstText: false });
    expect(out).toBe("Reminder: Reunion Call starts soon.");
  });

  it("leaves welcomes unlabeled when leadLabel is null", () => {
    const out = composeScheduleSms({ title: "Reunion Call", message: "Welcome! Our first call is soon.", firstText: false, leadLabel: null });
    expect(out).toBe("Reunion Call\nWelcome! Our first call is soon.");
    expect(out).not.toContain("Reminder");
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

  it("gives Send now a complete event-first message with meeting details and RSVP", () => {
    const message = renderTemplate(DEFAULT_MANUAL_SMS, {
      first_name: "Chris",
      title: "Kendrick Family Reunion Call",
      when: "Sun, Oct 4 at 4:30 PM EDT",
      description: "Meeting ID: 123 456 7890\nPasscode: Family",
      join: "https://www.zoom.com/",
      rsvp: "https://thekenroecollective.com/sc/personal-token",
    });
    const out = composeScheduleSms({ title: "Kendrick Family Reunion Call", message, firstText: false });

    expect(out).toMatch(/^Kendrick Family Reunion Call\nHi Chris,/);
    expect(out).toContain("Meeting ID: 123 456 7890\nPasscode: Family");
    expect(out).toContain("Join meeting: https://www.zoom.com/");
    expect(out).toContain("RSVP: https://thekenroecollective.com/sc/personal-token");
    expect(out).not.toContain("Add it to your calendar");
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