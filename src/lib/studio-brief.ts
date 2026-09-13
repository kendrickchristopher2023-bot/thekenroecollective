/**
 * Kenroe Sound Studio — the creative engine.
 *
 * The studio's job is not "make a track". It is to make one piece that a
 * specific room of people will remember, with the right names, the right
 * memories, and the right emotional arc. That only happens when the direction
 * we hand the composer is far richer than a genre and a mood.
 *
 * This module is the single place that turns a host's choices into that
 * direction. It is deterministic on purpose: the same brief always compiles to
 * the same prompt, so a remix changes only what the host changed, and so a
 * piece can still be composed when the AI director step is unavailable.
 */
import type { SongSettings } from "@/lib/wall-soundtrack";

// ---------------------------------------------------------------------------
// Choice lists. Grouped so the picker reads like a studio, not a dropdown.
// ---------------------------------------------------------------------------

export const GENRE_FAMILIES: { family: string; genres: string[] }[] = [
  {
    family: "Soul & gospel",
    genres: ["soul", "neo-soul", "motown soul", "gospel", "gospel choir anthem", "blues", "doo-wop"],
  },
  {
    family: "R&B & hip hop",
    genres: ["r&b", "90s r&b", "slow jam", "hip hop", "boom bap", "trap soul", "spoken word with beat"],
  },
  {
    family: "Pop & rock",
    genres: ["pop", "stadium pop", "indie pop", "power ballad", "soft rock", "folk rock", "gospel pop"],
  },
  {
    family: "Country & roots",
    genres: ["country", "country ballad", "bluegrass", "americana", "folk", "spiritual hymn"],
  },
  {
    family: "Global",
    genres: [
      "afrobeat",
      "highlife",
      "amapiano",
      "reggae",
      "reggaeton",
      "salsa",
      "bossa nova",
      "cumbia",
      "soca",
      "bhangra",
      "k-pop",
      "gqom",
    ],
  },
  {
    family: "Jazz & lounge",
    genres: ["jazz", "jazz trio", "big band swing", "smooth jazz", "lo-fi", "cocktail piano"],
  },
  {
    family: "Cinematic",
    genres: [
      "cinematic",
      "orchestral strings",
      "gentle piano",
      "ambient choir",
      "marching band",
      "a cappella",
      "steel drum",
    ],
  },
];

/** Flat list of every genre, for validation and for the blend picker. */
export const ALL_GENRES: string[] = GENRE_FAMILIES.flatMap((f) => f.genres);

export const ERAS = [
  "timeless",
  "1960s Motown",
  "1970s soul",
  "1980s synth",
  "1990s radio",
  "2000s pop",
  "modern 2020s",
] as const;

export const INSTRUMENTS = [
  "grand piano",
  "acoustic guitar",
  "electric guitar",
  "hammond organ",
  "church organ",
  "lush strings",
  "solo violin",
  "horn section",
  "saxophone solo",
  "trumpet",
  "harmonica",
  "banjo",
  "fiddle",
  "upright bass",
  "808 bass",
  "brushed drums",
  "live drum kit",
  "hand claps",
  "finger snaps",
  "tambourine",
  "congas",
  "talking drum",
  "kora",
  "steel pan",
  "harp",
  "synth pad",
  "choir pad",
  "vinyl crackle",
  "children laughing in the background",
] as const;

export const VOCAL_TEXTURES = [
  "clear and close to the microphone",
  "raspy and lived-in",
  "airy and gentle",
  "big belted finish",
  "gospel runs and ad libs",
  "conversational, almost spoken",
  "whispered and intimate",
  "layered family harmonies",
] as const;

export const SONG_STRUCTURES = [
  "verse, chorus, verse, chorus, then one bigger last chorus",
  "slow build from a single voice to the whole room by the end",
  "chorus first as a hook, then the verses, then the chorus twice",
  "verse, pre-chorus, chorus, bridge, then the last chorus almost a cappella",
  "story verses with one repeating line the room can sing back",
] as const;

export const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "Portuguese",
  "Haitian Creole",
  "Yoruba",
  "Twi",
  "Swahili",
  "Tagalog",
  "Korean",
  "English verses with a Spanish chorus",
  "English verses with a Yoruba chorus",
] as const;

/**
 * How hard the piece should swing at the heart. 1 keeps it light and fun;
 * 5 is explicitly written to put a room in tears.
 */
export const EMOTION_WORDS = [
  "light and fun, keep it smiling the whole way through",
  "warm and affectionate, a gentle lift",
  "moving but composed, one or two goosebump moments",
  "deeply moving, aim for a lump in the throat by the second chorus",
  "unashamedly tear-jerking: land one line so honest and specific that the room goes quiet, then lift them back up before the end",
] as const;

export type StudioBrief = SongSettings & {
  /** A second genre to blend into the first, or "" for a single genre. */
  genreBlend: string;
  /** How much of the blend, 1 (a hint) to 5 (an even split). */
  blendAmount: number;
  era: string;
  /** Instruments the host explicitly wants to hear. */
  instruments: string[];
  vocalTexture: string;
  structure: string;
  language: string;
  /** 1 to 5, see EMOTION_WORDS. */
  emotion: number;
  /** Who the piece is for, spelled and pronounced as they say it. */
  honoree: string;
  /** Lines, names, dates, in-jokes that MUST appear. One per line. */
  mustInclude: string;
  /** Anything to keep out: words, clichés, subjects. */
  avoid: string;
  /** The single moment the piece should be built around. */
  keyMoment: string;
  /** A line the room can sing back, if the host already has one. */
  refrain: string;
  /** Let the AI producer expand the brief before composing. */
  director: boolean;
};

export const DEFAULT_BRIEF_EXTRAS: Omit<StudioBrief, keyof SongSettings> = {
  genreBlend: "",
  blendAmount: 2,
  era: "timeless",
  instruments: [],
  vocalTexture: "clear and close to the microphone",
  structure: SONG_STRUCTURES[0],
  language: "English",
  emotion: 4,
  honoree: "",
  mustInclude: "",
  avoid: "",
  keyMoment: "",
  refrain: "",
  director: true,
};

function clamp5(n: number): number {
  return Math.min(5, Math.max(1, Math.round(Number.isFinite(n) ? n : 3)));
}

const TEMPO_WORDS = [
  "very slow, around 65 BPM",
  "slow, around 80 BPM",
  "mid-tempo, around 100 BPM",
  "upbeat, around 118 BPM",
  "fast and driving, around 135 BPM",
];
const BASS_WORDS = [
  "light low end",
  "gentle bass",
  "balanced bass",
  "warm prominent bass",
  "deep heavy bass",
];
const BRIGHT_WORDS = ["dark and warm", "warm", "balanced", "bright", "very bright and airy"];
const BLEND_WORDS = [
  "just a hint of",
  "a light touch of",
  "a clear thread of",
  "a strong helping of",
  "an even split with",
];

/** Splits a multi-line "must include" box into clean, quotable lines. */
export function mustIncludeLines(text: string): string[] {
  return text
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** The genre phrase, with the blend folded in when there is one. */
export function genrePhrase(brief: Pick<StudioBrief, "genre" | "genreBlend" | "blendAmount">): string {
  const blend = brief.genreBlend.trim();
  if (!blend || blend === brief.genre) return brief.genre;
  return `${brief.genre} with ${BLEND_WORDS[clamp5(brief.blendAmount) - 1]} ${blend}`;
}

/**
 * The full direction handed to the composer. Written as instructions rather
 * than a tag soup, because that is what gets a usable first take.
 */
export function compileStudioPrompt(brief: StudioBrief, occasion?: string): string {
  const poem = brief.kind === "poem";
  const tempo = TEMPO_WORDS[clamp5(brief.tempo) - 1]!;
  const bass = BASS_WORDS[clamp5(brief.bass) - 1]!;
  const bright = BRIGHT_WORDS[clamp5(brief.brightness) - 1]!;
  const emotion = EMOTION_WORDS[clamp5(brief.emotion) - 1]!;
  const lines: string[] = [];

  if (poem) {
    lines.push(
      `A ${brief.mood} ${brief.poemStyle} spoken aloud by a ${brief.voice}, over a quiet ${genrePhrase(brief)} bed.`,
      "The speaking voice sits clearly in front of the music, unhurried, with room to breathe between lines.",
    );
  } else {
    lines.push(
      `An original ${brief.mood} ${genrePhrase(brief)} song${
        brief.era && brief.era !== "timeless" ? ` with a ${brief.era} feel` : ""
      }.`,
      brief.voice === "instrumental"
        ? "Fully instrumental, no vocals."
        : `Lead vocal: ${brief.voice}, ${brief.vocalTexture}.`,
      `Structure: ${brief.structure}.`,
    );
  }

  lines.push(`Tempo and feel: ${tempo}, ${bass}, ${bright}.`);
  if (brief.instruments.length) {
    lines.push(`These instruments must be audible: ${brief.instruments.slice(0, 8).join(", ")}.`);
  }
  if (brief.language && brief.language !== "English") {
    lines.push(`Language: ${brief.language}. Pronounce it natively.`);
  }
  lines.push(`Emotional target: ${emotion}.`);

  if (occasion?.trim()) lines.push(`Occasion: ${occasion.trim().slice(0, 120)}.`);
  if (brief.honoree.trim()) {
    lines.push(
      `This is for ${brief.honoree.trim().slice(0, 120)}. Say that name out loud, clearly, exactly as spelled here, at least twice, and never mumble or shorten it.`,
    );
  }
  if (brief.keyMoment.trim()) {
    lines.push(`Build the whole piece around this one moment: ${brief.keyMoment.trim().slice(0, 300)}.`);
  }
  const words = brief.words.trim();
  if (words) lines.push(`What it is about: ${words.slice(0, 600)}`);

  const musts = mustIncludeLines(brief.mustInclude);
  if (musts.length) {
    lines.push(
      `Every one of these must appear in the ${poem ? "reading" : "lyrics"}, word for word, none skipped:`,
      ...musts.map((m) => `- ${m.slice(0, 160)}`),
    );
  }
  if (brief.refrain.trim() && !poem) {
    lines.push(
      `Use this exact line as the repeating hook so the room can sing it back: "${brief.refrain.trim().slice(0, 160)}"`,
    );
  }
  if (brief.avoid.trim()) lines.push(`Do not include: ${brief.avoid.trim().slice(0, 200)}.`);

  if (poem) {
    const verse = brief.poemText.trim();
    if (verse) {
      lines.push(`Read these exact words and add none of your own:\n${verse.slice(0, 1500)}`);
    }
  } else {
    lines.push(
      "Write real lyrics with concrete details rather than generic greeting-card lines. Sing every name and place exactly as spelled.",
      "Mix it like a finished record: vocal clearly on top, tidy ending, no fade-out mid-word, no abrupt cut.",
    );
  }
  return lines.join("\n");
}

/**
 * How it should SOUND, and nothing about what it is about.
 *
 * The sectioned prompt keeps subject and production apart so a paragraph of
 * lyrical intent can never be outranked by five production directives, which is
 * exactly how a bonfire song came back about surviving. This is the production
 * half of that split.
 */
export function compileProduction(brief: StudioBrief, seconds?: number): string {
  const poem = brief.kind === "poem";
  const tempo = TEMPO_WORDS[clamp5(brief.tempo) - 1]!;
  const bass = BASS_WORDS[clamp5(brief.bass) - 1]!;
  const bright = BRIGHT_WORDS[clamp5(brief.brightness) - 1]!;
  const lines: string[] = [];
  if (poem) {
    lines.push(
      `A ${brief.mood} ${brief.poemStyle} spoken aloud by a ${brief.voice}, over a quiet ${genrePhrase(brief)} bed.`,
      "The speaking voice sits clearly in front of the music, unhurried, with room to breathe between lines.",
    );
  } else {
    lines.push(
      `A ${brief.mood} ${genrePhrase(brief)} song${
        brief.era && brief.era !== "timeless" ? ` with a ${brief.era} feel` : ""
      }.`,
      brief.voice === "instrumental"
        ? "Fully instrumental, no vocals."
        : `Lead vocal: ${brief.voice}, ${brief.vocalTexture}.`,
      `Structure: ${brief.structure}.`,
    );
  }
  lines.push(`Tempo and feel: ${tempo}, ${bass}, ${bright}.`);
  if (brief.instruments.length) {
    lines.push(`These instruments must be audible: ${brief.instruments.slice(0, 8).join(", ")}.`);
  }
  if (brief.language && brief.language !== "English") {
    lines.push(`Language: ${brief.language}. Pronounce it natively.`);
  }
  lines.push(`Emotional target: ${EMOTION_WORDS[clamp5(brief.emotion) - 1]!}.`);
  if (seconds) lines.push(`Total length: about ${seconds} seconds.`);
  return lines.join("\n");
}

/**
 * Coaching, shown live next to the controls. A vague brief is the single
 * biggest reason a first take disappoints, so we say so before composing.
 */
export function briefCoaching(brief: StudioBrief): { score: number; tips: string[] } {
  const tips: string[] = [];
  let score = 0;
  if (brief.honoree.trim()) score += 1;
  else tips.push("Name who it is for, with the pronunciation in brackets.");
  if (brief.words.trim().length >= 60) score += 1;
  else tips.push("Say more about them: two or three specific details beat a paragraph of adjectives.");
  if (brief.keyMoment.trim()) score += 1;
  else tips.push("Give one real moment to build around, like the porch light or the last dance.");
  if (mustIncludeLines(brief.mustInclude).length) score += 1;
  else tips.push("Add the lines, names or in-jokes that must be in there.");
  if (brief.instruments.length) score += 1;
  else tips.push("Pick an instrument or two you want to hear.");
  if (brief.kind === "poem" ? brief.poemText.trim().length > 40 : brief.refrain.trim()) score += 1;
  else
    tips.push(
      brief.kind === "poem"
        ? "Write or draft the verse so it is read exactly as you want it."
        : "Give a line the room can sing back.",
    );
  return { score, tips };
}

/** Merge a saved settings blob back into a full brief, for remixes and reloads. */
export function briefFrom(
  base: SongSettings,
  saved: Partial<StudioBrief> | null | undefined,
): StudioBrief {
  return {
    ...base,
    ...DEFAULT_BRIEF_EXTRAS,
    ...(saved ?? {}),
    instruments: Array.isArray(saved?.instruments) ? saved!.instruments.slice(0, 8) : [],
  } as StudioBrief;
}
