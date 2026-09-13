// Pure, browser-safe helpers for the Photo Wall soundtrack: streaming-link
// parsing, AI prompt compilation, and the transition / pacing maths. Kept free
// of server imports so both the host panel and the wall player can use them,
// and so every rule here is unit testable without a database.

import { splitBriefText } from "@/lib/studio-words";

export const MAX_MUSIC_BYTES = 10 * 1024 * 1024;
export const MAX_MUSIC_SECONDS = 300;
export const MAX_UPLOAD_TRACKS = 6;
/**
 * Songs and poems share these slots, so a host putting a song on the invitation,
 * one under the photo wall, and a spoken tribute needs real room. Three filled up
 * fast enough that composing looked broken.
 */

export const MAX_AI_TRACKS = 6;
export const MAX_LINK_CARDS = 1;
export const AI_SONG_SECONDS = 60;
/**
 * Full-song lengths a host can choose, in seconds: one, two, three or four
 * minutes. Longer songs cost more to compose and take longer to come back, so
 * the UI always names the wait.
 */
export const AI_SONG_LENGTH_CHOICES = [60, 120, 180, 240] as const;
export type AiSongLength = (typeof AI_SONG_LENGTH_CHOICES)[number];
/** Hard ceiling the server enforces on a composed song. */
export const AI_SONG_MAX_SECONDS = 240;
/** Default length of the throwaway taste a host can hear before paying for the full song. */
export const SAMPLE_SONG_SECONDS = 10;
/** Sample lengths a host can choose, in seconds. */
export const SAMPLE_LENGTH_CHOICES = [10, 20, 30] as const;
export type SampleLength = (typeof SAMPLE_LENGTH_CHOICES)[number];
/**
 * Samples are metered in ten-second units rather than by count, so a 30-second
 * taste costs three of the allowance and a 10-second taste costs one. That keeps
 * the longer previews available without letting them run away with the budget.
 */
export const SAMPLE_HOURLY_UNITS = 18;
/** How many samples one host may take per event per hour, at the shortest length. */
export const SAMPLE_HOURLY_LIMIT = SAMPLE_HOURLY_UNITS;
/** Allowance cost of one sample at this length. */
export function sampleUnitCost(seconds: number): number {
  return Math.max(1, Math.round(seconds / 10));
}
/** Human label for a length in seconds, like "30 seconds" or "2 minutes". */
export function songLengthLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const mins = seconds / 60;
  return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
}
/** Roughly how long a host waits for a song of this length, in plain words. */
export function composeWaitLabel(seconds: number): string {
  if (seconds <= 60) return "about a minute";
  if (seconds <= 120) return "a couple of minutes";
  if (seconds <= 180) return "about three minutes";
  return "about four minutes";
}
/** Plain-language message when the hourly sample allowance is used up. */
export const SAMPLE_LIMIT_MESSAGE =
  "You've sampled a lot in the last hour. Give it an hour, or compose the full song from the take you liked best.";


export const MUSIC_LICENCE_TEXT =
  "I confirm I own this recording or hold a licence that allows it to be played at my event, and that I am not uploading a copyrighted commercial track without permission.";

export const AI_SONG_CREDIT =
  "Original song composed by AI for this event. Free to use at the event and in the slideshow.";

export type MusicSource = "upload" | "ai" | "link";

// ---------------------------------------------------------------------------
// Streaming links. We render a launch card only: Spotify, Apple Music and
// Amazon Music do not licence their audio for playback under a third-party
// slideshow, so we never proxy or embed the audio stream itself.
// ---------------------------------------------------------------------------

export type LinkProvider = "spotify" | "apple" | "amazon";

const LINK_HOSTS: Record<LinkProvider, string[]> = {
  spotify: ["open.spotify.com", "spotify.link"],
  apple: ["music.apple.com", "embed.music.apple.com"],
  amazon: ["music.amazon.com", "music.amazon.co.uk", "amazon.com"],
};

export const LINK_PROVIDER_LABELS: Record<LinkProvider, string> = {
  spotify: "Spotify",
  apple: "Apple Music",
  amazon: "Amazon Music",
};

/**
 * Returns the provider for a playlist / album / track link, or null when the
 * host is not on the allow-list. Anything else (a random MP3 URL, a YouTube
 * link, a shortener we don't recognise) is rejected rather than guessed at.
 */
export function parseMusicLink(raw: string): { provider: LinkProvider; url: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  for (const [provider, hosts] of Object.entries(LINK_HOSTS) as [LinkProvider, string[]][]) {
    if (hosts.includes(host)) {
      if (provider === "amazon" && host === "amazon.com" && !parsed.pathname.startsWith("/music")) {
        return null;
      }
      parsed.protocol = "https:";
      return { provider, url: parsed.toString() };
    }
  }
  return null;
}

/** A readable fallback title when the provider gives us nothing to show. */
export function fallbackLinkTitle(provider: LinkProvider): string {
  return `Playlist on ${LINK_PROVIDER_LABELS[provider]}`;
}

// ---------------------------------------------------------------------------
// Official embedded players. Apple Music, Spotify and Amazon Music each publish
// an embeddable player anyone may put on a page: non-subscribers hear 30 second
// previews, signed-in subscribers hear full tracks, and the audio never leaves
// the provider's own player. The listener starts it themselves, so it is not a
// soundtrack synchronised to the photos, which is the thing every one of these
// services forbids in writing. We never proxy, mix or beat-match this audio.
// ---------------------------------------------------------------------------

export type MusicEmbed = {
  src: string;
  provider: LinkProvider;
  /** Suggested iframe height in px. */
  height: number;
  /** Honest note about what a listener will actually hear. */
  note: string;
};

/**
 * Turns an allow-listed streaming link into its official embed player URL, or
 * null when that provider cannot be embedded from this kind of link. Only the
 * three known hosts are ever framed: an iframe pointed at arbitrary host input
 * would let a host frame anything.
 */
export function musicEmbed(raw: string): MusicEmbed | null {
  const parsed = parseMusicLink(raw);
  if (!parsed) return null;
  let url: URL;
  try {
    url = new URL(parsed.url);
  } catch {
    return null;
  }

  if (parsed.provider === "apple") {
    url.hostname = "embed.music.apple.com";
    return {
      src: url.toString(),
      provider: "apple",
      height: 450,
      note: "Apple Music plays a 30 second preview of each song unless the listener is signed in to Apple Music on this screen.",
    };
  }

  if (parsed.provider === "spotify") {
    const path = url.pathname.startsWith("/embed/") ? url.pathname : `/embed${url.pathname}`;
    return {
      src: `https://open.spotify.com${path}`,
      provider: "spotify",
      height: 380,
      note: "Spotify plays 30 second previews unless the listener is signed in to Spotify on this screen.",
    };
  }

  // Amazon Music embeds by content id: /albums/ID, /playlists/ID, /tracks/ID.
  const parts = url.pathname.split("/").filter(Boolean);
  const kindAt = parts.findIndex((p) => ["albums", "playlists", "tracks", "user-playlists"].includes(p));
  const id = kindAt >= 0 ? parts[kindAt + 1] : undefined;
  if (!id) return null;
  return {
    src: `https://music.amazon.com/embed/${encodeURIComponent(id)}?id=${encodeURIComponent(id)}`,
    provider: "amazon",
    height: 380,
    note: "Amazon Music plays previews unless the listener is signed in to Amazon Music on this screen.",
  };
}

/** Plain warning shown wherever the two audio sources meet. */
export const EMBED_EXCLUSIVE_NOTE =
  "One at a time: starting the playlist stops your own soundtrack. Streaming players are separate from our audio, so they can never be blended or crossfaded with your songs.";


// ---------------------------------------------------------------------------
// AI song settings -> a single well-formed prompt. The model never sees raw
// slider numbers; it sees the musical language those choices mean.
// ---------------------------------------------------------------------------

export const GENRES = [
  "soul",
  "gospel",
  "country",
  "r&b",
  "pop",
  "hip hop",
  "jazz",
  "afrobeat",
  "reggae",
  "folk",
  "cinematic",
  "gentle piano",
  "neo-soul",
  "blues",
  "bossa nova",
  "highlife",
  "salsa",
  "bluegrass",
  "lo-fi",
  "orchestral strings",
  "marching band",
  "steel drum",
  "spoken word with beat",
  "a cappella",
] as const;

export const MOODS = [
  "joyful",
  "tender",
  "nostalgic",
  "triumphant",
  "playful",
  "reverent",
  "bittersweet",
  "proud",
  "romantic",
  "hopeful",
  "grateful",
  "celebratory and loud",
  "calm and healing",
  "funny",
] as const;

export const VOICES = [
  "instrumental",
  "female lead",
  "male lead",
  // Duets say who is singing. A bare "duet" told the composer nothing, so it
  // picked the pairing itself; these three leave nothing to guess.
  "duet, two women",
  "duet, two men",
  "duet, a woman and a man",
  "choir",
  "gospel choir",
  // Children's voices, as a proper section rather than one choir option.
  "child lead voice",
  "two children singing",
  "a child and an adult together",
  "children's choir",
  "elder storyteller voice",
  "family sing-along crowd",
  "soft whispered vocal",
  "rap verse with sung chorus",
  "humming and wordless vocals",
] as const;

/**
 * What kind of piece the host is making. A song is sung; a poem is spoken aloud
 * over a quiet instrumental bed, which is what makes it land at a tribute,
 * memorial, toast or graduation moment.
 */
export const PIECE_KINDS = ["song", "poem"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

/** Poem shapes a host can pick. Each one changes how the words are written and read. */
export const POEM_STYLES = [
  "spoken word tribute",
  "rhyming toast",
  "free verse",
  "blessing",
  "playful roast",
  "letter read aloud",
  "call and response",
  "lullaby verse",
] as const;
export type PoemStyle = (typeof POEM_STYLES)[number];

/** How the poem is performed. Kept separate from sung VOICES so the wording fits. */
export const POEM_VOICES = [
  "warm woman's voice",
  "deep man's voice",
  "elder storyteller",
  "young voice",
  "a child reading aloud",
  // Two readers, with the pairing stated rather than left to the composer.
  "two women trading lines",
  "two men trading lines",
  "a woman and a man trading lines",
  "narrator with choir behind",
] as const;

/**
 * Voice names we no longer offer, and what they now mean.
 *
 * The bare values were ambiguous, which is exactly why they were replaced, but
 * pieces already carry them, so they stay readable here and are mapped to the
 * explicit choice a host would have got by default.
 */
export const LEGACY_VOICES: Record<string, string> = {
  duet: "duet, a woman and a man",
  "two voices trading lines": "a woman and a man trading lines",
};

/** Read an old or new voice value as a current one. */
export function normaliseVoice(voice: string): string {
  const key = voice.trim().toLowerCase();
  return LEGACY_VOICES[key] ?? voice;
}

/**
 * Options for a voice picker, keeping whatever the piece already carries so an
 * old value never shows as an empty box.
 */
export function voiceOptions(list: readonly string[], current: string): string[] {
  return list.includes(current) || !current.trim() ? [...list] : [current, ...list];
}

/** Plain-language help for each poem style, shown next to the picker. */
export const POEM_STYLE_HINTS: Record<string, string> = {
  "spoken word tribute": "Rhythmic, from the heart. Best for honouring one person.",
  "rhyming toast": "Short, warm, easy to raise a glass to.",
  "free verse": "No rhyme, image-led. Feels literary and modern.",
  blessing: "A gentle wish over the room. Good for weddings and new babies.",
  "playful roast": "Affectionate teasing that still lands on love.",
  "letter read aloud": "Written as if you are speaking straight to them.",
  "call and response": "A line for the reader, a line for the room to answer.",
  "lullaby verse": "Soft and slow, for a baby shower or a quiet close.",
};

export type SongSettings = {
  /** "song" is sung; "poem" is spoken over music. */
  kind: PieceKind;
  words: string;
  genre: string;
  mood: string;
  voice: string;
  /** Poem shape. Ignored when kind is "song". */
  poemStyle: string;
  /** The verse itself, when the host wrote or accepted one. Ignored for songs. */
  poemText: string;
  /** 1 (slow) to 5 (fast). */
  tempo: number;
  /** 1 (light) to 5 (heavy bass). */
  bass: number;
  /** 1 (warm) to 5 (bright). */
  brightness: number;
};

export const DEFAULT_SONG_SETTINGS: SongSettings = {
  kind: "song",
  words: "",
  genre: "soul",
  mood: "joyful",
  voice: "female lead",
  poemStyle: "spoken word tribute",
  poemText: "",
  tempo: 3,
  bass: 3,
  brightness: 3,
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

/** Arrangement arc, so a composed piece grows instead of vamping on one idea. */
const ARC_WORDS = [
  "open sparse, add one instrument at a time, and end on the warmest chord",
  "start with the hook, strip it back in the middle, then bring everything home",
  "build steadily from the first bar to a full, generous finish",
];

/** A stable arc choice, so the same settings always compile to the same prompt. */
function arcFor(settings: SongSettings): string {
  const seed = clamp5(settings.tempo) + clamp5(settings.brightness);
  return ARC_WORDS[seed % ARC_WORDS.length]!;
}

/**
 * Deterministic prompt compilation. Used as-is when the AI polish step is
 * unavailable, and as the input to that step when it is, so a piece can always
 * be generated even if the text model is down. Songs and poems compile through
 * the same door so every caller, sample or full compose, stays in step.
 */
export function compileSongPrompt(settings: SongSettings, eventTitle?: string): string {
  if (settings.kind === "poem") return compilePoemPrompt(settings, eventTitle);
  const s = {
    ...settings,
    tempo: clamp5(settings.tempo),
    bass: clamp5(settings.bass),
    brightness: clamp5(settings.brightness),
  };
  const parts: string[] = [];
  // What it is about leads, because a host's paragraph kept being outranked by
  // the production directives that used to sit in front of it. Notes aimed at
  // us rather than at the song ("make it a banger") are dropped rather than
  // sung: a music model reads striving and effort as the subject.
  const split = splitBriefText(s.words);
  if (split.subject) parts.push(`about: ${split.subject.slice(0, 1200)}`);
  if (split.mustInclude.length) {
    parts.push(`these words must be sung: ${split.mustInclude.join(", ")}`);
  }
  if (split.negatives.length) parts.push(`never mention: ${split.negatives.join(", ")}`);
  parts.push(`A ${s.mood} ${s.genre} track`);
  parts.push(s.voice === "instrumental" ? "fully instrumental, no vocals" : `with a ${s.voice}`);
  parts.push(TEMPO_WORDS[s.tempo - 1]!);
  parts.push(BASS_WORDS[s.bass - 1]!);
  parts.push(BRIGHT_WORDS[s.brightness - 1]!);
  parts.push(arcFor(s));
  if (split.production.length) parts.push(split.production.join(" "));
  if (eventTitle?.trim())
    parts.push(`for a celebration called "${eventTitle.trim().slice(0, 80)}"`);
  parts.push(
    "sing any names exactly as they are spelled out, clearly and never mumbled",
    "It plays quietly under a photo slideshow, so keep it steady with a clear loopable groove and no abrupt ending",
  );
  return `${parts.join(", ")}.`;
}

/**
 * Poem direction. The words matter more than the groove here, so the verse is
 * quoted verbatim and the music is explicitly pushed under the voice. When the
 * host has not written or accepted a verse yet we describe the reading instead,
 * so a sample still comes back.
 */
export function compilePoemPrompt(settings: SongSettings, eventTitle?: string): string {
  const s = {
    ...settings,
    tempo: clamp5(settings.tempo),
    brightness: clamp5(settings.brightness),
  };
  const parts: string[] = [];
  parts.push(`A ${s.mood} ${s.poemStyle} spoken aloud by a ${s.voice}`);
  parts.push(`over a quiet ${s.genre} instrumental bed`);
  parts.push(TEMPO_WORDS[s.tempo - 1]!);
  parts.push(BRIGHT_WORDS[s.brightness - 1]!);
  parts.push(
    "the spoken voice sits well in front of the music, unhurried, with room to breathe between lines",
    "pronounce every name exactly as it is spelled here",
  );
  if (eventTitle?.trim())
    parts.push(`for a celebration called "${eventTitle.trim().slice(0, 80)}"`);
  const verse = s.poemText.trim();
  const words = s.words.trim();
  if (verse) {
    parts.push(`Read these exact words and add none of your own:\n${verse.slice(0, 1200)}`);
  } else if (words) {
    parts.push(`about: ${words.slice(0, 400)}`);
  }
  return `${parts.join(", ")}.`;
}

/** Word count that reads comfortably aloud in this many seconds, at roughly 110 wpm. */
export function poemWordBudget(seconds: number): number {
  return Math.max(20, Math.round((Math.max(10, seconds) / 60) * 110));
}


// ---------------------------------------------------------------------------
// Transitions and pacing. Measured once per track, then reused at playback
// time so the wall costs nothing extra to run.
// ---------------------------------------------------------------------------

/**
 * How long to crossfade from one track into the next. Two calm tracks get a
 * long, luxurious blend; a jump between very different energies gets a short
 * fade so it reads as an intentional change rather than a muddle.
 */
export function crossfadeMs(
  from: { bpm?: number | null; energy?: number | null },
  to: { bpm?: number | null; energy?: number | null },
): number {
  const e1 = typeof from.energy === "number" ? from.energy : 0.5;
  const e2 = typeof to.energy === "number" ? to.energy : 0.5;
  const b1 = typeof from.bpm === "number" && from.bpm > 0 ? from.bpm : 100;
  const b2 = typeof to.bpm === "number" && to.bpm > 0 ? to.bpm : 100;

  const energyGap = Math.abs(e1 - e2);
  const tempoGap = Math.abs(b1 - b2) / Math.max(b1, b2);
  const contrast = Math.min(1, energyGap * 0.7 + tempoGap * 1.3);

  // 4.5s when the two tracks sit together, down to 1.2s when they clash.
  const ms = 4500 - contrast * 3300;
  return Math.round(Math.min(4500, Math.max(1200, ms)));
}

/**
 * An equal-power (constant-power) fade curve. A straight line fade makes two
 * overlapping tracks dip in loudness halfway through, which is the "wobble"
 * you hear on a plain crossfade. Sine / cosine keeps total power steady, so
 * the handover is inaudible.
 */
export function equalPowerCurve(direction: "in" | "out", points = 64): Float32Array {
  const n = Math.max(2, Math.round(points));
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const v = direction === "in" ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
    curve[i] = Math.max(0.0001, v);
  }
  return curve;
}

export type TransitionPlan = {
  /** How long the two tracks sound together, in ms. */
  overlapMs: number;
  /** Tail decay of the outgoing track, in ms. Always the full overlap. */
  fadeOutMs: number;
  /** Rise of the incoming track, in ms. Deliberately shorter than the tail. */
  fadeInMs: number;
  /** Deliberate silence after the outgoing track, used in no-crossfade mode. */
  gapMs: number;

};

/**
 * How to hand over from one track to the next without touching either song's
 * structure. Three rules:
 *
 * 1. The overlap lands on whole bars of the outgoing track, so the two grooves
 *    line up instead of fighting.
 * 2. The outgoing track decays across the whole overlap, using its own natural
 *    tail rather than being cut.
 * 3. The incoming track rises quickly (under half the overlap), so its opening
 *    bars arrive at full strength and its intro isn't smothered.
 */
export function transitionPlan(
  from: { bpm?: number | null; energy?: number | null; seconds?: number | null },
  to: { bpm?: number | null; energy?: number | null; seconds?: number | null },
  options: { noCrossfade?: boolean } = {},
): TransitionPlan {
  // Ceremony mode: no blend at all. Each song ends on its own tail, then a
  // short, deliberate silence before the next one begins.
  if (options.noCrossfade) {
    return { overlapMs: 0, fadeOutMs: 220, fadeInMs: 120, gapMs: CLEAN_GAP_MS };
  }

  let overlap = crossfadeMs(from, to);

  const bar = barMs(from.bpm);
  if (bar) overlap = Math.max(bar, Math.round(overlap / bar) * bar);

  // Never eat more than a third of either track.
  const limit = (secs?: number | null) =>
    typeof secs === "number" && secs > 0 ? (secs * 1000) / 3 : Infinity;
  overlap = Math.min(overlap, limit(from.seconds), limit(to.seconds));
  overlap = Math.round(Math.min(6000, Math.max(600, overlap)));

  const fadeIn = Math.round(Math.min(1800, Math.max(300, overlap * 0.45)));
  return { overlapMs: overlap, fadeOutMs: overlap, fadeInMs: fadeIn, gapMs: 0 };
}

/** Silence between songs when the host has turned crossfading off. */
export const CLEAN_GAP_MS = 900;

export type SegmentSchedule = {
  /** How long this segment and the next sound together, in seconds. */
  overlapSec: number;
  /** Rise of this segment, in seconds. */
  fadeInSec: number;
  /** Decay of this segment, in seconds. */
  fadeOutSec: number;
  /** Deliberate silence after the decay, in seconds (clean-gap mode only). */
  gapSec: number;
  /** Seconds after this segment starts when its decay begins. */
  fadeOutAtSec: number;
  /** Seconds after this segment starts when the next segment starts. */
  handoverSec: number;
};

/**
 * Turns a transition plan into the exact timings the player schedules, so the
 * arithmetic that keeps the wall's audio continuous can be tested rather than
 * inferred by ear.
 *
 * A single short track on repeat is the case that matters most: one 30 second
 * song has to run all night without a hole or an audible doubling. So when the
 * next segment is the same recording the overlap is capped hard and both fades
 * are held inside it, and in clean-gap mode the repeat gets a breath rather
 * than the full between-songs silence.
 */
export function segmentSchedule(input: {
  /** Audible length of this segment after head/tail trimming. */
  playableSec: number;
  plan: TransitionPlan;
  /** The next segment is this same recording. */
  isRepeat: boolean;
  noCrossfade?: boolean;
}): SegmentSchedule {
  const playable = Math.max(0.5, input.playableSec);
  const blendedRepeat = input.isRepeat && !input.noCrossfade;

  const overlapSec = blendedRepeat
    ? Math.min(input.plan.overlapMs, 1200) / 1000
    : input.plan.overlapMs / 1000;
  const fadeInSec = blendedRepeat
    ? Math.min(input.plan.fadeInMs / 1000, overlapSec)
    : input.plan.fadeInMs / 1000;
  const fadeOutSec = Math.max(
    0.05,
    blendedRepeat
      ? Math.min(input.plan.fadeOutMs / 1000, overlapSec)
      : input.plan.fadeOutMs / 1000,
  );

  const fadeOutAtSec = Math.max(fadeInSec + 0.2, playable - overlapSec);
  const gapSec = input.noCrossfade ? (input.isRepeat ? 0.25 : input.plan.gapMs / 1000) : 0;
  const handoverSec = input.noCrossfade ? fadeOutAtSec + fadeOutSec + gapSec : fadeOutAtSec;

  return { overlapSec, fadeInSec, fadeOutSec, gapSec, fadeOutAtSec, handoverSec };
}


// ---------------------------------------------------------------------------
// Per-track conditioning. All of this is measured once from the decoded audio
// and then applied at schedule time, so playback itself stays free.
// ---------------------------------------------------------------------------

/** The shape of a decoded buffer we need. Kept minimal so it is testable. */
export type SampleSource = {
  duration: number;
  sampleRate: number;
  length: number;
  getChannelData: (channel: number) => Float32Array;
};

export type TrackConditioning = {
  /** Seconds of near-silence at the head, skipped on playback. */
  headSec: number;
  /** Seconds of near-silence at the tail, trimmed off the end. */
  tailSec: number;
  /** Audible length: duration minus the trimmed head and tail. */
  playableSec: number;
  /** Average loudness of the audible part, 0 to 1. */
  energy: number;
  /** Playback gain that brings this track in line with the others. */
  gain: number;
};

/** How quiet counts as silence. -50 dBFS: real room tone still survives. */
const SILENCE_FLOOR = 0.0032;

/**
 * Finds the real start and end of the music and measures its loudness.
 *
 * Most MP3s (and encoder padding on AI renders) carry a fraction of a second
 * of nothing at each end. That dead air reads as a gap no crossfade can hide,
 * so we skip it rather than fade through it. The scan is on a coarse window
 * grid, which is both cheap and immune to a single stray sample.
 */
export function analyseSamples(buffer: SampleSource): TrackConditioning {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate > 0 ? buffer.sampleRate : 44_100;
  const duration = buffer.duration > 0 ? buffer.duration : data.length / sampleRate;
  const win = Math.max(1, Math.floor(sampleRate * 0.01)); // 10ms windows
  const peaks: number[] = [];
  for (let i = 0; i < data.length; i += win) {
    let peak = 0;
    for (let j = i; j < Math.min(i + win, data.length); j += 4) {
      const v = Math.abs(data[j] ?? 0);
      if (v > peak) peak = v;
    }
    peaks.push(peak);
  }

  let firstLoud = peaks.findIndex((p) => p > SILENCE_FLOOR);
  let lastLoud = -1;
  for (let i = peaks.length - 1; i >= 0; i -= 1) {
    if ((peaks[i] ?? 0) > SILENCE_FLOOR) {
      lastLoud = i;
      break;
    }
  }
  // A track that is silent throughout: leave it exactly as it is.
  if (firstLoud < 0 || lastLoud < 0) {
    return { headSec: 0, tailSec: 0, playableSec: duration, energy: 0, gain: 1 };
  }
  // Keep a hair of the run-in so a soft attack is not clipped off.
  firstLoud = Math.max(0, firstLoud - 1);
  lastLoud = Math.min(peaks.length - 1, lastLoud + 1);

  const winSec = win / sampleRate;
  // Never trim more than 3s from either end: a long ambient intro is music.
  const headSec = Math.min(3, Math.max(0, firstLoud * winSec));
  const tailSec = Math.min(3, Math.max(0, duration - (lastLoud + 1) * winSec));
  const playableSec = Math.max(0.5, duration - headSec - tailSec);

  let sum = 0;
  let n = 0;
  for (let i = firstLoud; i <= lastLoud; i += 1) {
    const p = peaks[i] ?? 0;
    sum += p * p;
    n += 1;
  }
  const energy = Math.min(1, Math.sqrt(sum / Math.max(1, n)) * 1.6);

  return { headSec, tailSec, playableSec, energy, gain: loudnessGain(energy) };
}

/** Loudness we aim every track at, on the same 0-1 scale as `energy`. */
export const TARGET_ENERGY = 0.42;

/**
 * A single playback gain per track so an AI song does not arrive 6 dB louder
 * than an uploaded one. Clamped to +/- about 5 dB: enough to even out a mixed
 * playlist, not enough to push a hot master into clipping or to drag a quiet
 * ambient piece up into its own noise floor.
 */
export function loudnessGain(energy?: number | null): number {
  if (typeof energy !== "number" || !Number.isFinite(energy) || energy <= 0.02) return 1;
  return Math.round(Math.min(1.8, Math.max(0.55, TARGET_ENERGY / energy)) * 1000) / 1000;
}

/**
 * Where the incoming track should start playing. When we trust the tempo we
 * start on the first downbeat after the trimmed head, so the new song enters
 * in time with the slideshow instead of at an arbitrary sample. Without a
 * confident tempo we simply start at the first audible moment.
 */
export function entryOffsetSec(
  headSec: number,
  bpm?: number | null,
  confident = true,
): number {
  const head = Math.max(0, headSec);
  const bar = barMs(bpm);
  if (!bar || !confident) return head;
  const beat = bar / 4 / 1000;
  // The first audible moment IS the downbeat for almost every song; nudge
  // forward by at most one beat if the trim landed mid-beat.
  const within = head % beat;
  if (within < beat * 0.15 || within > beat * 0.85) return head;
  return Math.round((head + (beat - within)) * 1000) / 1000;
}

/**
 * How long to fade the music down when the wall closes or the slideshow ends.
 * Up to 20 seconds, but never longer than what is actually left of the track,
 * so we never sit on silence waiting for a fade to finish.
 */
export function closingFadeSec(remainingSec?: number | null, maxSec = 20): number {
  const remaining =
    typeof remainingSec === "number" && Number.isFinite(remainingSec) && remainingSec > 0
      ? remainingSec
      : maxSec;
  return Math.round(Math.min(maxSec, Math.max(1.5, remaining)) * 100) / 100;
}


/** Milliseconds in one four-beat bar at this tempo. */
export function barMs(bpm?: number | null): number | null {
  if (typeof bpm !== "number" || bpm <= 20 || bpm > 220) return null;
  return Math.round((60_000 / bpm) * 4);
}

/**
 * Snap the slideshow interval to whole bars so photos change on the beat
 * instead of drifting against the music. Falls back to the base interval when
 * we have no tempo for the current track.
 */
export function slideMsForTrack(baseMs: number, bpm?: number | null): number {
  const bar = barMs(bpm);
  if (!bar) return baseMs;
  const bars = Math.max(1, Math.round(baseMs / bar));
  return bars * bar;
}

/**
 * The order tracks play in, looping for as long as the wall runs. With fewer
 * tracks than photos the list repeats rather than stopping, and a single track
 * still yields a valid endless sequence.
 */
export function playbackSequence<T>(tracks: T[], slots: number): T[] {
  if (tracks.length === 0 || slots <= 0) return [];
  const out: T[] = [];
  for (let i = 0; i < slots; i += 1) out.push(tracks[i % tracks.length]!);
  return out;
}

/** Enforce the per-event caps in one place, so panel and server agree. */
export function capFor(source: MusicSource): number {
  return source === "ai" ? MAX_AI_TRACKS : source === "link" ? MAX_LINK_CARDS : MAX_UPLOAD_TRACKS;
}

export function capMessage(source: MusicSource): string {
  if (source === "ai") return `You can keep ${MAX_AI_TRACKS} AI songs and poems per event. Remove one first.`;
  if (source === "link") return "You can add one streaming playlist link per event.";
  return `You can add up to ${MAX_UPLOAD_TRACKS} uploaded tracks. Remove one first.`;
}

/**
 * Where a piece sits on the wall, and why that has to differ by kind.
 *
 * A song is background: it repeats under the photos all night and nobody minds.
 * A letter is the opposite. It is one person's words, listened to once, while
 * the room goes quiet. Looping a letter under a slideshow would be awful, so
 * "moment" is forced for letters here, in shared code, rather than being left to
 * whichever screen happens to be attaching it. A poem can honestly be either,
 * so the host chooses.
 */
export const PLACEMENTS = ["bed", "moment"] as const;
export type Placement = (typeof PLACEMENTS)[number];

export function placementFor(kind: string, chosen?: string | null): Placement {
  if (kind === "letter") return "moment";
  if (kind === "poem" && chosen === "moment") return "moment";
  return "bed";
}

/** True when this wall row is a played-once moment rather than part of the loop. */
export function isMoment(settings: unknown): boolean {
  const s = (settings ?? {}) as { kind?: unknown; placement?: unknown };
  if (s.kind === "letter") return true;
  return s.placement === "moment";
}

export function placementLabel(placement: Placement): string {
  return placement === "moment" ? "Plays once, when someone presses play" : "Loops under the photos";
}

/** What to call a piece in plain words. */
export function pieceKindLabel(kind: string): string {
  if (kind === "poem") return "Poem";
  if (kind === "letter") return "Letter";
  return "Song";
}

/**
 * A recommendation rather than three equal options. Someone planning a memorial
 * should not be offered a sing-along first, and someone planning a birthday
 * should not be steered to a letter.
 */
export function recommendedKind(occasionText: string): { kind: string; why: string } {
  const t = occasionText.toLowerCase();
  if (/memorial|funeral|remember|celebration of life|repast|tribute|in memory/.test(t)) {
    return {
      kind: "letter",
      why: "For a memorial, a letter read aloud in someone's own words lands harder than a sing-along.",
    };
  }
  if (/graduation|retirement|award|honou?r|anniversary/.test(t)) {
    return { kind: "poem", why: "For a moment of honour, a poem read over music suits the room." };
  }
  if (/wedding|engagement|vow/.test(t)) {
    return {
      kind: "letter",
      why: "A letter from someone who cannot be there is the one thing a playlist cannot do.",
    };
  }
  return { kind: "song", why: "For a party or a birthday, a song everyone can sing along to." };
}
