// Kenroe Sound Studio (Venture 05) — the single place piece pricing is defined.
// Change an amount here and on the matching Stripe price (same lookup key).
//
// Auditions (10, 20 and 30 seconds) are free. A finished piece is priced by how
// long it is and by what kind of piece it is, and the same price applies whether
// the piece stands alone or is attached to a Group eCard.
//
// There are two ladders because the two cost very different amounts to make:
//   - Songs are billed to us by the minute of music.
//   - Letters and spoken word are billed to us per character of text, which
//     works out far cheaper per minute, so they sit on a cheaper ladder.
//
// To change a number: edit `amountCents` here AND create a new Stripe price on
// the same `priceKey` lookup key. Nothing else needs touching.

/** Longest audition, in seconds. Anything longer is a paid finished piece. */
export const AUDITION_MAX_SECONDS = 30;

/** Free auditions per person per day, once the studio opens to the public. */
export const FREE_AUDITIONS_PER_DAY = 5;

/** The three things the studio can make. Letters and poems are both speech. */
export type PieceKind = "song" | "poem" | "letter";

export type PieceTier = {
  /** Stripe price lookup key. */
  priceKey: string;
  /** Longest piece this tier covers, in seconds. */
  maxSeconds: number;
  amountCents: number;
  label: string;
};

/** Sung pieces, billed to us by the minute of generated music. */
export const PIECE_TIERS: readonly PieceTier[] = [
  { priceKey: "music_piece_1min", maxSeconds: 60, amountCents: 699, label: "Up to 1 minute" },
  { priceKey: "music_piece_2min", maxSeconds: 120, amountCents: 999, label: "Up to 2 minutes" },
  { priceKey: "music_piece_4min", maxSeconds: 240, amountCents: 1499, label: "Up to 4 minutes" },
] as const;

/** Letters and spoken word, billed to us per character of text. */
export const SPEECH_TIERS: readonly PieceTier[] = [
  { priceKey: "speech_piece_1min", maxSeconds: 60, amountCents: 399, label: "Up to 1 minute" },
  { priceKey: "speech_piece_2min", maxSeconds: 120, amountCents: 599, label: "Up to 2 minutes" },
  { priceKey: "speech_piece_4min", maxSeconds: 240, amountCents: 899, label: "Up to 4 minutes" },
] as const;

/** The ladder that applies to a kind of piece. */
export function tiersFor(kind: PieceKind = "song"): readonly PieceTier[] {
  return kind === "song" ? PIECE_TIERS : SPEECH_TIERS;
}

/** Every lookup key the studio can charge. Used by the checkout allow-list. */
export const PIECE_PRICE_KEYS = [...PIECE_TIERS, ...SPEECH_TIERS].map((t) => t.priceKey);

export const CONCIERGE_FROM_CENTS = 14900;

/** "$9.99" for an amount in cents. */
export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Is this length a free audition rather than a paid piece? */
export function isAudition(seconds: number): boolean {
  return seconds <= AUDITION_MAX_SECONDS;
}

/** The tier that covers this length, or null when it is an audition. */
export function tierForSeconds(seconds: number, kind: PieceKind = "song"): PieceTier | null {
  if (isAudition(seconds)) return null;
  return tiersFor(kind).find((t) => seconds <= t.maxSeconds) ?? null;
}

/** The tier a paid lookup key belongs to, whichever ladder it is on. */
export function tierForPriceKey(priceKey: string): PieceTier | null {
  return (
    PIECE_TIERS.find((t) => t.priceKey === priceKey) ??
    SPEECH_TIERS.find((t) => t.priceKey === priceKey) ??
    null
  );
}

/** Which ladder a paid lookup key sits on. */
export function kindForPriceKey(priceKey: string): PieceKind | null {
  if (PIECE_TIERS.some((t) => t.priceKey === priceKey)) return "song";
  if (SPEECH_TIERS.some((t) => t.priceKey === priceKey)) return "letter";
  return null;
}

/** "$6.99" for a length, or "Free" for an audition. */
export function priceLabelForSeconds(seconds: number, kind: PieceKind = "song"): string {
  const tier = tierForSeconds(seconds, kind);
  return tier ? money(tier.amountCents) : "Free";
}

export const PERSONAL_LICENCE =
  "Personal use licence: you may play, share and include this piece in your own celebrations, cards and slideshows. Resale or commercial broadcast is not included.";
