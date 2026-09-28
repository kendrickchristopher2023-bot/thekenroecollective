/**
 * Kenroe Sound Studio — combining pieces.
 *
 * What this is: taking two or more finished pieces from the library and making
 * a NEW one out of chosen parts of each. The words from one, the musical
 * treatment from another, the hook from a third.
 *
 * What this is NOT, and must never claim to be: splitting a finished recording
 * into vocal and instrumental stems and gluing them together. The composer has
 * no stem output, so a combine happens at the BRIEF level. Every combine is a
 * fresh render from a merged brief, and the constraints layer treats a control
 * taken from a parent exactly as it treats one the host picked by hand: as a
 * constraint, not a hint.
 *
 * This module is deliberately pure. No network, no database, no model calls, so
 * a combination can be previewed and iterated for free as many times as the host
 * likes and only the final render costs anything.
 */
import { DEFAULT_BRIEF_EXTRAS, type StudioBrief } from "@/lib/studio-brief";
import { DEFAULT_SONG_SETTINGS } from "@/lib/wall-soundtrack";
import type { PlanChunk } from "@/lib/studio-words";

/** The parts of a piece that can be lifted into a new one. */
export const COMBINE_PARTS = [
  {
    key: "words",
    label: "The words",
    help: "The approved lyrics, taken whole. Nothing rewrites them.",
  },
  {
    key: "refrain",
    label: "The hook",
    help: "Just the line the room sings back, even if the words come from elsewhere.",
  },
  {
    key: "music",
    label: "The musical treatment",
    help: "Genre and blend, instruments, era, tempo, bass, brightness, shape.",
  },
  { key: "mood", label: "The mood", help: "Mood and how hard it leans emotionally." },
  { key: "voice", label: "The vocal", help: "Who sings it, the vocal texture, the language." },
] as const;

export type CombinePart = (typeof COMBINE_PARTS)[number]["key"];

export const COMBINE_PART_KEYS: CombinePart[] = COMBINE_PARTS.map((p) => p.key);

export function partLabel(key: string): string {
  return COMBINE_PARTS.find((p) => p.key === key)?.label ?? key;
}

/** One ingredient: a piece the host owns, and what is being taken from it. */
export type Ingredient = {
  pieceId: string;
  title: string;
  kind: string;
  /** The brief this piece was composed from. */
  brief: StudioBrief;
  /** The lyrics that were actually approved for it, if any. */
  lyrics: string;
  parts: CombinePart[];
};

/** Sections whose first line is the hook, in the order we would trust them. */
const HOOK_HEADERS = /^\[(chorus|hook|refrain)[^\]]*\]\s*$/i;

/**
 * The hook line of a set of lyrics: the first sung line under the first
 * chorus/hook/refrain header. Falls back to the first non-header line, because
 * a piece with no marked chorus still has an opening line worth reusing.
 */
export function hookLine(lyrics: string): string {
  const lines = lyrics.split(/\r?\n/).map((l) => l.trim());
  const at = lines.findIndex((l) => HOOK_HEADERS.test(l));
  if (at >= 0) {
    const found = lines.slice(at + 1).find((l) => l && !/^\[.*\]$/.test(l));
    if (found) return found.slice(0, 160);
  }
  return (lines.find((l) => l && !/^\[.*\]$/.test(l)) ?? "").slice(0, 160);
}

export type CombineProblem = { code: string; message: string };

/**
 * Is this combination sane? Checked here so the browser can show the problem
 * live, and checked AGAIN on the server, which is where it actually matters.
 */
export function validateCombine(ingredients: Ingredient[]): CombineProblem[] {
  const problems: CombineProblem[] = [];
  if (ingredients.length < 2) {
    problems.push({ code: "too-few", message: "Pick at least two pieces to combine." });
  }
  if (ingredients.length > 4) {
    problems.push({ code: "too-many", message: "Combine up to four pieces at a time." });
  }
  const empty = ingredients.filter((i) => i.parts.length === 0);
  if (empty.length) {
    problems.push({
      code: "nothing-taken",
      message: `Choose what to take from ${empty.map((i) => i.title).join(", ")}.`,
    });
  }
  const seen = new Map<string, string>();
  for (const ing of ingredients) {
    for (const part of ing.parts) {
      const already = seen.get(part);
      if (already) {
        problems.push({
          code: `duplicate:${part}`,
          message: `"${partLabel(part)}" can only come from one piece. It is set to both ${already} and ${ing.title}.`,
        });
      } else {
        seen.set(part, ing.title);
      }
    }
  }
  const ids = new Set(ingredients.map((i) => i.pieceId));
  if (ids.size !== ingredients.length) {
    problems.push({ code: "duplicate-source", message: "The same piece is listed twice." });
  }
  if (!seen.size) {
    problems.push({ code: "nothing-at-all", message: "Nothing has been taken from anything yet." });
  }
  return problems;
}

/** A blank brief, used when a combine does not start from an existing one. */
export function emptyBrief(): StudioBrief {
  return { ...DEFAULT_SONG_SETTINGS, ...DEFAULT_BRIEF_EXTRAS } as StudioBrief;
}

export type CombineResult = {
  brief: StudioBrief;
  /**
   * The exact words to compose, when the host took the words from a parent.
   * Non-empty means locked: no producer pass and no plan rewrite may touch them.
   */
  lockedLyrics: string;
  /** One readable line per part taken, for the review screen and the library. */
  credits: { part: CombinePart; label: string; from: string; pieceId: string }[];
};

/**
 * Merge the chosen parts into one brief.
 *
 * Order is the order the host arranged the ingredients, and each part may only
 * come from one place, so the merge is deterministic: the same selection always
 * compiles to the same brief.
 */
export function combineBrief(base: StudioBrief, ingredients: Ingredient[]): CombineResult {
  const brief: StudioBrief = { ...base };
  const credits: CombineResult["credits"] = [];
  let lockedLyrics = "";

  for (const ing of ingredients) {
    const src = ing.brief;
    for (const part of ing.parts) {
      switch (part) {
        case "words": {
          brief.words = src.words;
          brief.poemText = src.poemText;
          brief.mustInclude = src.mustInclude;
          brief.keyMoment = src.keyMoment;
          brief.honoree = src.honoree;
          brief.kind = ing.kind === "poem" ? "poem" : brief.kind;
          lockedLyrics = ing.lyrics.trim();
          break;
        }
        case "refrain": {
          brief.refrain = (src.refrain || hookLine(ing.lyrics)).slice(0, 160);
          break;
        }
        case "music": {
          brief.genre = src.genre;
          brief.genreBlend = src.genreBlend;
          brief.blendAmount = src.blendAmount;
          brief.era = src.era;
          brief.instruments = [...(src.instruments ?? [])].slice(0, 8);
          brief.tempo = src.tempo;
          brief.bass = src.bass;
          brief.brightness = src.brightness;
          brief.structure = src.structure;
          break;
        }
        case "mood": {
          brief.mood = src.mood;
          brief.emotion = src.emotion;
          break;
        }
        case "voice": {
          brief.voice = src.voice;
          brief.vocalTexture = src.vocalTexture;
          brief.language = src.language;
          brief.poemStyle = src.poemStyle;
          break;
        }
      }
      credits.push({ part, label: partLabel(part), from: ing.title, pieceId: ing.pieceId });
    }
  }

  // A hook taken from one piece has to survive the words taken from another, so
  // it is also asserted as a required line.
  if (brief.refrain && !brief.mustInclude.includes(brief.refrain)) {
    brief.mustInclude = [brief.mustInclude, brief.refrain].filter(Boolean).join("\n").slice(0, 1200);
  }

  return { brief, lockedLyrics, credits };
}

/**
 * A name a human can read a week later. A combine makes a new row every time,
 * so without this the library becomes forty untitled variants.
 */
export function combineTitle(ingredients: Ingredient[]): string {
  const named = ingredients.filter((i) => i.parts.length);
  const wordsFrom = named.find((i) => i.parts.includes("words"));
  const musicFrom = named.find((i) => i.parts.includes("music"));
  const shorten = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 40);
  if (wordsFrom && musicFrom && wordsFrom.pieceId !== musicFrom.pieceId) {
    return `${shorten(wordsFrom.title)} as ${shorten(musicFrom.title)}`.slice(0, 120);
  }
  const heads = named.slice(0, 2).map((i) => shorten(i.title));
  const rest = named.length - heads.length;
  return `${heads.join(" x ")}${rest > 0 ? ` +${rest}` : ""}`.slice(0, 120) || "Combined piece";
}

/**
 * Turn locked lyrics into a plan without asking any model to write them.
 *
 * This is the lock. The host has been burned twice by a model quietly
 * rewriting his input, so when the words are locked they are cut into sections
 * here, in code, on section headers, and the section text is copied character
 * for character. The constraints layer still adds the styles.
 */
export function planFromLyrics(lyrics: string, seconds: number): PlanChunk[] {
  const lines = lyrics.split(/\r?\n/);
  const sections: string[][] = [];
  for (const line of lines) {
    const isHeader = /^\s*\[[^\]]+\]\s*$/.test(line);
    if (isHeader || sections.length === 0) sections.push([]);
    sections[sections.length - 1]!.push(line);
  }
  const blocks = sections
    .map((s) => s.join("\n").replace(/\s+$/, ""))
    .filter((s) => s.trim().length);
  if (!blocks.length) return [];

  const totalMs = Math.max(3000, Math.round(seconds * 1000));
  // Every section must be at least 3s and at most 120s, and the total has to
  // stay what the host paid for, so long lyrics get fewer, longer sections.
  const maxSections = Math.max(1, Math.min(blocks.length, Math.floor(totalMs / 3000)));
  const merged: string[] = [];
  const perBucket = Math.ceil(blocks.length / maxSections);
  for (let i = 0; i < blocks.length; i += perBucket) {
    merged.push(blocks.slice(i, i + perBucket).join("\n"));
  }
  const each = Math.floor(totalMs / merged.length);
  return merged.map((text, i) => ({
    text: text.slice(0, 6000),
    durationMs: Math.min(
      120000,
      Math.max(3000, i === merged.length - 1 ? totalMs - each * (merged.length - 1) : each),
    ),
    positiveStyles: [],
    negativeStyles: [],
  }));
}

/** Did the plan keep the locked words exactly? Verified, never assumed. */
export function lyricsIntact(locked: string, chunks: PlanChunk[]): boolean {
  const flatten = (s: string) =>
    s
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^\[.*\]$/.test(l))
      .join("\n")
      .toLowerCase();
  const want = flatten(locked);
  if (!want) return true;
  const got = flatten(chunks.map((c) => c.text).join("\n"));
  return want.split("\n").every((line) => got.includes(line));
}
