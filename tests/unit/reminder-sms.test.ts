import { describe, it, expect } from "vitest";
import {
  DEFAULT_REMINDER_SMS,
  REMINDER_SMS_MAX,
  renderReminderSms,
  isValidReminderSms,
} from "@/lib/reminder-sms";

describe("scheduled reminder SMS template", () => {
  it("renders the host's own words verbatim, only substituting tokens", () => {
    const out = renderReminderSms("Hey {name}, {event} is {when}! {link}", {
      eventTitle: "Kendrick Reunion",
      whenLabel: "tomorrow",
      guestName: "Adrian",
      link: "https://x.test/s/abc",
    });
    expect(out).toBe("Hey Adrian, Kendrick Reunion is tomorrow! https://x.test/s/abc");
  });

  it("falls back to the default template when the host cleared it", () => {
    expect(renderReminderSms("   ", { eventTitle: "Party", whenLabel: "today", link: "L" })).toBe(
      "Party is today. Details: L",
    );
    expect(DEFAULT_REMINDER_SMS).toContain("{event}");
  });

  it("leaves unknown tokens visible rather than blanking them", () => {
    expect(renderReminderSms("{event} {nope}", { eventTitle: "P" })).toBe("P {nope}");
  });

  it("caps length at one message worth of characters", () => {
    const out = renderReminderSms("x".repeat(500), {});
    expect(out.length).toBe(REMINDER_SMS_MAX);
  });

  it("treats any template as valid because it always renders something", () => {
    expect(isValidReminderSms(undefined)).toBe(true);
    expect(isValidReminderSms("{event}")).toBe(true);
  });
});
