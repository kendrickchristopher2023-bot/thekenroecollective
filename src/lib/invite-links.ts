/**
 * Personalized invitation links.
 *
 * A guest who receives their own link should never be asked to search for
 * their own name. The link therefore carries the guest id (`?g=`), and the
 * emailed Yes / Maybe / No buttons carry the answer too (`&rsvp=`), so one tap
 * in the inbox records the RSVP.
 *
 * The guest id is not a secret — it already appears in check-in and payment
 * links — and the only thing it unlocks is that guest's own RSVP row, which is
 * exactly what a forwarded paper invitation would do. The invitation page shows
 * a plain "Not you?" escape for the forwarded-link case.
 */

export type QuickRsvpAnswer = "yes" | "maybe" | "no";

export const QUICK_RSVP_ANSWERS: QuickRsvpAnswer[] = ["yes", "maybe", "no"];

/** Is this a valid one-tap answer from a link? */
export function isQuickRsvpAnswer(value: unknown): value is QuickRsvpAnswer {
  return value === "yes" || value === "maybe" || value === "no";
}

/** `/invite/abc` + guest → `/invite/abc?g=g_123` */
export function personalInviteUrl(base: string, guestId: string): string {
  if (!guestId) return base;
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}g=${encodeURIComponent(guestId)}`;
}

/** One-tap RSVP link for the emailed Yes / Maybe / No buttons. */
export function oneTapRsvpUrl(base: string, guestId: string, answer: QuickRsvpAnswer): string {
  return `${personalInviteUrl(base, guestId)}&rsvp=${answer}`;
}

/** All three one-tap links, ready to spread into email template data. */
export function oneTapRsvpUrls(base: string, guestId: string) {
  return {
    rsvpYesUrl: oneTapRsvpUrl(base, guestId, "yes"),
    rsvpMaybeUrl: oneTapRsvpUrl(base, guestId, "maybe"),
    rsvpNoUrl: oneTapRsvpUrl(base, guestId, "no"),
  };
}

/** Traditional RSVP card wording, familiar to guests of every age. */
export function answerLabel(answer: QuickRsvpAnswer): string {
  return answer === "yes"
    ? "Joyfully accepts"
    : answer === "maybe"
      ? "Will try to make it"
      : "Regretfully declines";
}

