import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("demo lockdown source boundaries", () => {
  it("uses the locked showcase account instead of Demo Host", () => {
    const source = read("src/lib/showcase-seed.server.ts");
    expect(source).toContain("ensureShowcaseAccount");
    expect(source).toContain("adopt_showcase_event");
    expect(source).not.toContain("findDemoUserId");
  });

  it("does not let a cookie authorize public demo writes", () => {
    const source = read("src/lib/demo-write-guard.server.ts");
    expect(source).toContain("isDemoCaller");
    expect(source).not.toContain("isDemoRequest()");
  });

  it("refuses demo and showcase duplication", () => {
    const source = read("src/lib/events-store.ts");
    expect(source).toContain('if (source._isDemo || source.id === "showcase-wedding") return null;');
  });

  it("verifies opaque studio-piece ownership on every event save", () => {
    const guard = read("src/lib/event-media-theft-guard.server.ts");
    const save = read("src/lib/events-sync.functions.ts");
    expect(guard).toContain("checkEventSoundPieceOwnership");
    expect(guard).toContain('from("sound_pieces")');
    expect(save).toContain("checkEventSoundPieceOwnership");
    expect(save).toContain('logDemoGuard("copy_blocked"');
  });

  it("guards every requested music generation entry point", () => {
    const source = read("src/lib/music-studio.functions.ts");
    expect(source.match(/assertNotDemo\("generate"\)/g)).toHaveLength(5);
  });

  it("blocks demo media uploads and prepared-sample downloads", () => {
    const uploads = read("src/lib/media-uploads.functions.ts");
    const print = read("src/routes/events.$eventId.index.tsx");
    expect(uploads).toContain('assertNotDemoCaller("generate"');
    expect(print).toContain("event._isDemo || isShowcaseEvent(eventId)");
  });

  it("shows a generic banner on every demo invitation", () => {
    const source = read("src/routes/invite.$eventId.tsx");
    expect(source).toContain("This is a demo, not a real invitation.");
    expect(source).toContain("event._isDemo");
  });
});