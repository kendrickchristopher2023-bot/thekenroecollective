import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@react-email/components";
import { buildSenderName, sanitizeSenderName } from "@/lib/email/sender-name";
import { TEMPLATES } from "@/lib/email-templates/registry";

describe("sender display name", () => {
  it("leads with the host and the occasion", () => {
    expect(
      buildSenderName({ hostName: "Christopher Kendrick", eventTitle: "Kendrick Family Reunion 2027" }),
    ).toBe("Christopher Kendrick (Kendrick Family Reunion 2027)");
  });

  it("honours a host override", () => {
    expect(buildSenderName({ override: "Kendrick Family Reunion", hostName: "X", eventTitle: "Y" })).toBe(
      "Kendrick Family Reunion",
    );
  });

  it("falls back to the event title, then the platform", () => {
    expect(buildSenderName({ eventTitle: "A Summer Feast" })).toBe("A Summer Feast");
    expect(buildSenderName({})).toBe("The Kenroe Collective");
  });

  it("strips header-breaking characters", () => {
    expect(sanitizeSenderName('Bad"<name>@,\r\nhere')).toBe("Badname here");
  });
});

describe("guest-facing email trust signals", () => {
  it("invitation subject leads with the event and body says who and why", async () => {
    const t = TEMPLATES["event-invite"]!;
    const data = t.previewData ?? {};
    const subject = typeof t.subject === "function" ? t.subject(data as any) : t.subject;
    expect(subject).toBe("You're invited: A Summer's Feast");
    const html = await render(React.createElement(t.component as any, data));
    expect(html).toContain("added you to the guest list");
    expect(html).toContain("Christopher");
  });

  it("reminder subject leads with the event", () => {
    const t = TEMPLATES["rsvp-reminder"]!;
    const data = t.previewData ?? {};
    const subject = typeof t.subject === "function" ? t.subject(data as any) : t.subject;
    expect(subject).toContain("A Summer's Feast");
    expect(subject.startsWith("A Summer's Feast")).toBe(true);
  });
});
