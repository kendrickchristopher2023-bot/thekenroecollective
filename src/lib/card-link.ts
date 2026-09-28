/**
 * The printed business card carries one short address: /card
 *
 * The card is permanent once printed, so the destination must never be
 * hardcoded. It is stored in site settings and can be repointed at any time
 * without reprinting anything. The tracking parameters are appended by the
 * server on the way out, so the printed URL stays short and the QR code stays
 * sparse enough to scan at 20 mm.
 */

/**
 * Where /card points until an owner changes it.
 *
 * It lands on the digital business card, not on a demo invitation: somebody who
 * has just been handed a card wants to know who they met before they want a
 * product tour. The card page offers the demo invitation as a second action.
 */
export const DEFAULT_CARD_DESTINATION = "/card/christopher";

/** Campaign label appended to the destination for attribution. */
export const DEFAULT_CARD_CAMPAIGN = "business-card";

/** The single short address printed on the card. */
export const CARD_SHORT_URL = "https://thekenroecollective.com/card";

/**
 * Only same-site destinations are allowed. A settings field that could point
 * anywhere is an open redirect, and this one is reachable by anybody.
 */
export function isAllowedCardDestination(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("/") && !v.startsWith("//")) return true;
  try {
    const url = new URL(v);
    if (url.protocol !== "https:") return false;
    return /(^|\.)(thekenroecollective\.com|kenroecollective\.com|kenroes\.com)$/i.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Build the absolute redirect target, with attribution attached server-side.
 * Existing query parameters on the stored destination are preserved.
 */
export function buildCardRedirectUrl(destination: string, origin: string, campaign: string): string {
  const base = destination.startsWith("/") ? new URL(destination, origin) : new URL(destination);
  if (!base.searchParams.has("utm_source")) base.searchParams.set("utm_source", campaign);
  if (!base.searchParams.has("utm_medium")) base.searchParams.set("utm_medium", "print");
  if (!base.searchParams.has("utm_campaign")) base.searchParams.set("utm_campaign", campaign);
  return base.toString();
}
