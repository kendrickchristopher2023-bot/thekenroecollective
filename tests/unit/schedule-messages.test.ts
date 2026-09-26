import { describe, expect, it } from "vitest";
import { composeScheduleSms, DEFAULT_MANUAL_SMS, meetingIdFromUrl, normalizeJoinUrl, renderTemplate, smsSegments } from "@/lib/schedule-messages";

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

    expect(out).toMatch(/^Reminder: Kendrick Family Reunion Call\nHi Chris,/);
    expect(out).toContain("Meeting ID: 123 456 7890\nPasscode: Family");
    expect(out).toContain("Join meeting: https://www.zoom.com/");
    expect(out).toContain("RSVP: https://thekenroecollective.com/sc/personal-token");
    expect(out).not.toContain("Add it to your calendar");
  });

  it("keeps a realistic reminder text within 3 segments after adding the Reminder label", () => {
    const message = renderTemplate(DEFAULT_MANUAL_SMS, {
      first_name: "Chris",
      title: "Kendrick Family Reunion Call",
      when: "Sun, Oct 4 at 4:30 PM EDT",
      description: "Meeting ID: 628 671 9107\nPasscode: 121212",
      join: "https://www.zoom.com/",
      rsvp: "https://thekenroecollective.com/sc/fb293bf39e7f79879003e784e9c780cbf980e11c32bae6ac",
    });
    const out = composeScheduleSms({
      title: "Kendrick Family Reunion Call",
      message,
      hostLine: " Questions? Julius Kendrick (586) 823-8085",
      firstText: false,
    });
    const segments = smsSegments(out);
    expect(segments.segments).toBeLessThanOrEqual(3);
    expect(segments.chars).toBeGreaterThan(300);
  });
});

describe("schedule join-link normalization", () => {
  it.each([
    ["https://us05web.zoom.us/j/6286719107?pwd=secret", "628 671 9107"],
    ["https://meet.google.com/abc-defg-hij", "abc-defg-hij"],
    ["https://teams.microsoft.com/l/meetup-join/19%3ameeting_example", "19:meeting_example"],
  ])("extracts the public meeting ID from %s", (input, expected) => expect(meetingIdFromUrl(input)).toBe(expected));

  it("never treats Zoom's pwd parameter as a passcode", () => {
    expect(meetingIdFromUrl("https://zoom.us/j/6286719107?pwd=private")).toBe("628 671 9107");
  });
  it.each([
    ["www.zoom.com/j/123", "https://www.zoom.com/j/123"],
    ["zoom.us/j/123", "https://zoom.us/j/123"],
    ["https://meet.google.com/abc", "https://meet.google.com/abc"],
  ])("normalizes %s", (input, expected) => expect(normalizeJoinUrl(input)).toBe(expected));

  it.each(["javascript:alert(1)", "data:text/html,bad", "not-a-link"])("rejects unsafe or incomplete %s", (input) => {
    expect(() => normalizeJoinUrl(input)).toThrow();
  });
});