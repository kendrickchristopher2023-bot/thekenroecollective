/**
 * Combining pieces: what is taken from where, the naming, and the lock.
 *
 * These cover the merge and the lock in code. What they do NOT cover is the
 * server guardrail that keeps uploaded music out of a combine, which lives in
 * loadIngredients and needs a database.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SONG_SETTINGS } from "@/lib/wall-soundtrack";
import { briefFrom } from "@/lib/studio-brief";
import {
  type Ingredient,
  combineBrief,
  combineTitle,
  hookLine,
  lyricsIntact,
  planFromLyrics,
  validateCombine,
} from "@/lib/studio-combine";

function ingredient(
  title: string,
  over: Record<string, unknown>,
  parts: Ingredient["parts"],
  lyrics = "",
): Ingredient {
  return {
    pieceId: `00000000-0000-0000-0000-${title.length.toString().padStart(12, "0")}`,
    title,
    kind: "song",
    brief: briefFrom(DEFAULT_SONG_SETTINGS, over as never),
    lyrics,
    parts,
  };
}

describe("combining pieces", () => {
  it("takes the words from one piece and the musical treatment from another", () => {
    const words = ingredient(
      "Bonfire words",
      { words: "smores, chili, the fire on the ridge" },
      ["words"],
      "[Verse] smores and chili\n[Chorus] the fire on the ridge",
    );
    const music = ingredient("Soul treatment", { genre: "Soul", era: "1970s" }, ["music"]);

    const out = combineBrief(briefFrom(DEFAULT_SONG_SETTINGS, {}), [words, music]);

    expect(out.brief.words).toContain("smores");
    expect(out.brief.genre).toBe("Soul");
    expect(out.brief.era).toBe("1970s");
    // Words taken whole are locked by definition.
    expect(out.lockedLyrics).toContain("the fire on the ridge");
    expect(out.credits.map((c) => c.part)).toEqual(["words", "music"]);
    expect(out.credits[0].from).toBe("Bonfire words");
  });

  it("takes the hook from a third piece without taking its words", () => {
    const words = ingredient("Words", { words: "grandma's kitchen" }, ["words"], "[Verse] one two");
    const hook = ingredient("Hook", {}, ["refrain"], "[Chorus] we still set her a place\nwe still do");

    const out = combineBrief(briefFrom(DEFAULT_SONG_SETTINGS, {}), [words, hook]);

    expect(out.brief.refrain).toContain("we still set her a place");
    expect(out.brief.words).toContain("grandma");
  });

  it("refuses one piece, and refuses the same part taken twice", () => {
    const a = ingredient("A", {}, ["music"]);
    const b = ingredient("Bee", {}, ["music"]);

    expect(validateCombine([a]).length).toBeGreaterThan(0);
    // The same part taken from two pieces is refused, whatever the wording.
    expect(validateCombine([a, b]).length).toBeGreaterThan(0);
  });

  it("names a combined piece from its ingredients", () => {
    const a = ingredient("Bonfire words", {}, ["words"]);
    const b = ingredient("Soul treatment", {}, ["music"]);
    const name = combineTitle([a, b]);
    expect(name).toContain("Bonfire words");
    expect(name.length).toBeLessThanOrEqual(120);
  });

  it("keeps locked words character for character through the plan", () => {
    const locked = "[Verse]\nwe had to bury him too soon\n[Chorus]\nbut the fire still burns";
    const plan = planFromLyrics(locked, 120);
    expect(plan.length).toBeGreaterThan(0);
    expect(lyricsIntact(locked, plan)).toBe(true);
  });

  it("reports a locked line that did not survive", () => {
    const locked = "[Chorus]\nwe still set her a place";
    const plan = planFromLyrics(locked, 60).map((c) => ({ ...c, text: "something else entirely" }));
    expect(lyricsIntact(locked, plan)).toBe(false);
  });

  it("reads a hook out of lyrics", () => {
    expect(hookLine("[Verse]\nfirst line\n[Chorus]\nthe hook itself\nmore")).toBe("the hook itself");
  });
});
