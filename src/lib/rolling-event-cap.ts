// Postcard (free) tier rolling creation cap.
//
// Two separate limits apply to Postcard:
//  1. activeEvents (tier-limits.ts): 1 event live at a time. Archiving an
//     event frees this slot.
//  2. The rolling creation cap below: 3 NEW events per rolling 12 months.
//     Archived AND deleted-from-view events still count here, so the cap
//     can't be reset by archiving and recreating.
//
// Pure functions only — enforced server-side in events-sync.functions.ts.

export const POSTCARD_ROLLING_CREATE_LIMIT = 3;
export const ROLLING_WINDOW_DAYS = 365;

const DAY_MS = 86_400_000;

/** Start of the rolling window: events created on/after this date count. */
export function rollingWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - ROLLING_WINDOW_DAYS * DAY_MS);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * When the next creation slot opens: the OLDEST creation inside the window
 * ages out 12 months after it happened. `createdAts` may be in any order.
 */
export function nextSlotOpensAt(createdAts: (string | Date)[], now: Date = new Date()): Date | null {
  const start = rollingWindowStart(now).getTime();
  const inWindow = createdAts
    .map((v) => new Date(v).getTime())
    .filter((t) => Number.isFinite(t) && t >= start)
    .sort((a, b) => a - b);
  if (inWindow.length === 0) return null;
  return new Date(inWindow[0]! + ROLLING_WINDOW_DAYS * DAY_MS);
}

/**
 * Host-facing explanation. Names the window, the count, the fact archiving
 * doesn't reset it, and the exact date their next free slot opens.
 */
export function rollingCapMessage(createdAts: (string | Date)[], now: Date = new Date()): string {
  const used = createdAts.filter((v) => new Date(v).getTime() >= rollingWindowStart(now).getTime()).length;
  const next = nextSlotOpensAt(createdAts, now);
  const parts = [
    `Postcard (free) includes ${POSTCARD_ROLLING_CREATE_LIMIT} new events per rolling 12 months, and you've created ${used} since ${formatDate(rollingWindowStart(now))}.`,
    "This counts every event you've created in the last 12 months, including ones you archived, so archiving frees your active-event slot but does not free a new-event slot.",
  ];
  if (next) parts.push(`Your next free event slot opens ${formatDate(next)}.`);
  parts.push("Upgrade to Whisper to create events right away.");
  return parts.join(" ");
}
