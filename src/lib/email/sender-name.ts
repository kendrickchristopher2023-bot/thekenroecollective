/**
 * Sender display-name builder.
 *
 * Guests do not recognise "The Kenroe Collective" — they recognise the host and
 * the occasion. Every guest-facing send should therefore lead with the host and
 * event, keeping the platform only as the underlying (DKIM-signed) domain.
 *
 * The display name is the only part of the From: header we vary. The address and
 * the signing domain stay on the verified sender domain, so SPF/DKIM/DMARC
 * alignment is unaffected by anything here.
 */
import { SITE_NAME } from "@/lib/email/sender-domain";

const MAX = 64;

/** Strip characters that would break or spoof a From: header. */
export function sanitizeSenderName(raw: string): string {
  const cleaned = raw
    .replace(/[\r\n]+/g, " ")
    .replace(/["<>@,;:\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > MAX ? `${cleaned.slice(0, MAX - 1).trim()}…` : cleaned;
}

export interface SenderNameParts {
  /** Host-chosen override, e.g. "Kendrick Family Reunion". Wins when set. */
  override?: string | null;
  hostName?: string | null;
  eventTitle?: string | null;
}

/**
 * Preference order:
 *   1. host override
 *   2. "Christopher Kendrick (Kendrick Family Reunion 2027)"
 *   3. event title alone
 *   4. host name alone
 *   5. the platform name
 */
export function buildSenderName({ override, hostName, eventTitle }: SenderNameParts): string {
  const o = sanitizeSenderName(override || "");
  if (o) return o;

  const host = sanitizeSenderName(hostName || "");
  const title = sanitizeSenderName(eventTitle || "");

  if (host && title) return sanitizeSenderName(`${host} (${title})`);
  if (title) return title;
  if (host) return host;
  return SITE_NAME;
}
