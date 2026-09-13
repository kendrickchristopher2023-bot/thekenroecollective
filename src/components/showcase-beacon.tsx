/**
 * Counting on the public sample invitation only.
 *
 * Opens, play presses and sign-up taps on the showcase go to their own table,
 * never into any customer's numbers. Same dwell-and-visibility rules as the
 * guest open beacon so link previews and pre-fetches do not count.
 */
import { useEffect } from "react";
import { recordShowcaseInteraction } from "@/lib/showcase.functions";
import { INVITE_OPEN_DWELL_MS } from "@/lib/invite-opens";

export function countShowcase(kind: "open" | "play" | "cta"): Promise<void> {
  return recordShowcaseInteraction({ data: { kind } })
    .then(() => undefined)
    .catch(() => {
      /* counting must never surface an error to a visitor */
    });
}

export function ShowcaseOpenBeacon() {
  useEffect(() => {
    const key = "kc:showcase-open";
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* private mode: fall through */
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
      void countShowcase("open");
    }, INVITE_OPEN_DWELL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
