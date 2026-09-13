/**
 * The compose form must survive an empty brief.
 *
 * A field added as a required string, with the browser sending null when the
 * host left it alone, is what stopped Christopher composing on production:
 * every compose with no locked words was refused before it started. This test
 * submits the compose payload three ways (every optional field missing, then
 * explicitly undefined, then explicitly null) and asserts each one is accepted.
 * Any field added later that forgets nullability fails here first.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { lengthShape, settingsShape } from "@/lib/music-studio.functions";
import { dropNulls, nullSafe } from "@/lib/zod-nullsafe";

/** Every key the schema knows about, so new fields are covered automatically. */
function keysOf(shape: z.ZodObject<z.ZodRawShape>): string[] {
  return Object.keys(shape.shape);
}

const MINIMAL = { genre: "folk", mood: "warm", voice: "female", words: "" };

describe("compose accepts an empty brief", () => {
  const safe = nullSafe(settingsShape);

  it("accepts a payload with every optional field absent", () => {
    const out = safe.safeParse(MINIMAL);
    expect(out.success).toBe(true);
  });

  it("accepts every optional field explicitly undefined", () => {
    const payload: Record<string, unknown> = { ...MINIMAL };
    for (const k of keysOf(settingsShape)) if (!(k in payload)) payload[k] = undefined;
    const out = safe.safeParse(payload);
    expect(out.success).toBe(true);
  });

  it("accepts every optional field explicitly null", () => {
    const payload: Record<string, unknown> = { ...MINIMAL };
    for (const k of keysOf(settingsShape)) if (!(k in payload)) payload[k] = null;
    const out = safe.safeParse(payload);
    if (!out.success) throw new Error(JSON.stringify(out.error.issues));
    expect(out.success).toBe(true);
  });

  it("treats a null lock as nothing locked, not as a missing field", () => {
    const out = safe.parse({ ...MINIMAL, lockedLyrics: null });
    expect(out.lockedLyrics).toBe("");
  });

  it("keeps a real locked lyric untouched", () => {
    const out = safe.parse({ ...MINIMAL, lockedLyrics: "one line\ntwo line" });
    expect(out.lockedLyrics).toBe("one line\ntwo line");
  });

  it("accepts a saved brief that stored nulls for the fields left blank", () => {
    const saved = {
      ...MINIMAL,
      honoree: null,
      mustInclude: null,
      avoid: null,
      keyMoment: null,
      refrain: null,
      occasion: null,
      title: null,
      lockedLyrics: null,
      plan: null,
      remixOf: null,
      eventId: null,
      combineFrom: null,
    };
    const out = safe.safeParse(saved);
    if (!out.success) throw new Error(JSON.stringify(out.error.issues));
    expect(out.data.honoree).toBe("");
  });
});

describe("lengthening accepts an empty payload", () => {
  const safe = nullSafe(lengthShape);
  it("accepts nulls for every optional field", () => {
    const payload: Record<string, unknown> = { pieceId: "11111111-1111-1111-1111-111111111111", toSeconds: 120 };
    for (const k of keysOf(lengthShape)) if (!(k in payload)) payload[k] = null;
    const out = safe.safeParse(payload);
    if (!out.success) throw new Error(JSON.stringify(out.error.issues));
    expect(out.success).toBe(true);
  });
});

describe("dropNulls", () => {
  it("removes nulls at any depth without touching real values", () => {
    const out = dropNulls({ a: null, b: "x", c: { d: null, e: 0 }, f: [{ g: null, h: false }] }) as Record<
      string,
      unknown
    >;
    expect(out).toEqual({ b: "x", c: { e: 0 }, f: [{ h: false }] });
  });

  it("leaves a top-level null alone so required fields still fail loudly", () => {
    expect(dropNulls(null)).toBe(null);
    expect(dropNulls([null, 1])).toEqual([null, 1]);
  });
});
