import { fetchOwnedEventById } from "@/lib/events-sync.functions";
import type { KEvent } from "@/lib/events-store";

/**
 * Resolve the AUTHORITATIVE door check-in token for an event.
 *
 * The token lives in a server-managed column (`events.share_token`), not inside
 * the event JSON, so a locally cached copy of an event can easily be missing it.
 * Printable guest QR cards used to be generated straight from that cached copy:
 * when the token was absent the link was silently written without `?t=`, and
 * every printed card landed on "This link needs a fresh access code".
 *
 * Always resolve through here before writing a check-in URL, so a card is either
 * correct or not produced at all.
 */
export async function resolveDoorToken(
  event: Pick<KEvent, "shareToken">,
  eventId: string,
): Promise<string> {
  const cached = event.shareToken?.trim();
  if (cached) return cached;

  try {
    const fresh = (await fetchOwnedEventById({ data: { id: eventId } })) as
      | { shareToken?: string | null }
      | null;
    const token = fresh?.shareToken?.trim();
    if (token) return token;
  } catch {
    /* fall through to the explicit error below */
  }

  throw new Error(
    "We couldn't read this event's door access code, so the QR codes would not have worked. Reload the page and try again.",
  );
}
