// The Sound Studio is in private preview: only owners may compose, write,
// preview or buy. These tests pin the rule itself and the fact that every
// spending entry point in both studio files goes through it.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { studioAllowed } from "@/lib/studio-gate";

const music = readFileSync("src/lib/music-studio.functions.ts", "utf8");
const letters = readFileSync("src/lib/studio-letters.functions.ts", "utf8");

/** Body of one exported server function, up to the next export. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export const ${name} = createServerFn`);
  if (start < 0) throw new Error(`${name} is not exported`);
  const rest = src.slice(start + 10);
  const next = rest.search(/\nexport /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("studio access rule", () => {
  it("lets owners in whether or not the studio is public", () => {
    expect(studioAllowed({ isOwner: true, publicOpen: false })).toBe(true);
    expect(studioAllowed({ isOwner: true, publicOpen: true })).toBe(true);
  });
  it("refuses everyone else while the studio is private", () => {
    expect(studioAllowed({ isOwner: false, publicOpen: false })).toBe(false);
  });
  it("only opens to non-owners when an owner has flipped the public switch", () => {
    expect(studioAllowed({ isOwner: false, publicOpen: true })).toBe(true);
  });
  it("ships with the public switch off", () => {
    const migrations = readFileSync(
      "supabase/migrations/20260902220624_44bcc4af-ccf7-43b1-80b0-a81f8a2e0c89.sql",
      "utf8",
    );
    expect(migrations).toMatch(/music_studio_public BOOLEAN NOT NULL DEFAULT false/);
  });
});

describe("every spending entry point runs the gate", () => {
  const musicGated = ["studioWords", "studioCompose", "studioWrite", "lengthPreview", "lengthCompose", "startPiecePurchase"];
  for (const name of musicGated) {
    it(`${name} calls assertStudioAccess behind requireSupabaseAuth`, () => {
      const body = fnBody(music, name);
      expect(body).toContain("requireSupabaseAuth");
      expect(body).toContain("assertStudioAccess(");
    });
  }
  for (const name of ["letterWrite", "letterCompose"]) {
    it(`${name} calls assertAccess behind requireSupabaseAuth`, () => {
      const body = fnBody(letters, name);
      expect(body).toContain("requireSupabaseAuth");
      expect(body).toContain("assertAccess(");
    });
  }
  it("both gates decide through the shared studioAllowed rule", () => {
    expect(music).toMatch(/studioAllowed\(\{ isOwner: false, publicOpen: await isStudioPublic\(\) \}\)/);
    expect(letters).toMatch(/studioAllowed\(\{ isOwner: false, publicOpen \}\)/);
  });
  it("owner-only administration uses assertOwner, never the public switch", () => {
    for (const name of ["listPiecesForModeration", "soundSalesReport", "listConciergeRequests", "updateConciergeRequest"]) {
      expect(fnBody(music, name)).toContain("assertOwner(");
    }
  });
  it("studioAccess (the UI probe) reports owners or the public switch, nothing else", () => {
    const body = fnBody(music, "studioAccess");
    expect(body).toContain("isOwnerRole(");
    expect(body).toContain("isStudioPublic(");
  });
});
