import { describe, expect, it } from "vitest";
import {
  buildGuestOpenStatuses,
  isLikelyBotUserAgent,
  isRsvpFlowRedFlag,
  openWithoutAnswerRate,
  INVITE_OPEN_TRACKING_START,
} from "@/lib/invite-opens";

const REAL_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

describe("bot filtering", () => {
  it("accepts a real phone browser", () => {
    expect(isLikelyBotUserAgent(REAL_UA)).toBe(false);
  });

  it("rejects link previewers, mail scanners and headless clients", () => {
    for (const ua of [
      "",
      null,
      "curl/8.4.0",
      "facebookexternalhit/1.1",
      "WhatsApp/2.23",
      "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120",
      "Mozilla/5.0 (compatible; Googlebot/2.1)",
      "Mozilla/5.0 SafeLinks",
      "Slackbot-LinkExpanding 1.0",
    ]) {
      expect(isLikelyBotUserAgent(ua)).toBe(true);
    }
  });
});

describe("open statuses", () => {
  const rows = [
    { guestId: "g1", firstOpenedAt: "2026-08-27T10:00:00Z", lastOpenedAt: "2026-08-27T12:00:00Z", openCount: 5 },
  ];

  it("reports never-opened for events created after tracking started", () => {
    const map = buildGuestOpenStatuses(["g1", "g2"], rows, "2026-08-28T00:00:00Z");
    expect(map.get("g1")!.state).toBe("opened");
    expect(map.get("g1")!.openCount).toBe(5);
    expect(map.get("g2")!.state).toBe("never");
  });

  it("reports untracked, never 'never opened', for older events", () => {
    const map = buildGuestOpenStatuses(["g1", "g2"], rows, "2026-01-01T00:00:00Z");
    expect(map.get("g2")!.state).toBe("untracked");
    expect(map.get("g1")!.state).toBe("opened");
  });

  it("treats a missing creation date as untracked-free (no event, no claim)", () => {
    const map = buildGuestOpenStatuses(["g2"], [], null);
    expect(map.get("g2")!.state).toBe("never");
    expect(INVITE_OPEN_TRACKING_START).toMatch(/^2026-/);
  });
});

describe("health signal", () => {
  it("computes the ratio", () => {
    expect(openWithoutAnswerRate(20, 14)).toBeCloseTo(0.7);
    expect(openWithoutAnswerRate(0, 0)).toBe(0);
  });

  it("flags a broken RSVP flow only with enough signal", () => {
    expect(isRsvpFlowRedFlag(18, 14)).toBe(true);
    expect(isRsvpFlowRedFlag(4, 4)).toBe(false);
    expect(isRsvpFlowRedFlag(20, 2)).toBe(false);
  });
});
