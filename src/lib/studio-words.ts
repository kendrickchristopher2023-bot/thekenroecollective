/**
 * Kenroe Sound Studio — words before audio.
 *
 * A paid compose that ignores what the host asked for is the most expensive
 * failure this product has, so the free text box can no longer be handed to a
 * music model as one undifferentiated clause. Everything in here is pure and
 * deterministic on purpose: the same typing always splits the same way, the
 * split can be shown to the host before a single credit is spent, and the
 * pipeline still works when the AI producer pass is unavailable.
 *
 * Three jobs:
 *  1. Split what the host typed into lyrical content, production direction and
 *     meta-instruction ("please get this right"), and throw the meta away
 *     rather than letting a music model read effort and striving as the SUBJECT.
 *  2. Turn "don't mention X" into a positive instruction plus an explicit
 *     negative style, because naming a thing in a negative raises its salience.
 *  3. Check the finished words against everything that had to be in them, so a
 *     miss is caught before the audio is paid for, not after.
 */
import { ALL_GENRES, INSTRUMENTS, mustIncludeLines, type StudioBrief } from "@/lib/studio-brief";

/** How much a host may type about their piece. Never truncated silently. */
export const WORDS_MAX = 2000;

/** Below this brief strength a paid compose asks for confirmation first. */
export const WEAK_BRIEF_SCORE = 3;

/**
 * The composer is a music model, not a sound-effects engine. It can imply a
 * texture but it cannot be relied on to place a literal recorded sound, so we
 * say that in the UI instead of dropping the request in silence.
 */
export const SOUND_DESIGN_NOTE =
  "Sound effects are suggested to the composer, not guaranteed. A music model can imply a crackle or a room, it cannot place a recorded sound effect on cue.";

const SFX_WORDS = [
  "crackling",
  "crackle",
  "fireworks",
  "rain",
  "thunder",
  "waves",
  "birds",
  "traffic",
  "applause",
  "sound of",
  "sound effect",
  "sfx",
];

/** Phrases that are the host talking to us, not the song's subject. */
const META_PATTERNS: RegExp[] = [
  /\bplease\b/i,
  /\bget (this|it) right\b/i,
  /\bfirst try\b/i,
  /\bbanger\b/i,
  /\b(people|everyone|they) will (remember|love|want)\b/i,
  /\bwant to download\b/i,
  /\bdownloadable\b/i,
  /\bmake sure you\b/i,
  /\bdon'?t mess (this|it) up\b/i,
  /\bi need this to be\b/i,
  /\bthis needs to be (a|the) (banger|hit|best)\b/i,
  /\bthank you\b/i,
  /\bhope (this|you)\b/i,
  /\btry again\b/i,
  /\blast time\b/i,
  /\bas soon as possible\b/i,
  /\bhigh quality\b/i,
  /\bmemorable\b/i,
  /\betc\.?\b/i,
];

/** Vocabulary that means "how it should sound", not "what it is about". */
const PRODUCTION_WORDS = [
  "tempo",
  "bpm",
  "bass",
  "drums",
  "drum",
  "guitar",
  "piano",
  "organ",
  "strings",
  "horns",
  "saxophone",
  "choir",
  "harmony",
  "harmonies",
  "vocal",
  "vocals",
  "acapella",
  "a cappella",
  "mix",
  "mixed",
  "groove",
  "beat",
  "melody",
  "chorus",
  "verse",
  "bridge",
  "hook",
  "key",
  "minor",
  "major",
  "soulful",
  "upbeat",
  "slow",
  "fast",
  "loud",
  "quiet",
  "background",
  ...SFX_WORDS,
];

const NEGATION_START = /^(?:don'?t|do not|dont|never|avoid|no|without|not)\b\s*/i;
const NEGATION_ANY = /\b(?:don'?t|do not|dont|never|avoid|without)\b/i;

export type BriefSplit = {
  /** What the piece is actually about, meta-instruction removed. */
  subject: string;
  /** Words and phrases that must appear in the finished words. */
  mustInclude: string[];
  /** Positive rewrites of everything the host asked to keep out. */
  positives: string[];
  /** The same constraints as negative styles for the composer. */
  negatives: string[];
  /** How it should sound, pulled out of the paragraph. */
  production: string[];
  /** What we removed, shown to the host so nothing vanishes quietly. */
  discarded: string[];
  /** Sound-design requests we can only suggest. */
  soundDesign: string[];
};

export const EMPTY_SPLIT: BriefSplit = {
  subject: "",
  mustInclude: [],
  positives: [],
  negatives: [],
  production: [],
  discarded: [],
  soundDesign: [],
};

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

/** Comparable form: case, punctuation and spacing all flattened. */
export function normaliseWords(text: string): string {
  return text
    .toLowerCase()
    // Apostrophes vanish rather than splitting a word, so s'mores matches smores.
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull the things the host said must be in the song out of a sentence like
 * "with words specifically in the song referencing about the bonfire, smores,
 * and chili". This is the field that carried the whole point of the piece.
 */
export function extractMustInclude(text: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\b(?:referenc\w*|mention\w*|includ\w*|nam\w*|shout\w* out)\s+(?:to\s+)?(?:about\s+)?(?:the\s+)?([^.;!?]+)/gi,
    /\b(?:sings?|singing|song|words|lyrics)\s+about\s+(?:the\s+)?([^.;!?]+)/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const clause = (m[1] ?? "").trim();
      if (!clause || NEGATION_ANY.test(m[0])) continue;
      for (const piece of clause.split(/,| and | & |\//i)) {
        const word = piece
          .replace(/^(the|a|an|our|my|his|her|their)\s+/i, "")
          .replace(/[^\w\s'’-]/g, "")
          .trim();
        if (word.length >= 3 && word.split(/\s+/).length <= 4 && !META_PATTERNS.some((p) => p.test(word))) {
          found.push(word);
        }
      }
    }
  }
  // Anything the host put in quotes is a line they want sung as written.
  for (const m of text.matchAll(/["“']([^"”']{3,80})["”']/g)) found.push(m[1]!.trim());
  return dedupe(found).slice(0, 12);
}

/**
 * Turn one negative instruction into the positive form a model follows, plus
 * the plain constraint for the negative-styles field.
 */
export function positivise(sentence: string): { positive: string; negative: string } {
  const clean = sentence.trim().replace(/[.!?]+$/, "");
  const once = clean.match(/^(?:don'?t|do not|dont|never|avoid)\s+(?:referenc\w*|mention\w*|say\w*|use|repeat)\s+(?:to\s+)?(.+?)\s+more than (?:once|one time|1 time)$/i);
  if (once) {
    // "the Kendrick name" is the host talking about a word, not a lyric, so the
    // trailing noun goes: quoting it verbatim once got "Kendrick name" sung.
    const subject = once[1]!
      .replace(/^(the|a|an)\s+/i, "")
      .replace(/\s+(name|word|surname|nickname)$/i, "")
      .trim();
    return {
      positive: `Use the word ${subject} exactly once in the whole piece, and never again.`,
      negative: `saying ${subject} more than once`,
    };
  }
  const stripped = clean.replace(NEGATION_START, "").replace(/^(?:referenc\w*|mention\w*|say\w*|use|include)\s+/i, "").trim();
  const subject = stripped || clean;
  return {
    positive: `Keep the words clear of ${subject}.`,
    negative: subject,
  };
}

/**
 * The whole point of this module: what the host typed, sorted into the buckets
 * the composer needs, with meta-instruction discarded rather than sung.
 */
export function splitBriefText(words: string): BriefSplit {
  const text = words.trim();
  if (!text) return { ...EMPTY_SPLIT };
  const subject: string[] = [];
  const production: string[] = [];
  const discarded: string[] = [];
  const positives: string[] = [];
  const negatives: string[] = [];
  const mustInclude: string[] = [];
  const soundDesign: string[] = [];

  for (const sentence of sentences(text)) {
    const lower = sentence.toLowerCase();
    if (META_PATTERNS.some((p) => p.test(sentence))) {
      discarded.push(sentence);
      continue;
    }
    for (const sfx of SFX_WORDS) if (lower.includes(sfx)) soundDesign.push(sentence);

    const musts = extractMustInclude(sentence);
    mustInclude.push(...musts);

    if (NEGATION_START.test(sentence)) {
      const { positive, negative } = positivise(sentence);
      positives.push(positive);
      negatives.push(negative);
      continue;
    }

    const hasProduction = PRODUCTION_WORDS.some((w) => lower.includes(w));
    if (hasProduction) production.push(sentence);
    if (!hasProduction || musts.length) subject.push(sentence);
  }

  return {
    subject: dedupe(subject).join(" ").trim(),
    mustInclude: dedupe(mustInclude),
    positives: dedupe(positives),
    negatives: dedupe(negatives),
    production: dedupe(production),
    discarded: dedupe(discarded),
    soundDesign: dedupe(soundDesign),
  };
}

/** Everything that has to appear in the finished words, from every field. */
export function requiredPhrases(brief: StudioBrief, split: BriefSplit): string[] {
  const list = [
    ...mustIncludeLines(brief.mustInclude),
    ...split.mustInclude,
    ...(brief.refrain.trim() ? [brief.refrain.trim()] : []),
    ...(brief.honoree.trim() ? [brief.honoree.trim().replace(/\s*\([^)]*\)\s*/g, " ").trim()] : []),
  ];
  return dedupe(list).slice(0, 16);
}

/** Which required phrases actually made it into the words. */
export function verifyLyrics(
  lyrics: string,
  required: string[],
): { missing: string[]; present: string[] } {
  const hay = normaliseWords(lyrics);
  const missing: string[] = [];
  const present: string[] = [];
  for (const phrase of required) {
    const needle = normaliseWords(phrase);
    if (!needle) continue;
    (hay.includes(needle) ? present : missing).push(phrase);
  }
  return { missing, present };
}

/** Anything the host asked to keep out that turned up anyway. */
export function themeLeaks(lyrics: string, negatives: string[]): string[] {
  const hay = normaliseWords(lyrics);
  return negatives.filter((n) => {
    const needle = normaliseWords(n.replace(/^repeating\s+/i, ""));
    return needle.length >= 4 && hay.includes(needle);
  });
}

/** Where the dropdowns and the paragraph disagree, so the host can decide. */
export function conflictNotes(brief: StudioBrief, split: BriefSplit): string[] {
  const notes: string[] = [];
  const typed = `${split.subject} ${split.production.join(" ")}`.toLowerCase();
  const chosen = new Set([brief.genre.toLowerCase(), brief.genreBlend.toLowerCase()]);
  for (const genre of ALL_GENRES) {
    if (typed.includes(genre.toLowerCase()) && !chosen.has(genre.toLowerCase())) {
      notes.push(`You wrote "${genre}" but the style is set to ${brief.genre}. Pick one so they don't fight.`);
    }
  }
  const picked = new Set(brief.instruments.map((i) => i.toLowerCase()));
  for (const inst of INSTRUMENTS) {
    const short = inst.toLowerCase().split(" ").pop()!;
    if (short.length > 3 && typed.includes(short) && !brief.instruments.some((p) => p.toLowerCase().includes(short))) {
      notes.push(`You mentioned ${short}. Add it to the instruments so the composer hears it as a requirement.`);
    }
  }
  if (picked.size === 0 && !notes.length && split.production.length) {
    notes.push("Your sound notes are only in the paragraph. Choosing instruments makes them binding.");
  }
  return dedupe(notes).slice(0, 6);
}

/**
 * The direction handed to the composer, as labelled sections in priority order
 * rather than one comma-joined run-on. Content first, because content is the
 * thing that kept getting lost underneath five production directives.
 */
export function compileSectionedPrompt(input: {
  brief: StudioBrief;
  split: BriefSplit;
  occasion?: string;
  /** Wall pieces play under a slideshow; studio pieces are downloads. */
  use: "studio" | "wall";
  production: string;
  seconds: number;
}): string {
  const { brief, split, occasion, use, production, seconds } = input;
  const required = requiredPhrases(brief, split);
  const out: string[] = [];

  out.push(`TASK: write and perform one original ${brief.kind === "poem" ? "spoken-word piece" : "song"} of about ${seconds} seconds.`);

  const subjectLines = [
    occasion?.trim() ? `Occasion: ${occasion.trim().slice(0, 120)}.` : "",
    brief.honoree.trim() ? `This is for ${brief.honoree.trim().slice(0, 120)}.` : "",
    brief.keyMoment.trim() ? `Build it around this moment: ${brief.keyMoment.trim().slice(0, 300)}` : "",
    split.subject ? split.subject.slice(0, WORDS_MAX) : "",
  ].filter(Boolean);
  out.push(`\nSUBJECT OF THE WORDS (this is the most important part):\n${subjectLines.join("\n") || "A warm, specific piece for the people in the room."}`);

  if (required.length) {
    out.push(
      `\nMUST APPEAR IN THE WORDS, word for word, none skipped:\n${required
        .map((r) => `- ${r.slice(0, 160)}`)
        .join("\n")}`,
    );
  }

  const avoid = [
    ...split.negatives,
    ...(brief.avoid.trim() ? [brief.avoid.trim().slice(0, 200)] : []),
  ];
  if (avoid.length || split.positives.length) {
    out.push(
      `\nMUST NOT APPEAR:\n${dedupe(avoid).map((a) => `- ${a}`).join("\n")}${
        split.positives.length ? `\nHandle those as: ${split.positives.join(" ")}` : ""
      }`,
    );
  }

  out.push(`\nPRODUCTION:\n${production.trim()}`);
  if (split.production.length) out.push(`Host's sound notes: ${split.production.join(" ").slice(0, 600)}`);

  out.push(
    `\nDELIVERY:\n${
      brief.voice === "instrumental"
        ? "Fully instrumental, no vocals."
        : "Sing or speak every name and place exactly as spelled, clearly, never mumbled or shortened."
    }`,
  );
  out.push(
    use === "wall"
      ? "It plays quietly under a photo slideshow, so keep it steady with a clear loopable groove and no abrupt ending."
      : "This is a finished piece someone will download and keep: mix the vocal clearly on top, land a real ending, no fade-out mid-word and no abrupt cut.",
  );
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// The composition plan: the words as text, before any audio is paid for.
// ---------------------------------------------------------------------------

export type PlanChunk = {
  /** Section name, lyric lines and inline directions, as the composer reads it. */
  text: string;
  durationMs: number;
  positiveStyles: string[];
  negativeStyles: string[];
};

const MIN_CHUNK_MS = 3000;
const MAX_CHUNK_MS = 120000;

/** Just the sung or spoken words out of a plan, for checking and for display. */
export function planLyrics(chunks: PlanChunk[]): string {
  return chunks
    .map((c) =>
      c.text
        .split(/\r?\n/)
        .filter((l) => !/^\s*\[[^\]]*\]\s*$/.test(l))
        .join("\n"),
    )
    .join("\n")
    .trim();
}

/** The editable form shown to the host. */
export function planToText(chunks: PlanChunk[]): string {
  return chunks.map((c) => c.text.trim()).join("\n\n").trim();
}

/**
 * The host's edits back into a plan. Sections are matched by order, so the
 * styles and timings the composer planned survive a rewrite of the words.
 */
export function textToPlan(text: string, original: PlanChunk[]): PlanChunk[] {
  const blocks = text
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (!blocks.length) return original;
  const totalMs = original.reduce((n, c) => n + c.durationMs, 0) || blocks.length * 15000;
  const evenMs = Math.round(totalMs / blocks.length);
  return blocks.map((block, i) => {
    const from = original[i] ?? original[original.length - 1];
    const durationMs = original.length === blocks.length && from ? from.durationMs : evenMs;
    return {
      text: block.slice(0, 6000),
      durationMs: Math.min(MAX_CHUNK_MS, Math.max(MIN_CHUNK_MS, durationMs)),
      positiveStyles: from?.positiveStyles ?? [],
      negativeStyles: from?.negativeStyles ?? [],
    };
  });
}
