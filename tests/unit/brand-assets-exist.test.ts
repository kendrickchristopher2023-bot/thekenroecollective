/**
 * A logo page that lists a file nobody can download is worse than no page at
 * all: the file is promised to a printer and is not there. Every asset on the
 * list is checked here for real bytes that decode, not for a link that exists.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BRAND_ASSETS, PUBLIC_BRAND_FILES } from "@/lib/brand-assets";

// Master copies of the pack live outside public/ (they are served to owners
// from private storage). Only the files the public site itself uses stay in
// public/brand.
const PRIVATE_DIR = join(process.cwd(), "brand-kit", "private");
const PUBLIC_DIR = join(process.cwd(), "public", "brand");
const isPublic = (file: string) => (PUBLIC_BRAND_FILES as readonly string[]).includes(file);
const DIR_FOR = (file: string) => (isPublic(file) ? PUBLIC_DIR : PRIVATE_DIR);

/** Width and height straight out of the file header, so a truncated file fails. */
function pngSize(b: Buffer): { width: number; height: number } {
  expect(b.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** Dots per inch as a printer's software reads it, from the pHYs chunk. */
function pngDpi(b: Buffer): number | null {
  let i = 8;
  while (i < b.length - 8) {
    const len = b.readUInt32BE(i);
    const type = b.subarray(i + 4, i + 8).toString("ascii");
    if (type === "pHYs") {
      const perMetre = b.readUInt32BE(i + 8);
      const unit = b[i + 16];
      if (unit !== 1) return null;
      return Math.round(perMetre * 0.0254);
    }
    i += 12 + len;
  }
  return null;
}

describe("brand assets on the logo page", () => {
  it("lists at least the full pack", () => {
    expect(BRAND_ASSETS.length).toBeGreaterThanOrEqual(15);
  });

  for (const asset of BRAND_ASSETS) {
    it(`${asset.file} exists and decodes`, () => {
      const path = join(DIR_FOR(asset.file), asset.file);
      expect(existsSync(path), `${asset.file} is listed on the logo page but the file is not there`).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.length, `${asset.file} is empty`).toBeGreaterThan(512);

      if (asset.file.endsWith(".svg")) {
        const text = bytes.toString("utf8");
        expect(text, `${asset.file} is not vector artwork`).toContain("<svg");
        expect(text).toContain("</svg>");
        // A vector with no drawing in it would print a blank card.
        expect(/<(path|rect|circle|polygon|text|g)\b/.test(text), `${asset.file} has no artwork in it`).toBe(true);
        return;
      }

      const { width, height } = pngSize(bytes);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);

      // The size written on the page has to be the size in the file.
      const stated = asset.dimensions.match(/(\d+)\s*x\s*(\d+)/);
      if (stated) {
        expect(`${width}x${height}`).toBe(`${stated[1]}x${stated[2]}`);
      }

      // A file named 300 dots per inch must actually say so, or a printer
      // treats it as a screen image and prints it four times too large.
      if (asset.file.includes("300dpi")) {
        expect(pngDpi(bytes), `${asset.file} does not carry 300 dots per inch`).toBe(300);
      }
    });
  }

  it("only the files the public site uses are still public", () => {
    for (const asset of BRAND_ASSETS) {
      if (isPublic(asset.file)) continue;
      expect(
        existsSync(join(PUBLIC_DIR, asset.file)),
        `${asset.file} is owner-only but is still being served from public/brand`,
      ).toBe(false);
    }
    for (const file of PUBLIC_BRAND_FILES) {
      expect(existsSync(join(PUBLIC_DIR, file)), `${file} is used by the public site and must stay public`).toBe(true);
    }
  });

  it("the printed scan codes are on the list", () => {
    const files = BRAND_ASSETS.map((a) => a.file);
    for (const slug of ["christopher", "adrian"]) {
      expect(files).toContain(`kenroe-card-qr-${slug}.svg`);
      expect(files).toContain(`kenroe-card-qr-${slug}-900px-300dpi.png`);
    }
  });
});
