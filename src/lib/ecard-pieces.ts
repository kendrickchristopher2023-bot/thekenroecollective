// Group eCards — several Sound Studio pieces on one card. Pure and client safe,
// so the organizer panel and the server functions agree on the rules.

/** Most pieces one card can carry. Keeps the reveal page a listening moment, not a playlist. */
export const ECARD_MAX_PIECES = 10;

export type PieceEligibility = { ok: true } | { ok: false; reason: "unpaid" | "demo" | "removed" };

/**
 * Can this piece go on a card? Owners (Chris and Adrian, the `owner` role)
 * can add any of their own pieces. Everyone else can only add a piece that
 * was paid for and not refunded, so nothing reaches a card before payment.
 */
export function pieceEligibility(input: {
  owner: boolean;
  paid: boolean;
  isDemo: boolean;
  removed: boolean;
}): PieceEligibility {
  if (input.removed) return { ok: false, reason: "removed" };
  if (input.owner) return { ok: true };
  if (input.isDemo) return { ok: false, reason: "demo" };
  if (!input.paid) return { ok: false, reason: "unpaid" };
  return { ok: true };
}

export const PIECE_INELIGIBLE_MESSAGE: Record<"unpaid" | "demo" | "removed", string> = {
  unpaid: "Pay for this piece in Kenroe Sound Studio first, then add it to the card.",
  demo: "Test pieces can't go on a card. Make a full piece in Kenroe Sound Studio.",
  removed: "That piece has been taken down, so it can't go on a card.",
};

/** A song repeats under the card only when it is the one and only piece. */
export function pieceLoops(kind: string, pieceCount: number): boolean {
  return kind === "song" && pieceCount === 1;
}
