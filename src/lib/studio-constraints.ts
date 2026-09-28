/**
 * Kenroe Sound Studio — a control is a constraint, not a suggestion.
 *
 * Two language models sit between what a host chooses and what they hear: the
 * AI producer pass that expands the brief into prose, and the composer's own
 * composition plan. Both are free to paraphrase, and a paraphrase of "female
 * lead" is sometimes a male vocal. That is how a host chose a female lead and
 * got a man singing.
 *
 * So every deterministic choice is turned into three things here:
 *  1. a non-negotiable directive that is re-asserted AFTER the last rewrite,
 *  2. explicit positive and negative styles pushed onto every plan section, so
 *     the render call itself carries the constraint rather than trusting prose,
 *  3. a check that reads the finished plan back and says, before a cent is
 *     spent, whether the plan actually agrees with the choice.
 *
 * Pure and deterministic on purpose: the same brief always produces the same
 * constraints, so the list can be shown to the host before they press compose.
 */
import { genrePhrase, type StudioBrief } from "@/lib/studio-brief";
import type { PlanChunk } from "@/lib/studio-words";

export type SettingCheck = {
  /** Stable id, stored on the finished piece. */
  id: string;
  /** What the control is called on screen. */
  label: string;
  /** What the host chose. */
  chosen: string;
  /** The exact non-negotiable sentence handed to the composer. */
  direction: string;
  /** Styles asserted on every section of the plan. */
  positives: string[];
  /** Styles forbidden on every section of the plan. */
  negatives: string[];
  /** Lowercase phrases whose presence means the plan contradicts the choice. */
  conflicts: string[];
  /** Lowercase phrases whose presence shows the plan carried the choice. */
  confirms: string[];
  /**
   * True when the plan can be judged for this setting. Tempo, bass and
   * brightness are mix decisions the plan text does not restate, so we assert
   * them and say plainly that we cannot verify them from the plan.
   */
  verifiable: boolean;
};

export type PlanVerdict = {
  /** Settings the plan explicitly confirms. */
  honoured: string[];
  /** Settings we asserted but the plan does not restate either way. */
  asserted: string[];
  /** Settings the plan actively contradicts. */
  deviations: { id: string; label: string; chosen: string; detail: string }[];
};

/**
 * Vocal identity is the setting that broke, and the only lever the API gives us
 * for it is text, so the text has to be unambiguous in both directions: what we
 * want, and what must never appear.
 */
const FEMALE = ["female lead vocal", "a woman singing lead", "female voice"];
const MALE = ["male lead vocal", "a man singing lead", "male voice"];
const VOCAL_ANY = [
  "vocal",
  "vocals",
  "sung",
  "singing",
  "singer",
  "lyrics",
  "choir",
  "rap",
  "spoken word",
  "verse",
  "chorus",
];

type VoiceRule = {
  positives: string[];
  negatives: string[];
  conflicts: string[];
  confirms: string[];
};

const VOICE_RULES: Record<string, VoiceRule> = {
  instrumental: {
    positives: ["fully instrumental", "no vocals", "no lyrics", "no singing"],
    negatives: ["vocals", "lead vocal", "singing", "lyrics", "choir", "rap", "spoken word"],
    conflicts: VOCAL_ANY,
    confirms: ["instrumental"],
  },
  "female lead": {
    positives: FEMALE,
    negatives: ["male vocal", "male lead vocal", "man singing", "baritone lead", "instrumental only"],
    conflicts: ["male lead", "male vocal", "man singing", "baritone", "male singer", "instrumental only"],
    confirms: ["female", "woman"],
  },
  "male lead": {
    positives: MALE,
    negatives: ["female vocal", "female lead vocal", "woman singing", "instrumental only"],
    conflicts: ["female lead", "female vocal", "woman singing", "female singer", "instrumental only"],
    confirms: ["male", "man"],
  },
  // Legacy value, still readable on old rows. Treated as the mixed pairing,
  // which is what the composer chose most of the time anyway.
  duet: {
    positives: ["male and female duet, two lead voices trading lines"],
    negatives: ["single solo vocal only", "instrumental only"],
    conflicts: ["solo vocal only", "instrumental only"],
    confirms: ["duet", "two voices", "trading"],
  },
  "duet, two women": {
    positives: [
      "duet of two women, two female lead vocals trading lines",
      "both singers are women",
    ],
    negatives: ["male vocal", "a man singing", "mixed duet", "solo vocal only", "instrumental only"],
    conflicts: ["male lead", "male vocal", "a man singing", "baritone", "solo vocal only", "instrumental only"],
    confirms: ["two women", "two female", "female duet"],
  },
  "duet, two men": {
    positives: ["duet of two men, two male lead vocals trading lines", "both singers are men"],
    negatives: ["female vocal", "a woman singing", "mixed duet", "solo vocal only", "instrumental only"],
    conflicts: ["female lead", "female vocal", "a woman singing", "solo vocal only", "instrumental only"],
    confirms: ["two men", "two male", "male duet"],
  },
  "duet, a woman and a man": {
    positives: ["duet of one woman and one man, two lead vocals trading lines"],
    negatives: ["two women singing", "two men singing", "solo vocal only", "instrumental only"],
    conflicts: ["two women", "two men", "solo vocal only", "instrumental only"],
    confirms: ["woman and a man", "male and female", "mixed duet"],
  },
  "child lead voice": {
    positives: ["a single child singing lead, clearly a young child's voice"],
    negatives: ["adult lead vocal", "grown-up voice", "instrumental only"],
    conflicts: ["adult lead", "adult vocal", "grown man", "grown woman", "instrumental only"],
    confirms: ["child", "young child", "kid"],
  },
  "two children singing": {
    positives: ["two children singing together, both young voices"],
    negatives: ["adult lead vocal", "instrumental only"],
    conflicts: ["adult lead", "adult vocal", "instrumental only"],
    confirms: ["two children", "children", "kids"],
  },
  "a child and an adult together": {
    positives: ["a child and an adult singing together, both voices audible"],
    negatives: ["adult only", "children only", "instrumental only"],
    conflicts: ["adults only", "instrumental only"],
    confirms: ["child", "adult"],
  },
  choir: {
    positives: ["full choir singing together", "group vocal"],
    negatives: ["solo vocal only", "instrumental only"],
    conflicts: ["solo vocal only", "instrumental only"],
    confirms: ["choir", "group vocal", "ensemble"],
  },
  "gospel choir": {
    positives: ["full gospel choir", "call and response gospel vocals"],
    negatives: ["solo vocal only", "instrumental only"],
    conflicts: ["solo vocal only", "instrumental only"],
    confirms: ["gospel", "choir"],
  },
  "children's choir": {
    positives: ["children's choir singing", "young voices"],
    negatives: ["adult solo vocal only", "instrumental only"],
    conflicts: ["instrumental only"],
    confirms: ["children", "young voices", "kids"],
  },
  "elder storyteller voice": {
    positives: ["older storyteller voice, weathered and warm"],
    negatives: ["young pop vocal", "instrumental only"],
    conflicts: ["instrumental only"],
    confirms: ["elder", "older", "storyteller"],
  },
  "family sing-along crowd": {
    positives: ["a room of family voices singing along"],
    negatives: ["studio solo vocal only", "instrumental only"],
    conflicts: ["instrumental only"],
    confirms: ["crowd", "sing-along", "group", "family"],
  },
  "soft whispered vocal": {
    positives: ["soft whispered close-mic vocal"],
    negatives: ["belted vocal", "instrumental only"],
    conflicts: ["belted", "instrumental only"],
    confirms: ["whisper", "soft", "breathy"],
  },
  "rap verse with sung chorus": {
    positives: ["rapped verses", "sung chorus"],
    negatives: ["instrumental only"],
    conflicts: ["instrumental only"],
    confirms: ["rap", "rapped", "sung chorus"],
  },
  "humming and wordless vocals": {
    positives: ["wordless humming vocals"],
    negatives: ["full lyrics", "instrumental only"],
    conflicts: ["instrumental only"],
    confirms: ["humming", "wordless", "vocalise"],
  },
  // Poem voices. The piece is spoken, so the same gender trap applies.
  "warm woman's voice": {
    positives: ["a woman speaking the words", "female spoken voice"],
    negatives: ["male narrator", "man speaking", "sung vocal"],
    conflicts: ["male narrator", "man speaking", "male voice"],
    confirms: ["woman", "female"],
  },
  "deep man's voice": {
    positives: ["a man speaking the words", "deep male spoken voice"],
    negatives: ["female narrator", "woman speaking", "sung vocal"],
    conflicts: ["female narrator", "woman speaking", "female voice"],
    confirms: ["man", "male"],
  },
  "elder storyteller": {
    positives: ["an older storyteller speaking"],
    negatives: ["sung vocal"],
    conflicts: [],
    confirms: ["elder", "older", "storyteller"],
  },
  "young voice": {
    positives: ["a young voice speaking"],
    negatives: ["sung vocal"],
    conflicts: [],
    confirms: ["young"],
  },
  // Legacy poem value, kept readable on old rows.
  "two voices trading lines": {
    positives: ["two speakers trading lines"],
    negatives: ["single narrator only"],
    conflicts: ["single narrator"],
    confirms: ["two voices", "trading", "two speakers"],
  },
  "two women trading lines": {
    positives: ["two women speaking, trading lines", "both readers are women"],
    negatives: ["male narrator", "man speaking", "single narrator only", "sung vocal"],
    conflicts: ["male narrator", "man speaking", "male voice", "single narrator"],
    confirms: ["two women", "two female"],
  },
  "two men trading lines": {
    positives: ["two men speaking, trading lines", "both readers are men"],
    negatives: ["female narrator", "woman speaking", "single narrator only", "sung vocal"],
    conflicts: ["female narrator", "woman speaking", "female voice", "single narrator"],
    confirms: ["two men", "two male"],
  },
  "a woman and a man trading lines": {
    positives: ["one woman and one man speaking, trading lines"],
    negatives: ["two women speaking", "two men speaking", "single narrator only", "sung vocal"],
    conflicts: ["two women", "two men", "single narrator"],
    confirms: ["woman and a man", "man and a woman"],
  },
  "a child reading aloud": {
    positives: ["a child reading the words aloud, clearly a young child's voice"],
    negatives: ["adult narrator", "grown-up voice", "sung vocal"],
    conflicts: ["adult narrator", "adult voice", "grown man", "grown woman"],
    confirms: ["child", "young", "kid"],
  },
  "narrator with choir behind": {
    positives: ["a narrator speaking with a choir behind"],
    negatives: ["dry solo narration only"],
    conflicts: [],
    confirms: ["narrator", "choir"],
  },
};

/** Is this voice choice a piece with no singing at all? */
export function isInstrumental(brief: Pick<StudioBrief, "voice">): boolean {
  return brief.voice.trim().toLowerCase() === "instrumental";
}

function voiceRule(voice: string): VoiceRule {
  const key = voice.trim().toLowerCase();
  return (
    VOICE_RULES[key] ?? {
      positives: [`${voice} vocal`],
      negatives: ["instrumental only"],
      conflicts: ["instrumental only"],
      confirms: [key],
    }
  );
}

const TEMPO_LABELS = ["very slow (~65 BPM)", "slow (~80 BPM)", "mid-tempo (~100 BPM)", "upbeat (~118 BPM)", "fast (~135 BPM)"];
const BASS_LABELS = ["light low end", "gentle bass", "balanced bass", "warm prominent bass", "deep heavy bass"];
const BRIGHT_LABELS = ["dark and warm", "warm", "balanced", "bright", "very bright and airy"];

function clamp5(n: number): number {
  return Math.min(5, Math.max(1, Math.round(Number.isFinite(n) ? n : 3)));
}

/**
 * Every choice the host made with a control, as a constraint. Order matters:
 * the voice comes first because it is the one that broke, and because a plan
 * that gets the voice wrong is wrong no matter what else it gets right.
 */
export function hardConstraints(brief: StudioBrief): SettingCheck[] {
  const poem = brief.kind === "poem";
  const rule = voiceRule(brief.voice);
  const checks: SettingCheck[] = [];

  const instrumental = isInstrumental(brief);
  checks.push({
    id: "kind",
    label: poem ? "Piece" : "Piece",
    chosen: instrumental ? "instrumental piece" : poem ? `spoken-word ${brief.poemStyle}` : "sung song",
    direction: instrumental
      ? "This is an INSTRUMENTAL piece: music only, no words of any kind."
      : poem
      ? `This is a SPOKEN-WORD ${brief.poemStyle}: the words are spoken aloud, never sung, over a quiet musical bed.`
      : "This is a SUNG song with real lyrics, not an instrumental and not a spoken reading.",
    positives: instrumental
      ? ["instrumental music with no vocals"]
      : poem
        ? ["spoken word", "spoken narration over music"]
        : ["sung lead vocal with lyrics"],
    negatives: poem ? ["sung melody on the lead", "belted singing"] : ["instrumental only"],
    conflicts: instrumental ? [] : poem ? ["sung lead", "belted"] : ["instrumental only"],
    confirms: instrumental
      ? ["instrumental"]
      : poem
        ? ["spoken", "narration", "recited"]
        : ["sung", "vocal", "verse", "chorus"],
    verifiable: true,
  });

  checks.push({
    id: "voice",
    label: poem ? "Reading voice" : "Lead voice",
    chosen: brief.voice,
    direction: isInstrumental(brief)
      ? "FULLY INSTRUMENTAL. No vocals of any kind: no singing, no humming, no spoken word, no choir, no rap, no lyrics."
      : `The lead voice is ${brief.voice}, and nothing else. Do not substitute another voice type or gender.`,
    positives: rule.positives,
    negatives: rule.negatives,
    conflicts: rule.conflicts,
    confirms: rule.confirms,
    verifiable: true,
  });

  if (!isInstrumental(brief) && !poem && brief.vocalTexture.trim()) {
    checks.push({
      id: "vocalTexture",
      label: "Vocal delivery",
      chosen: brief.vocalTexture,
      direction: `Vocal delivery: ${brief.vocalTexture}.`,
      positives: [brief.vocalTexture],
      negatives: [],
      conflicts: [],
      confirms: [brief.vocalTexture.toLowerCase().split(" ")[0] ?? ""].filter(Boolean),
      verifiable: false,
    });
  }

  checks.push({
    id: "genre",
    label: "Style",
    chosen: genrePhrase(brief),
    direction: `Style: ${genrePhrase(brief)}. Stay in that style.`,
    positives: [brief.genre, ...(brief.genreBlend && brief.genreBlend !== brief.genre ? [brief.genreBlend] : [])],
    negatives: [],
    conflicts: [],
    confirms: [brief.genre.toLowerCase(), ...(brief.genreBlend ? [brief.genreBlend.toLowerCase()] : [])],
    verifiable: true,
  });

  checks.push({
    id: "mood",
    label: "Mood",
    chosen: brief.mood,
    direction: `Mood: ${brief.mood} throughout.`,
    positives: [`${brief.mood} mood`],
    negatives: [],
    conflicts: [],
    confirms: [brief.mood.toLowerCase()],
    verifiable: true,
  });

  checks.push({
    id: "tempo",
    label: "Tempo",
    chosen: TEMPO_LABELS[clamp5(brief.tempo) - 1]!,
    direction: `Tempo: ${TEMPO_LABELS[clamp5(brief.tempo) - 1]!}.`,
    positives: [TEMPO_LABELS[clamp5(brief.tempo) - 1]!],
    negatives: [],
    conflicts: [],
    confirms: [],
    verifiable: false,
  });

  checks.push({
    id: "bass",
    label: "Low end",
    chosen: BASS_LABELS[clamp5(brief.bass) - 1]!,
    direction: `Low end: ${BASS_LABELS[clamp5(brief.bass) - 1]!}.`,
    positives: [BASS_LABELS[clamp5(brief.bass) - 1]!],
    negatives: [],
    conflicts: [],
    confirms: [],
    verifiable: false,
  });

  checks.push({
    id: "brightness",
    label: "Brightness",
    chosen: BRIGHT_LABELS[clamp5(brief.brightness) - 1]!,
    direction: `Tone: ${BRIGHT_LABELS[clamp5(brief.brightness) - 1]!}.`,
    positives: [BRIGHT_LABELS[clamp5(brief.brightness) - 1]!],
    negatives: [],
    conflicts: [],
    confirms: [],
    verifiable: false,
  });

  if (brief.era && brief.era !== "timeless") {
    checks.push({
      id: "era",
      label: "Era",
      chosen: brief.era,
      direction: `Era: a ${brief.era} feel.`,
      positives: [brief.era],
      negatives: [],
      conflicts: [],
      confirms: [brief.era.toLowerCase()],
      verifiable: true,
    });
  }

  if (brief.language && brief.language !== "English") {
    checks.push({
      id: "language",
      label: "Language",
      chosen: brief.language,
      direction: `Language: ${brief.language}, pronounced natively.`,
      positives: [brief.language],
      negatives: [],
      conflicts: [],
      confirms: [brief.language.toLowerCase().split(" ")[0] ?? ""].filter(Boolean),
      verifiable: true,
    });
  }

  if (!isInstrumental(brief) && brief.structure.trim() && !poem) {
    checks.push({
      id: "structure",
      label: "Shape",
      chosen: brief.structure,
      direction: `Shape: ${brief.structure}.`,
      positives: [],
      negatives: [],
      conflicts: [],
      confirms: [],
      verifiable: false,
    });
  }

  for (const inst of brief.instruments.slice(0, 8)) {
    checks.push({
      id: `instrument:${inst}`,
      label: "Instrument",
      chosen: inst,
      direction: `${inst} must be audible.`,
      positives: [inst],
      negatives: [],
      conflicts: [],
      confirms: [inst.toLowerCase(), inst.toLowerCase().split(" ").pop() ?? ""].filter(Boolean),
      verifiable: true,
    });
  }

  return checks;
}

/**
 * The block appended AFTER the producer's prose and after every other section,
 * so the last thing the composer reads is the host's actual choices.
 */
export function constraintDirective(checks: SettingCheck[]): string {
  const lines = checks.map((c) => `- ${c.label}: ${c.direction}`);
  return [
    "\nNON-NEGOTIABLE SETTINGS (chosen with controls, not suggestions; they override anything above that disagrees):",
    ...lines,
  ].join("\n");
}

/**
 * Where a contradiction can live: the words and the styles being ASKED for.
 * Negative styles are excluded on purpose, because a constraint we forbade
 * ("male lead vocal") lives there by design and is not a contradiction.
 */
/**
 * Substring matching is a trap here: "female lead vocal" contains "male lead
 * vocal", so a naive check reports the exact opposite of the truth. Matches
 * must start at a word boundary.
 */
export function mentions(haystack: string, phrase: string): boolean {
  const needle = phrase.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!needle) return false;
  return new RegExp(`(?<![a-z0-9])${needle}`).test(haystack);
}

function hay(chunk: PlanChunk): string {
  return [chunk.text, ...chunk.positiveStyles].join(" \n ").toLowerCase();
}

function styleHay(chunk: PlanChunk): string {
  return chunk.positiveStyles.join(" \n ").toLowerCase();
}

/** Lyric lines in a section: everything that is not a [Section] marker. */
export function lyricLines(chunk: PlanChunk): string[] {
  return chunk.text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^\s*\[[^\]]*\]\s*$/.test(l));
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

/**
 * Push the constraints onto the plan the composer wrote: strip the styles that
 * contradict a choice, forbid them explicitly, and assert the choice on every
 * section. This is the re-assertion after the last model rewrite.
 */
export function applyConstraints(chunks: PlanChunk[], checks: SettingCheck[]): PlanChunk[] {
  const positives = dedupe(checks.flatMap((c) => c.positives));
  const negatives = dedupe(checks.flatMap((c) => c.negatives));
  const conflicts = dedupe(checks.flatMap((c) => c.conflicts));
  const instrumental = checks.some((c) => c.id === "voice" && /fully instrumental/i.test(c.direction));

  return chunks.map((chunk) => {
    const keptPositives = chunk.positiveStyles.filter(
      (s) => !conflicts.some((bad) => mentions(s.toLowerCase(), bad)),
    );
    const droppedPositives = chunk.positiveStyles.filter((s) => !keptPositives.includes(s));
    const text = instrumental
      ? dedupe([
          ...chunk.text.split(/\r?\n/).filter((l) => /^\s*\[[^\]]*\]\s*$/.test(l.trim())),
          "[Instrumental, no vocals]",
        ]).join("\n")
      : chunk.text;
    return {
      text: text.slice(0, 6000),
      durationMs: chunk.durationMs,
      positiveStyles: dedupe([...positives, ...keptPositives]).slice(0, 50),
      negativeStyles: dedupe([...negatives, ...droppedPositives, ...chunk.negativeStyles]).slice(0, 50),
    };
  });
}

/**
 * Read the plan back and say whether it agrees with each choice. Free, because
 * the plan step costs nothing, which is what makes checking before paying the
 * obvious thing to do.
 */
export function verifyPlan(chunks: PlanChunk[], checks: SettingCheck[]): PlanVerdict {
  const honoured: string[] = [];
  const asserted: string[] = [];
  const deviations: PlanVerdict["deviations"] = [];
  const instrumental = checks.some((c) => c.id === "voice" && /fully instrumental/i.test(c.direction));

  for (const check of checks) {
    if (!check.verifiable) {
      asserted.push(check.id);
      continue;
    }
    if (check.id === "voice" && instrumental) {
      const sung = chunks.flatMap((c) => lyricLines(c)).filter((l) => !/instrumental/i.test(l));
      // "no vocals" contains "vocal", so a plain substring test would flag the
      // very styles we just asserted. Only an unnegated vocal request counts.
      const styleConflict = chunks.some((c) =>
        /(?<!no )(?<!without )(vocal|singing|sung|choir|rap|spoken word)/.test(styleHay(c)),
      );
      if (sung.length || styleConflict) {
        deviations.push({
          id: check.id,
          label: check.label,
          chosen: check.chosen,
          detail: sung.length
            ? `The plan still contains ${sung.length} line(s) to be sung or spoken.`
            : "The plan still asks for vocals in its own styles.",
        });
      } else {
        honoured.push(check.id);
      }
      continue;
    }
    const conflict = chunks.some((c) => check.conflicts.some((bad) => mentions(hay(c), bad)));
    if (conflict) {
      const hit = check.conflicts.find((bad) => chunks.some((c) => mentions(hay(c), bad)));
      deviations.push({
        id: check.id,
        label: check.label,
        chosen: check.chosen,
        detail: `The plan asks for "${hit}", which contradicts your choice.`,
      });
      continue;
    }
    const confirmed = check.confirms.some((word) => chunks.some((c) => mentions(hay(c), word)));
    (confirmed ? honoured : asserted).push(check.id);
  }

  return { honoured, asserted, deviations };
}

/** One line per control, for the disclosure shown before the button is pressed. */
export function settingsUsed(checks: SettingCheck[]): { label: string; chosen: string; direction: string; verifiable: boolean }[] {
  return checks.map((c) => ({
    label: c.label,
    chosen: c.chosen,
    direction: c.direction,
    verifiable: c.verifiable,
  }));
}
