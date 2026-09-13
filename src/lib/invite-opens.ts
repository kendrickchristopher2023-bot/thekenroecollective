/**
 * Invitation open tracking — shared, pure helpers.
 *
 * What this is: when a guest opens their PERSONAL invitation link (the one
 * carrying `?g=<guestId>`), we record one row per guest with a first-open time,
 * a last-open time and a count. That gives a host the single most useful list
 * they can have: "opened the invitation but never answered".
 *
 * What this is NOT: there is no email tracking pixel, no IP address, no device
 * fingerprint and no location. Guest id plus timestamps, nothing else.
 */

/**
 * Tracking went live with this deploy. Anything before it is honestly reported
 * as "not tracked" rather than "never opened", so a host never chases a
 * relative who actually did open the invitation.
 */
export const INVITE_OPEN_TRACKING_START = "2026-08-27T00:00:00.000Z";

/** Minimum dwell time before an open is recorded (bot filter, see below). */
export const INVITE_OPEN_DWELL_MS = 2500;

export interface InviteOpenRow {
  guestId: string;
  firstOpenedAt: string;
  lastOpenedAt: string;
  openCount: number;
}

export type OpenState = "opened" | "never" | "untracked";

export interface GuestOpenStatus {
  guestId: string;
  state: OpenState;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
}

/**
 * Non-human traffic that pre-fetches links. Corporate mail filters, Outlook
 * Safe Links, Slack/iMessage/WhatsApp unfurlers and crawlers all hit invitation
 * URLs with no person involved. Counting them would make the host chase people
 * who never saw the invitation.
 */
const BOT_UA = [
  "bot",
  "crawler",
  "spider",
  "preview",
  "slurp",
  "headless",
  "phantomjs",
  "puppeteer",
  "playwright",
  "curl",
  "wget",
  "python-requests",
  "okhttp",
  "axios",
  "go-http-client",
  "java/",
  "libwww",
  "httpclient",
  "facebookexternalhit",
  "facebookcatalog",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "discordbot",
  "slackbot",
  "skypeuripreview",
  "bingpreview",
  "google-safety",
  "googledocs",
  "microsoftpreview",
  "safelinks",
  "proofpoint",
  "mimecast",
  "barracuda",
  "symantec",
  "mailruncher",
  "yandex",
  "ahrefs",
  "semrush",
  "petalbot",
  "applebot",
];

/** Heuristic bot filter, applied server-side before anything is written. */
export function isLikelyBotUserAgent(ua: string | null | undefined): boolean {
  const s = (ua ?? "").toLowerCase().trim();
  if (!s) return true; // no user agent at all: never a real browser session
  if (!s.includes("mozilla/")) return true; // real browsers all send this
  return BOT_UA.some((needle) => s.includes(needle));
}

/**
 * Join the stored open rows onto the guest list.
 * `eventCreatedAt` decides whether a missing row means "never opened" or
 * "not tracked" (event predates tracking).
 */
export function buildGuestOpenStatuses(
  guestIds: string[],
  rows: InviteOpenRow[],
  eventCreatedAt?: string | null,
): Map<string, GuestOpenStatus> {
  const byId = new Map(rows.map((r) => [r.guestId, r]));
  const predatesTracking =
    !!eventCreatedAt && new Date(eventCreatedAt).getTime() < new Date(INVITE_OPEN_TRACKING_START).getTime();

  const out = new Map<string, GuestOpenStatus>();
  for (const id of guestIds) {
    const row = byId.get(id);
    if (row) {
      out.set(id, {
        guestId: id,
        state: "opened",
        firstOpenedAt: row.firstOpenedAt,
        lastOpenedAt: row.lastOpenedAt,
        openCount: Math.max(1, row.openCount),
      });
    } else {
      out.set(id, {
        guestId: id,
        state: predatesTracking ? "untracked" : "never",
        firstOpenedAt: null,
        lastOpenedAt: null,
        openCount: 0,
      });
    }
  }
  return out;
}

/**
 * Product-health signal: an event where lots of guests opened the invitation
 * and never answered is a broken RSVP flow, not rude guests.
 */
export function openWithoutAnswerRate(openedCount: number, openedButPendingCount: number): number {
  if (openedCount <= 0) return 0;
  return openedButPendingCount / openedCount;
}

/** Threshold at which the ratio is worth flagging to the owner. */
export const OPEN_NO_ANSWER_ALERT_RATE = 0.4;
export const OPEN_NO_ANSWER_ALERT_MIN_OPENS = 8;

export function isRsvpFlowRedFlag(openedCount: number, openedButPendingCount: number): boolean {
  if (openedCount < OPEN_NO_ANSWER_ALERT_MIN_OPENS) return false;
  return openWithoutAnswerRate(openedCount, openedButPendingCount) >= OPEN_NO_ANSWER_ALERT_RATE;
}
