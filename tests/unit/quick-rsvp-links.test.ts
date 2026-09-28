import { describe, expect, it } from "vitest";
import {
  answerLabel,
  isQuickRsvpAnswer,
  oneTapRsvpUrl,
  oneTapRsvpUrls,
  personalInviteUrl,
} from "@/lib/invite-links";
import { parseSmsAnswer, phoneKey } from "@/lib/sms-rsvp.server";

describe("personalized invite links", () => {
  it("adds the guest id so the page never asks for a name", () => {
    expect(personalInviteUrl("https://x.com/invite/e1", "g_9")).toBe(
      "https://x.com/invite/e1?g=g_9",
    );
  });

  it("keeps existing query strings intact", () => {
    expect(personalInviteUrl("https://x.com/invite/e1?utm=mail", "g_9")).toBe(
      "https://x.com/invite/e1?utm=mail&g=g_9",
    );
  });

  it("returns the base unchanged with no guest", () => {
    expect(personalInviteUrl("https://x.com/invite/e1", "")).toBe("https://x.com/invite/e1");
  });

  it("builds one-tap answer links", () => {
    expect(oneTapRsvpUrl("https://x.com/invite/e1", "g_9", "maybe")).toBe(
      "https://x.com/invite/e1?g=g_9&rsvp=maybe",
    );
    const all = oneTapRsvpUrls("https://x.com/invite/e1", "g_9");
    expect(all.rsvpYesUrl).toContain("rsvp=yes");
    expect(all.rsvpNoUrl).toContain("rsvp=no");
  });

  it("only accepts the three real answers from a URL", () => {
    expect(isQuickRsvpAnswer("yes")).toBe(true);
    expect(isQuickRsvpAnswer("waitlisted")).toBe(false);
    expect(isQuickRsvpAnswer(undefined)).toBe(false);
  });

  it("labels answers in traditional RSVP card wording", () => {
    expect(answerLabel("yes")).toBe("Joyfully accepts");
    expect(answerLabel("maybe")).toBe("Will try to make it");
    expect(answerLabel("no")).toBe("Regretfully declines");
  });
});

describe("SMS reply answers", () => {
  it("reads the common ways people say yes and no", () => {
    expect(parseSmsAnswer("YES")).toBe("yes");
    expect(parseSmsAnswer(" yes! ")).toBe("yes");
    expect(parseSmsAnswer("Y")).toBe("yes");
    expect(parseSmsAnswer("no.")).toBe("no");
    expect(parseSmsAnswer("Maybe")).toBe("maybe");
    expect(parseSmsAnswer("Sí")).toBe("yes");
  });

  it("ignores anything that isn't an answer", () => {
    expect(parseSmsAnswer("what time does it start?")).toBeNull();
    expect(parseSmsAnswer("STOP")).toBeNull();
  });

  it("matches phone numbers written in any format", () => {
    expect(phoneKey("+1 (704) 555-0134")).toBe("7045550134");
    expect(phoneKey("704.555.0134")).toBe("7045550134");
  });
});
