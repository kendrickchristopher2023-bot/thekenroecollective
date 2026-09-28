/**
 * Duplicate thank-you drafts.
 *
 * Before the composer was linked to a single card, every "Save"/"Schedule" press
 * added a brand new card, so hosts ended up with several near-identical unsent
 * cards for the same note. The overwrite bug was fixed, but the rows that were
 * already created are still sitting in the list, and a duplicated *scheduled*
 * card would send the same thank-you twice.
 *
 * This is the pure rule for finding them, so the UI and the tests agree:
 * - Only unsent cards can be duplicates. Anything already sent is history.
 * - Two cards are the same note when message, sign-off, channel, design, photo,
 *   GIF and recipient list all match.
 * - The keeper is the one that is scheduled (a live instruction) if there is
 *   one, otherwise the most recently created.
 */

export interface DedupeCard {
  id: string;
  message: string;
  signOff?: string;
  channel: string;
  design: string;
  photo?: string;
  gif?: string;
  recipientIds: string[];
  createdAt: string;
  sentAt?: string;
  autoSentAt?: string;
  scheduledFor?: string;
  autoSend?: boolean;
}

function fingerprint(c: DedupeCard): string {
  return JSON.stringify([
    (c.message ?? "").trim(),
    (c.signOff ?? "").trim(),
    c.channel,
    c.design,
    c.photo ?? "",
    c.gif ?? "",
    [...(c.recipientIds ?? [])].sort(),
  ]);
}

const isUnsent = (c: DedupeCard) => !c.sentAt && !c.autoSentAt;
const isScheduled = (c: DedupeCard) => !!c.scheduledFor || !!c.autoSend;

/**
 * Ids of the redundant copies, newest-keeper first. Never returns a sent card,
 * and never returns every copy of a note: one always survives.
 */
export function findDuplicateThankYouCardIds(cards: DedupeCard[]): string[] {
  const groups = new Map<string, DedupeCard[]>();
  for (const c of cards) {
    if (!isUnsent(c)) continue;
    const key = fingerprint(c);
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }

  const drop: string[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const ranked = [...list].sort((a, b) => {
      if (isScheduled(a) !== isScheduled(b)) return isScheduled(a) ? -1 : 1;
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });
    for (const c of ranked.slice(1)) drop.push(c.id);
  }
  return drop;
}
