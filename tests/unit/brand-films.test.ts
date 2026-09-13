/**
 * The Brand page lists six film cuts and six contact sheets. A card with a
 * dead link is the failure mode that matters here: an owner clicks it, nothing
 * plays, and the rough cut looks broken rather than unfinished. So the metadata
 * list is checked against the real files on disk, and the page code is checked
 * for the owner-only signed link shape rather than a public path.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BRAND_FILMS } from "@/lib/brand-assets";

const DELIVERABLES = "/mnt/documents/films/deliverables";

describe("brand film metadata", () => {
  it("lists three films in both shapes, six cuts in total", () => {
    expect(BRAND_FILMS).toHaveLength(6);
    const films = new Set(BRAND_FILMS.map((f) => f.film));
    expect([...films].sort()).toEqual(["Application Kit", "Celebrations", "The Workroom"]);
    for (const film of films) {
      const shapes = BRAND_FILMS.filter((f) => f.film === film).map((f) => f.shape).sort();
      expect(shapes).toEqual(["Upright (9:16)", "Wide (16:9)"]);
    }
  });

  it("keeps every path inside the private films folder, never public", () => {
    for (const f of BRAND_FILMS) {
      expect(f.file.startsWith("films/")).toBe(true);
      expect(f.sheet.startsWith("films/contact-sheets/")).toBe(true);
      expect(f.file.endsWith(".mp4")).toBe(true);
      expect(f.sheet.endsWith(".jpg")).toBe(true);
      expect(f.file).not.toContain("public");
    }
  });

  it("pairs each cut with the contact sheet of the same name", () => {
    for (const f of BRAND_FILMS) {
      const cut = f.file.replace("films/", "").replace(".mp4", "");
      expect(f.sheet).toBe(`films/contact-sheets/${cut}.jpg`);
    }
  });

  it("names no file twice", () => {
    const all = BRAND_FILMS.flatMap((f) => [f.file, f.sheet]);
    expect(new Set(all).size).toBe(all.length);
  });

  it("matches the rendered files that were uploaded", () => {
    if (!existsSync(DELIVERABLES)) return; // masters are not kept in the repo
    for (const f of BRAND_FILMS) {
      const name = f.file.split("/").pop()!;
      const path = join(DELIVERABLES, name);
      expect(existsSync(path), `${name} missing`).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(100_000);
    }
  });
});

describe("brand films are owners only", () => {
  const page = readFileSync("src/routes/_authenticated/brand.tsx", "utf8");
  const server = readFileSync("src/lib/brand-kit.server.ts", "utf8");

  it("renders cuts only from the short-lived signed links in the loader data", () => {
    expect(page).toContain('id="films"');
    expect(page).toContain("films[f.file]");
    // No hardcoded public URL or /public path for a film anywhere on the page.
    expect(page).not.toMatch(/src=\{?["'][^"']*films\//);
  });

  it("signs film links from the private bucket with the same short life", () => {
    expect(server).toContain("signedBrandFilmUrls");
    const fn = server.slice(server.indexOf("signedBrandFilmUrls"));
    expect(fn).toContain("BRAND_KIT_BUCKET");
    expect(fn).toContain("BRAND_LINK_TTL_SECONDS");
  });

  it("keeps films out of the logo pack zip", () => {
    expect(server.slice(server.indexOf("brandKitZip"))).not.toContain("BRAND_FILMS");
  });
});
