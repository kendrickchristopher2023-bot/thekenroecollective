import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF_EXTRAS, type StudioBrief } from "@/lib/studio-brief";
import { DEFAULT_SONG_SETTINGS } from "@/lib/wall-soundtrack";
import {
  compileSectionedPrompt,
  conflictNotes,
  extractMustInclude,
  planToText,
  positivise,
  requiredPhrases,
  splitBriefText,
  textToPlan,
  themeLeaks,
  verifyLyrics,
} from "@/lib/studio-words";

/** Christopher's exact brief, the one that came back about surviving. */
const BONFIRE_WORDS =
  "Please get this right on the first try. I need a beautiful but soulful song with a guitar and the sound of fire crackling in the background with words specifically in the song referencing about the bonfire, smores, and chili. This is an event happening this fall. DOn't reference the Kendrick name more than once. I need this to be a banger that people will remember and want to download.";

const brief = (over: Partial<StudioBrief> = {}): StudioBrief =>
  ({
    ...DEFAULT_SONG_SETTINGS,
    ...DEFAULT_BRIEF_EXTRAS,
    genre: "jazz",
    mood: "joyful",
    voice: "female lead",
    genreBlend: "soul",
    era: "1990s radio",
    instruments: ["acoustic guitar"],
    words: BONFIRE_WORDS,
    ...over,
  }) as StudioBrief;

describe("splitBriefText", () => {
  const split = splitBriefText(BONFIRE_WORDS);

  it("discards the meta-instruction instead of singing it", () => {
    expect(split.discarded.join(" ")).toMatch(/get this right/i);
    expect(split.discarded.join(" ")).toMatch(/banger/i);
    expect(split.subject).not.toMatch(/banger/i);
    expect(split.subject).not.toMatch(/first try/i);
    expect(split.subject).not.toMatch(/download/i);
  });

  it("lifts the content words out of the paragraph", () => {
    expect(split.mustInclude.map((m) => m.toLowerCase())).toEqual(
      expect.arrayContaining(["bonfire", "smores", "chili"]),
    );
  });

  it("routes the sound notes to production", () => {
    expect(split.production.join(" ")).toMatch(/guitar/i);
    expect(split.soundDesign.join(" ")).toMatch(/crackling/i);
  });

  it("keeps the real context", () => {
    expect(split.subject).toMatch(/this fall/i);
  });

  it("converts the negation to a positive plus a negative style", () => {
    expect(split.positives.join(" ")).toMatch(/exactly once/i);
    expect(split.negatives.join(" ")).toMatch(/kendrick/i);
    expect(split.subject).not.toMatch(/don'?t/i);
  });
});

describe("positivise", () => {
  it("handles more-than-once", () => {
    const { positive, negative } = positivise("DOn't reference the Kendrick name more than once.");
    expect(positive).toMatch(/exactly once/i);
    expect(negative).toMatch(/more than once/i);
  });
  it("handles a plain avoidance", () => {
    const { positive, negative } = positivise("Never mention divorce");
    expect(positive).toMatch(/clear of divorce/i);
    expect(negative).toBe("divorce");
  });
});

describe("extractMustInclude", () => {
  it("picks up quoted lines", () => {
    expect(extractMustInclude('Use the line "we still gather here" in the chorus')).toContain(
      "we still gather here",
    );
  });
});

describe("compileSectionedPrompt", () => {
  const split = splitBriefText(BONFIRE_WORDS);
  const prompt = compileSectionedPrompt({
    brief: brief(),
    split,
    occasion: "2026 Bonfire",
    use: "studio",
    production: "Mid-tempo jazz with a soul thread, acoustic guitar forward.",
    seconds: 120,
  });

  it("puts the subject and required words above the production direction", () => {
    expect(prompt.indexOf("SUBJECT OF THE WORDS")).toBeLessThan(prompt.indexOf("PRODUCTION:"));
    expect(prompt.indexOf("MUST APPEAR")).toBeLessThan(prompt.indexOf("PRODUCTION:"));
    expect(prompt).toMatch(/- bonfire/i);
    expect(prompt).toMatch(/- smores/i);
    expect(prompt).toMatch(/- chili/i);
  });

  it("never appends the slideshow tail to a studio piece", () => {
    expect(prompt).not.toMatch(/loopable/i);
    expect(prompt).toMatch(/download and keep/i);
  });

  it("keeps the slideshow tail for a wall piece", () => {
    const wall = compileSectionedPrompt({
      brief: brief(),
      split,
      use: "wall",
      production: "steady",
      seconds: 60,
    });
    expect(wall).toMatch(/loopable/i);
  });

  it("carries no meta-instruction through", () => {
    expect(prompt).not.toMatch(/banger|first try|want to download/i);
  });
});

describe("verifyLyrics", () => {
  const required = requiredPhrases(brief(), splitBriefText(BONFIRE_WORDS));
  it("matches across apostrophes and case", () => {
    const { missing, present } = verifyLyrics(
      "Round the Bonfire light\nS'mores and a pot of CHILI",
      required,
    );
    expect(present.map((p) => p.toLowerCase())).toEqual(
      expect.arrayContaining(["bonfire", "smores", "chili"]),
    );
    expect(missing).toHaveLength(0);
  });
  it("reports what is missing", () => {
    const { missing } = verifyLyrics("A song about surviving the year", required);
    expect(missing.map((m) => m.toLowerCase())).toEqual(
      expect.arrayContaining(["bonfire", "smores", "chili"]),
    );
  });
});

describe("themeLeaks", () => {
  it("flags a banned subject that turned up anyway", () => {
    expect(themeLeaks("we keep surviving", ["surviving"])).toContain("surviving");
    expect(themeLeaks("round the fire", ["surviving"])).toHaveLength(0);
  });
});

describe("conflictNotes", () => {
  it("surfaces a typed style that fights the dropdown", () => {
    const notes = conflictNotes(brief({ genreBlend: "" }), splitBriefText(BONFIRE_WORDS));
    expect(notes.join(" ")).toMatch(/soulful|soul/i);
  });
});

describe("plan round-trip", () => {
  const chunks = [
    { text: "[Verse 1]\nline one", durationMs: 30000, positiveStyles: ["jazz"], negativeStyles: [] },
    { text: "[Chorus]\nline two", durationMs: 30000, positiveStyles: ["big"], negativeStyles: [] },
  ];
  it("survives an edit with timings and styles intact", () => {
    const edited = planToText(chunks).replace("line two", "round the bonfire");
    const back = textToPlan(edited, chunks);
    expect(back).toHaveLength(2);
    expect(back[1]!.text).toMatch(/bonfire/);
    expect(back[1]!.durationMs).toBe(30000);
    expect(back[0]!.positiveStyles).toEqual(["jazz"]);
  });
  it("redistributes time when the host adds a section", () => {
    const back = textToPlan(`${planToText(chunks)}\n\n[Outro]\nlast`, chunks);
    expect(back).toHaveLength(3);
    expect(back.reduce((n, c) => n + c.durationMs, 0)).toBeLessThanOrEqual(60000 + 3);
  });
});
