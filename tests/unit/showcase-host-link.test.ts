import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SHOWCASE_INTERACTION_KINDS } from "@/lib/showcase.functions";

const invite = readFileSync("src/routes/invite.$eventId.tsx", "utf8");

describe("showcase invitation host-view link", () => {
  it("shows the host's view to every showcase visitor, not only those from /events", () => {
    const bar = invite.slice(invite.indexOf("function ShowcaseBackToEventsBar"));
    // The bar bails only when the event is not the showcase.
    expect(bar).toMatch(/if \(!show\) return null;/);
    expect(bar).not.toMatch(/if \(!show \|\| !fromEvents\) return null/);
    expect(bar).toContain("See the host's view");
    // "Back to my events" stays conditional on arriving from the events list.
    expect(bar).toMatch(/fromEvents \? \([\s\S]*Back to my events/);
  });

  it("counts the click with its own interaction kind", () => {
    expect(SHOWCASE_INTERACTION_KINDS).toContain("example_host_link");
    expect(invite).toContain('kind: "example_host_link"');
  });
});
