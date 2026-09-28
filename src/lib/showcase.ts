/**
 * The public showcase invitation.
 *
 * One purpose-built, entirely fictional event that the printed business card
 * points at. It exists so a stranger who scans a card can see the whole product
 * working, without any real person's data being the marketing material: the
 * Kendrick Family Reunion holds 210 real family records, so every change to the
 * privacy model would have to be re-audited against relatives. This event has
 * invented names, invented addresses, reserved-range phone numbers and
 * generated imagery, so there is nothing to leak.
 *
 * The read/write line, which matters more than anything else here:
 *  - Interactive where the result is PRIVATE to the viewer (RSVP confirmation,
 *    seating chart, playing audio, browsing the wall). Nothing persists.
 *  - Read-only where the result is PUBLIC (comments, well wishes, photo
 *    uploads, bring-list claims). A stranger must never be able to put text in
 *    front of the next person who scans a card.
 *
 * Prevention is enforced in three layers, deepest first:
 *  1. Database triggers refuse every write touching this event id.
 *  2. The public write server functions refuse before they reach the database.
 *  3. The invitation UI hides or disables the write controls.
 *
 * Keep this file free of server-only imports: both the browser bundle and the
 * server functions import it.
 */

/** The showcase event id, which is also its /invite/<id> address. */
export const SHOWCASE_EVENT_ID = "showcase-wedding";

/** Guest-facing path for the showcase invitation. */
export const SHOWCASE_PATH = `/invite/${SHOWCASE_EVENT_ID}`;

/** True when this event id is the public showcase. */
export function isShowcaseEvent(eventId?: string | null): boolean {
  if (!eventId) return false;
  return eventId.trim().toLowerCase() === SHOWCASE_EVENT_ID;
}

/**
 * What a viewer is told when they try to post something public here. Calm and
 * short: this is a sample, not a failure.
 */
export const SHOWCASE_READONLY_MESSAGE =
  "This is a sample invitation, so posts stay switched off. On your own event, this is where guests write.";

/** The small, confident line shown near the top of the showcase. */
export const SHOWCASE_SAMPLE_NOTE =
  "A sample invitation. Everyone here is invented, so look around freely.";

/**
 * Refusal shape returned by the public write server functions. They return
 * rather than throw, so the interface can say something graceful.
 */
export function showcaseRefusal(): { ok: false; error: string } {
  return { ok: false, error: SHOWCASE_READONLY_MESSAGE };
}
