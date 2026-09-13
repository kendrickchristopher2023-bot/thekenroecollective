/**
 * Add-on gates that run on the generic event save.
 *
 * The paywall for bulk guest import is the importer itself (the spreadsheet
 * path calls the server before it reads a single row). The generic save only
 * refuses a jump nobody typing by hand could produce, so a host adding a few
 * guests between syncs, or catching up after being offline, is never stranded.
 *
 * The thank-you comparison ignores key order: the stored copy comes back from a
 * jsonb column and Postgres reorders object keys, so a byte-for-byte compare
 * called identical cards "changed" and refused every save for a host whose
 * studio access had lapsed. Only a card added, edited or sent counts.
 */

/** More new guests in one save than anyone types by hand between autosaves. */
export const HAND_TYPED_GUEST_JUMP = 50;

export function guestJumpNeedsImport(oldCount: number, nextCount: number): boolean {
  return nextCount - oldCount > HAND_TYPED_GUEST_JUMP;
}

/** Stable JSON: keys sorted, undefined dropped, so jsonb round-trips compare equal. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

type CardLike = { id?: unknown } & Record<string, unknown>;

function cardsById(list: unknown): Map<string, CardLike> {
  const map = new Map<string, CardLike>();
  if (!Array.isArray(list)) return map;
  list.forEach((c, i) => {
    const card = (c && typeof c === "object" ? c : {}) as CardLike;
    const id = typeof card.id === "string" && card.id ? card.id : `#${i}`;
    map.set(id, card);
  });
  return map;
}

/**
 * True only when the save adds a thank-you card, edits one, or marks one sent.
 * Removing a card, or saving the same cards back in a different key order,
 * is not use of the studio and must never be refused.
 */
export function thankYouMeaningfullyChanged(oldCards: unknown, nextCards: unknown): boolean {
  const before = cardsById(oldCards);
  const after = cardsById(nextCards);
  for (const [id, card] of after) {
    const prev = before.get(id);
    if (!prev) return true;
    if (canonicalJson(prev) !== canonicalJson(card)) return true;
  }
  return false;
}
