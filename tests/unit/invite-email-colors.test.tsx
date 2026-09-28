import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import React from "react";
import { template } from "@/lib/email-templates/event-invite";
import { readableShade } from "@/lib/color-contrast";

const base = {
  guestName: "Alex",
  hostName: "Christopher",
  eventTitle: "The Kendrick Family Reunion",
  eventDate: "Friday, June 4, 2027",
  venue: "The Kenroe Estate",
  inviteUrl: "https://thekenroecollective.com/invite/x",
};

async function html(props: Record<string, unknown>) {
  const C = template.component as any;
  return render(React.createElement(C, { ...base, ...props }));
}

describe("event invite email colors", () => {
  it("uses the host accent for the card border and button", async () => {
    const out = await html({ accentColor: "#a8803a" });
    expect(out).toContain("#a8803a");
  });

  it("darkens a pale accent for text so it stays readable", async () => {
    const out = await html({ accentColor: "#f2e2a0" });
    expect(out).toContain(readableShade("#f2e2a0", "#fafaf7"));
  });

  it("renders unchanged defaults when no color is set", async () => {
    const out = await html({});
    expect(out).toContain("#5c1d1d");
  });

  it("includes the host crest when provided", async () => {
    const out = await html({ logo: "https://example.com/crest.png" });
    expect(out).toContain("https://example.com/crest.png");
  });
});
