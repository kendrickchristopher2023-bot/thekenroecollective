/**
 * Kenroe Sound Studio — changing the length of a piece he already has.
 *
 * Everything in here is pure and deterministic so the whole decision can be
 * shown to the host, and tested, before any money moves.
 *
 * Two genuinely different routes, and which one is available decides what we
 * are allowed to promise:
 *
 *  - "extend": the original recording is kept, verbatim, and new music is
 *    generated around it. This needs the composer to be holding the original
 *    song (an inpainting id), which only exists for pieces rendered after we
 *    started asking for it, or for one we hand back to the composer.
 *  - "rerender": no stored original, so the longer piece is composed again
 *    from the same brief, the same approved words and the same plan. It will
 *    feel like the same song. It will NOT be the same recording, and the host
 *    is told that in those words before he pays.
 *
 * Shortening uses the same machinery in reverse and is never charged.
 */
import type { PlanChunk } from "@/lib/studio-words";
import { PIECE_TIERS, tierForSeconds, money, isAudition, type PieceKind } from "@/lib/music-studio-pricing";

/** Lengths a host can move a piece to. */
export const LENGTH_CHOICES = [30, 60, 120, 180, 240] as const;

/** A conditioning/audio reference slice may be at most 30s (provider limit). */
export const MAX_REFERENCE_MS = 30000;

/** Provider limits on a single generated chunk. */
export const MIN_CHUNK_MS = 3000;
export const MAX_CHUNK_MS = 120000;

export type GrowMode = "verse" | "instrumental" | "chorus";

export const GROW_MODES: { key: GrowMode; label: string; blurb: string }[] = [
  {
    key: "verse",
    label: "Add a verse",
    blurb: "New words in the same voice, so the extra time says something rather than repeating.",
  },
  {
    key: "instrumental",
    label: "Extend the music",
    blurb: "No new words. The band plays on, which is what you want under photographs.",
  },
  {
    key: "chorus",
    label: "Come back to the chorus",
    blurb: "The part people remember, sung again at the end.",
  },
];

/**
 * What to grow by default. Anything that plays under pictures gets more music
 * rather than more words, and a piece with no words never gets given any.
 */
export function defaultGrowMode(opts: {
  instrumental?: boolean;
  underSlideshow?: boolean;
  kind?: string | null;
}): GrowMode {
  if (opts.instrumental || opts.underSlideshow || opts.kind === "wall") return "instrumental";
  return "verse";
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export type LengthCharge = {
  /** "free" for shortening or same tier, "difference" for an upgrade. */
  kind: "free" | "difference";
  /** The tier the new length falls in, when there is one to charge. */
  priceKey: string | null;
  /** What this change costs now, in cents. */
  amountCents: number;
  /** The full price of the new length, for comparison. */
  fullCents: number;
  /** What the host has already paid towards this piece. */
  alreadyPaidCents: number;
  /** Plain-language line for the button. */
  label: string;
};

/**
 * Difference pricing, built this way pending Christopher's approval: a host who
 * bought 60 seconds and wants 120 pays the gap, not the whole thing again.
 * Shortening is free, and so is any change that stays inside the tier he has
 * already paid for.
 */
export function lengthCharge(opts: {
  fromSeconds: number;
  toSeconds: number;
  /** Cents already paid for this piece (0 when it was a free audition). */
  paidCents: number;
  /** Songs and speech are on different ladders. Defaults to the song ladder. */
  pieceKind?: PieceKind;
}): LengthCharge {
  const toTier = tierForSeconds(opts.toSeconds, opts.pieceKind ?? "song");
  const fullCents = toTier?.amountCents ?? 0;
  const paid = Math.max(0, Math.round(opts.paidCents));

  if (!toTier || isAudition(opts.toSeconds) || fullCents <= paid) {
    return {
      kind: "free",
      priceKey: toTier?.priceKey ?? null,
      amountCents: 0,
      fullCents,
      alreadyPaidCents: paid,
      label: opts.toSeconds < opts.fromSeconds ? "Shorten, free" : "Compose, free",
    };
  }

  const owed = fullCents - paid;
  return {
    kind: "difference",
    priceKey: toTier.priceKey,
    amountCents: owed,
    fullCents,
    alreadyPaidCents: paid,
    label: paid > 0 ? `Pay the difference, ${money(owed)}` : `Compose, ${money(owed)}`,
  };
}

/** Every length that is a real move from where this piece is now. */
export function lengthOptions(currentSeconds: number): number[] {
  return LENGTH_CHOICES.filter((s) => s !== currentSeconds);
}

/** The longest tier a host could grow into. Used for the "up to" line. */
export const MAX_PIECE_SECONDS = PIECE_TIERS[PIECE_TIERS.length - 1]!.maxSeconds;

// ---------------------------------------------------------------------------
// Words and plan
// ---------------------------------------------------------------------------

const CHORUS_RE = /^\s*\[[^\]]*\b(chorus|refrain|hook)\b[^\]]*\]/i;

/** The chorus block of a plan, if it has one worth coming back to. */
export function chorusChunk(chunks: PlanChunk[]): PlanChunk | null {
  return chunks.find((c) => CHORUS_RE.test(c.text)) ?? null;
}

/**
 * Grow or trim a plan to a new total, without touching the sections the host
 * already approved. Nothing here rewrites a line: growth is added as new
 * sections, and shortening drops whole sections from the end and then trims
 * what is left, so no half-line ever reaches the composer.
 *
 * `lockedLyrics`, when set, is the thing this must not damage: growth may only
 * add instrumental sections or repeat a section that is already there.
 */
export function relengthPlan(opts: {
  chunks: PlanChunk[];
  toSeconds: number;
  mode: GrowMode;
  /** True when the piece has no vocals at all. */
  instrumental?: boolean;
  /** Set when the host locked the words. Forces musical growth only. */
  lockedLyrics?: boolean;
  /** Words for a new verse, already approved. Ignored unless mode is verse. */
  newVerse?: string;
}): PlanChunk[] {
  const base = opts.chunks.filter((c) => c.text.trim().length);
  if (!base.length) return [];
  const targetMs = Math.max(MIN_CHUNK_MS, Math.round(opts.toSeconds * 1000));
  const currentMs = base.reduce((n, c) => n + c.durationMs, 0);

  if (targetMs <= currentMs) return trimPlan(base, targetMs);

  const extraMs = targetMs - currentMs;
  const mode: GrowMode =
    opts.instrumental || opts.lockedLyrics
      ? opts.mode === "chorus"
        ? "chorus"
        : "instrumental"
      : opts.mode;

  const added: PlanChunk[] = [];
  let left = extraMs;

  if (mode === "chorus") {
    const chorus = chorusChunk(base);
    if (chorus) {
      // A repeat is the SAME words, copied character for character.
      added.push({ ...chorus, durationMs: Math.min(chorus.durationMs, left) });
      left -= added[0]!.durationMs;
    }
  }

  if (mode === "verse" && !opts.lockedLyrics) {
    const verse = (opts.newVerse ?? "").trim();
    if (verse) {
      const span = Math.min(MAX_CHUNK_MS, Math.max(MIN_CHUNK_MS, left));
      added.push({
        text: verse.startsWith("[") ? verse : `[Verse]\n${verse}`,
        durationMs: span,
        positiveStyles: base[0]?.positiveStyles ?? [],
        negativeStyles: base[0]?.negativeStyles ?? [],
      });
      left -= span;
    }
  }

  // Whatever is still missing becomes music with no words, which is always
  // safe: it cannot contradict a lock and it cannot invent a lyric.
  while (left >= MIN_CHUNK_MS) {
    const span = Math.min(MAX_CHUNK_MS, left);
    added.push({
      text: added.length ? "[Instrumental]\n[no vocals]" : "[Outro]\n[instrumental, no vocals]",
      durationMs: span,
      positiveStyles: base[base.length - 1]?.positiveStyles ?? [],
      negativeStyles: base[base.length - 1]?.negativeStyles ?? [],
    });
    left -= span;
  }
  if (left > 0 && added.length) {
    const last = added[added.length - 1]!;
    last.durationMs = Math.min(MAX_CHUNK_MS, last.durationMs + left);
  }

  // A repeated chorus belongs at the end; a new verse goes before the closing
  // music so the piece still finishes on its own tail.
  return [...base, ...added];
}

/** Drop whole sections from the end, then shorten the last one that survives. */
export function trimPlan(chunks: PlanChunk[], targetMs: number): PlanChunk[] {
  const kept: PlanChunk[] = [];
  let used = 0;
  for (const c of chunks) {
    if (used >= targetMs) break;
    const room = targetMs - used;
    if (room < MIN_CHUNK_MS) break;
    const span = Math.min(c.durationMs, room);
    kept.push({ ...c, durationMs: Math.max(MIN_CHUNK_MS, span) });
    used += span;
  }
  if (!kept.length) {
    const first = chunks[0]!;
    return [{ ...first, durationMs: Math.max(MIN_CHUNK_MS, targetMs) }];
  }
  return kept;
}

// ---------------------------------------------------------------------------
// The provider request
// ---------------------------------------------------------------------------

export type AudioRefChunk = { songId: string; startMs: number; endMs: number };
export type ExtendChunk = PlanChunk | AudioRefChunk;

export function isAudioRef(c: ExtendChunk): c is AudioRefChunk {
  return (c as AudioRefChunk).songId !== undefined;
}

/**
 * The real extension: keep the original recording as an audio reference and
 * generate only the new time around it. `keepMs` is how much of the original to
 * keep, which is all of it unless the host is shortening.
 */
export function extendChunks(opts: {
  songId: string;
  originalSeconds: number;
  keepFromMs?: number;
  keepToMs?: number;
  grown: PlanChunk[];
  /** Sections of `grown` that are new, i.e. beyond the original length. */
  addedCount: number;
}): ExtendChunk[] {
  const startMs = Math.max(0, Math.round(opts.keepFromMs ?? 0));
  const endMs = Math.max(
    startMs + MIN_CHUNK_MS,
    Math.round(opts.keepToMs ?? opts.originalSeconds * 1000),
  );
  const added = opts.addedCount > 0 ? opts.grown.slice(-opts.addedCount) : [];
  return [
    { songId: opts.songId, startMs, endMs },
    ...added.map((c) => ({ ...c })),
  ];
}

/** How many sections of a relengthed plan are new. */
export function addedSectionCount(before: PlanChunk[], after: PlanChunk[]): number {
  return Math.max(0, after.length - before.length);
}

/**
 * What we are allowed to tell the host, in his words, before he pays. This
 * string is the promise, so it lives next to the code that decides the route.
 */
export function lengthPromise(route: "extend" | "rerender", toSeconds: number): string {
  const mins = toSeconds >= 60 ? `${Math.round((toSeconds / 60) * 10) / 10} minutes` : `${toSeconds} seconds`;
  if (route === "extend") {
    return `Your recording is kept exactly as it is, and new music is written on the end to reach ${mins}. The part you already know will sound identical.`;
  }
  return `This composes a NEW recording at ${mins}, from the same words, the same settings and the same arrangement. It will feel like the same song, but it will not be the same recording, and small details will differ. Your current version stays in your library either way.`;
}

/**
 * Looping, offered free before a paid render. A short piece that loops cleanly
 * covers an hour of photographs; a longer render still ends.
 */
export function loopAdvice(seconds: number, minutesNeeded: number): string {
  const loops = Math.max(2, Math.ceil((minutesNeeded * 60) / Math.max(10, seconds)));
  return `Under photographs you probably do not need a longer piece. Looping plays this one round ${loops} times to cover ${minutesNeeded} minutes, with the same blend the wall already uses, and it costs nothing.`;
}
