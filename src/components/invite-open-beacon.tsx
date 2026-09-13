/**
 * Fires once when a guest opens their personal invitation link.
 *
 * Bot/pre-fetch filtering happens in three layers:
 *  1. This runs in JavaScript after hydration, so pure fetchers never trigger it.
 *  2. It waits for a dwell delay on a visible tab, so background pre-renders and
 *     link-preview fetches (which never stay open) are excluded.
 *  3. The server rejects non-browser user agents and host/co-host callers.
 * A per-tab guard means a refresh does not fire a second time in that session.
 */
import { useEffect } from "react";
import { recordInviteOpen } from "@/lib/invite-opens.functions";
import { INVITE_OPEN_DWELL_MS } from "@/lib/invite-opens";

export function InviteOpenBeacon({ eventId, guestId }: { eventId: string; guestId: string }) {
  useEffect(() => {
    if (!eventId || !guestId) return;
    const key = `kc:invite-open:${eventId}:${guestId}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* private mode: fall through, the server still dedupes into one row */
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
      recordInviteOpen({ data: { eventId, guestId } }).catch(() => {
        /* tracking must never surface an error to a guest */
      });
    }, INVITE_OPEN_DWELL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [eventId, guestId]);

  return null;
}
