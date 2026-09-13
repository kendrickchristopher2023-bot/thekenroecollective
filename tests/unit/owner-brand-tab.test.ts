import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The owner console sits behind a live authenticator code, so an automated
// browser cannot reach the tab strip. Pin the wiring at source level instead:
// the tab exists, it renders the Brand kit panel, and the panel links to /brand.
const owner = readFileSync("src/routes/_authenticated/owner.tsx", "utf8");

describe("owner console Brand kit tab", () => {
  it("has a Brand kit tab that is a valid ?tab= value", () => {
    expect(owner).toContain('{ id: "brand", label: "Brand kit" }');
    expect(owner).toMatch(/TABS\.some\(\(t\) => t\.id === search\.tab\)/);
  });
  it("renders the panel for that tab and links to /brand", () => {
    expect(owner).toContain('{tab === "brand" && <BrandKitPanel />}');
    const panel = owner.slice(owner.indexOf("function BrandKitPanel"));
    expect(panel).toContain('to="/brand"');
    expect(panel).toContain("Open the Brand kit");
  });
  it("no longer exposes the logo pack in the public footer", () => {
    const nav = readFileSync("src/components/site-nav.tsx", "utf8");
    expect(nav).not.toContain("Logo files");
    expect(nav).not.toMatch(/to="\/brand"/);
  });
});
