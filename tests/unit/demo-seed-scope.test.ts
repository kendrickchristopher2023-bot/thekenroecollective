import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * RECURRENCE GUARD for "deleted demo events came back".
 *
 * Production, preview and the demo share one database. The nightly demo reset
 * therefore MUST:
 *   - only ever delete rows owned by the demo host AND flagged is_demo
 *   - flag every row it inserts with is_demo: true
 *   - skip anything recorded in demo_seed_tombstones (owner deleted it on purpose)
 *
 * If any of those slip, real customer events become deletable by a cron job, or
 * deliberately removed demo rows resurrect every night.
 */
const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const SEED = readFileSync(join(ROOT, "src", "lib", "demo-seed.server.ts"), "utf8");

describe("demo seeder scope", () => {
  it("deletes events and vendors only when they are demo-flagged", () => {
    const deletes = SEED.match(/from\("(events|vendors)"\)[\s\S]{0,220}?;/g) ?? [];
    const destructive = deletes.filter((stmt) => stmt.includes(".delete()"));
    expect(destructive.length).toBeGreaterThan(0);
    for (const stmt of destructive) {
      expect(
        stmt.replace(/\s+/g, " "),
        "A demo reset delete is not restricted to is_demo rows. This is how real customer data becomes reachable by the nightly cron.",
      ).toMatch(/eq\("is_demo",\s*true\)/);
    }
  });

  it("flags every seeded event and vendor as demo data", () => {
    const shareTokens = SEED.match(/share_token: "demo-share-/g) ?? [];
    const flags = SEED.match(/^\s{4,6}is_demo: true,$/gm) ?? [];
    expect(shareTokens.length).toBeGreaterThan(0);
    // one flag per seeded event plus one on the shared vendor base object
    expect(flags.length).toBe(shareTokens.length + 1);
  });

  it("honours demo_seed_tombstones so deleted demo rows stay deleted", () => {
    expect(SEED).toContain('from("demo_seed_tombstones")');
    expect(SEED).toMatch(/buried\.has\(`event:/);
    expect(SEED).toMatch(/buried\.has\(`vendor:/);
  });

  it("restores both curated demo events from snapshots every night", () => {
    expect(SEED).toContain('const SNAPSHOT_EVENT_IDS = ["demo-reunion-200", "demo-evt-supper"]');
    expect(SEED).toContain('"demo-reunion-200": "The Kendrick Family Reunion"');
    expect(SEED).toContain('from("demo_event_snapshots")');
    expect(SEED).toContain('rpc("restore_demo_event_snapshot"');
  });

  it("keeps the seeded supper cast fictional", () => {
    expect(SEED).toContain('["Nolan Avery", "wren@example.com", "yes"]');
    expect(SEED).toContain('["Camille Brooks", "malik@example.com", "yes"]');
    expect(SEED).toContain('["Sabrina Mercer", "delphine@example.com", "pending"]');
    expect(SEED).toContain('["Elliot Vaughn", "arjun@example.com", "yes"]');
    expect(SEED).not.toMatch(/Wren Alvarez|Malik Osei|Delphine Roy|Arjun Mehta/);
  });
});
