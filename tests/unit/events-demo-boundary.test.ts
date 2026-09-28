/**
 * Guard test for the demo-data boundary.
 *
 * Aggregate/reporting modules must read events through the shared accessor in
 * src/lib/events-access.server.ts, which excludes demo rows by default. A new
 * report that queries `.from("events")` directly can silently reintroduce demo
 * contamination, so this test fails the build when that happens.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Modules that aggregate across many events and must be demo-safe. */
const REPORTING_MODULES = [
  "src/lib/payments-reconciliation.functions.ts",
  "src/lib/reconciliation-email.server.ts",
  "src/lib/owner-report.server.ts",
];

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("events demo boundary", () => {
  it("reporting modules never query the events table directly", () => {
    for (const mod of REPORTING_MODULES) {
      const src = read(mod);
      expect(src.includes('from("events")'), `${mod} bypasses eventsReadQuery`).toBe(false);
    }
  });

  it("reporting modules go through the shared accessor", () => {
    for (const mod of REPORTING_MODULES.slice(0, 2)) {
      expect(read(mod)).toContain("eventsReadQuery");
    }
  });

  it("the accessor excludes demo rows unless demo is requested", () => {
    const src = read("src/lib/events-access.server.ts");
    expect(src).toContain('if (mode === "production") return q.eq("is_demo", false)');
    expect(src).toContain('if (mode === "demo") return q.eq("is_demo", true)');
  });

  it("the admin events console filters by the marker, not by owner alone", () => {
    const src = read("src/lib/events-admin.server.ts");
    expect(src).toContain("is_demo");
  });

  /**
   * Cross-event reports that legitimately use the admin client still have to
   * scope demo rows explicitly, otherwise seeded showcase events inflate a
   * real owner's totals.
   */
  it("cross-event reports scope demo rows explicitly", () => {
    const src = read("src/lib/event-reports.server.ts");
    expect(src).toContain("getDemoScope");
    expect(src).toContain('.eq("is_demo" as never, scope.isDemo as never)');
  });

  it("the nightly demo reset preserves the curated showcase events", () => {
    const src = read("src/lib/demo-seed.server.ts");
    expect(src).toContain("PRESERVED_DEMO_EVENT_IDS");
    expect(src).toContain("demo-reunion-200");
    expect(src).toContain("demo-evt-supper");
    expect(src).toContain('.not("id", "in", `(${PRESERVED_DEMO_EVENT_IDS.join(",")})`)');
  });

  it("demo events carry a visible marker in the host's own list", () => {
    expect(read("src/lib/events-store.ts")).toContain("_isDemo");
    expect(read("src/routes/events.index.tsx")).toContain("Demo sample");
    // The marker is local bookkeeping and must never ride along on a public link.
    expect(read("src/lib/public-event-sanitize.ts")).toContain('"_isDemo"');
  });
});
