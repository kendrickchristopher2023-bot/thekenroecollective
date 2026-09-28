/**
 * "Completion moments" — the positive counterpart to our upgrade gates.
 *
 * A moment is shown AFTER a host finishes something real on the free plan.
 * It never gates or removes anything they already built: it summarises the
 * work (proof first), then makes ONE contextual suggestion about the next
 * tier. Definitions live here as pure data so they are testable and so new
 * moments (guest list size, post-event wrap-up) drop in without new UI.
 */

export type MomentTier = "postcard" | "whisper" | "host" | "atelier";

export type MomentStat = { label: string; value: string };

export interface CompletionMomentDef {
  /** Stable id, used for the "seen once" key. */
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  /** Proof of the work they just did. Rendered above the ask. */
  stats: MomentStat[];
  /** Tier the ask points at. */
  targetTier: Exclude<MomentTier, "postcard">;
  /** What they keep, for free, forever. Written for this activity. */
  youHave: string[];
  /** What the target tier adds for THIS activity, not a generic list. */
  unlocks: string[];
  continueLabel?: string;
}

export const MOMENT_TIER_RANK: Record<MomentTier, number> = {
  postcard: 0,
  whisper: 1,
  host: 2,
  atelier: 3,
};

/**
 * Owners and anyone already on (or above) the target tier get the
 * congratulations-only variant. Nothing kills the tone faster than
 * upselling a paying customer their own plan.
 */
export function shouldShowUpgrade(
  currentTier: MomentTier | null,
  targetTier: MomentTier,
  isOwner = false,
): boolean {
  if (isOwner) return false;
  if (!currentTier) return false;
  return MOMENT_TIER_RANK[currentTier] < MOMENT_TIER_RANK[targetTier];
}

export function momentSeenKey(momentId: string, eventId: string): string {
  return `kc:moment:${momentId}:${eventId}`;
}

/**
 * Dismissals are deliberately temporary. A host who hides a moment today
 * should see it again later once the work (and the plan question) has moved
 * on, so we store a timestamp and expire it after this window.
 */
export const MOMENT_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Value written on dismiss. Kept as a string so old "1" values still parse. */
export function momentDismissValue(now = Date.now()): string {
  return String(now);
}

/**
 * True when a stored dismissal should still hide the moment.
 * Legacy permanent values ("1") are treated as expired, so the old
 * indefinitely-collapsed state heals itself on the next render.
 */
export function isMomentDismissActive(raw: string | null, now = Date.now()): boolean {
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  if (ts > now) return false;
  return now - ts < MOMENT_DISMISS_TTL_MS;
}


/* ---------------- Potluck sign-up sheet ---------------- */

export interface BringMomentTotals {
  items: number;
  slotsNeeded: number;
  claimed: number;
  openSlots: number;
  people: number;
}

/** A bring list only "completes" once it is a real list. */
export const BRING_MOMENT_MIN_ITEMS = 5;

export function buildBringSheetMoment(
  totals: BringMomentTotals,
  eventTitle?: string,
): CompletionMomentDef | null {
  if (totals.items < BRING_MOMENT_MIN_ITEMS) return null;
  const stats: MomentStat[] = [
    { label: "Items on the list", value: String(totals.items) },
    { label: "Spots claimed", value: `${totals.claimed}/${totals.slotsNeeded}` },
    { label: "Still open", value: String(totals.openSlots) },
    { label: totals.people === 1 ? "Guest helping" : "Guests helping", value: String(totals.people) },
  ];
  return {
    id: "bring-sheet-ready",
    eyebrow: "Nicely done",
    title: eventTitle ? `Your bring list for ${eventTitle} is ready` : "Your bring list is ready",
    body: "Share the link and guests can start claiming items. This sheet is yours on every plan, free ones included.",
    stats,
    targetTier: "host",
    youHave: [
      "The sheet stays live, with unlimited guest sign-ups",
      "PDF, Excel and Word exports plus the reusable template",
      "Email nudges to guests who have not claimed anything",
    ],
    unlocks: [
      "Text message nudges, so the list fills without chasing",
      "No Kenroe Collective badge on the sheet or the invite",
      "Up to 10 events and 750 guests each, for the next gathering",
    ],
    continueLabel: "Not now, keep editing",
  };
}

/* ---------------- Event setup wizard ---------------- */

export interface EventMomentFacts {
  guests: number;
  confirmed: number;
  hasPhoto: boolean;
  registryLinks: number;
  remindersSet: number;
  bringItems: number;
}

export function buildEventReadyMoment(
  facts: EventMomentFacts,
  eventTitle?: string,
): CompletionMomentDef {
  const stats: MomentStat[] = [
    { label: "Guests invited", value: String(facts.guests) },
    { label: "Already confirmed", value: String(facts.confirmed) },
    { label: "Reminders queued", value: String(facts.remindersSet) },
    { label: "Bring list items", value: String(facts.bringItems) },
  ];
  return {
    id: "event-ready",
    eyebrow: "Your gathering is built",
    title: eventTitle ? `${eventTitle} is ready to send` : "Your gathering is ready to send",
    body: "Everything below is saved and stays yours. Nothing here expires or locks when you decide about a plan.",
    stats,
    targetTier: facts.guests > 75 ? "host" : "whisper",
    youHave: [
      "Your invite page, RSVP tracking, email invitations and shareable link",
      "Plus-one controls, capacity cap and RSVP deadline",
      "The bring list and everything you have written so far",
    ],
    unlocks:
      facts.guests > 75
        ? [
            "Room for this guest list, up to 750 people",
            "Text reminders and scheduled nudges on top of email",
            "Payment collection, exports and no Kenroe badge",
          ]
        : [
            "A co-host seat so someone can help you run it",
            "Registry and gift links on the invite",
            "Up to 3 events and 150 guests each",
          ],
    continueLabel: "Not now, send it as it is",
  };
}
