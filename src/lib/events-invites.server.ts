import { getRequest } from "@tanstack/react-start/server";
import { formatEventForMessage } from "@/lib/datetime";

export function getRequestOrigin(): string {
  try {
    const req = getRequest();
    if (req?.url) {
      const u = new URL(req.url);
      return `${u.protocol}//${u.host}`;
    }
  } catch {
    /* no request context */
  }
  return "https://thekenroecollective.com";
}

/**
 * Format an event's date/time for an email or SMS.
 *
 * Delegates to src/lib/datetime.ts, the one approved formatter, so an email can
 * never disagree with the invitation page. The `time` field carries no zone
 * label for legacy callers; prefer `timeWithZone`, which does.
 */
export function formatInviteDate(
  iso?: string,
  timezone?: string,
): { date: string; time: string; timeWithZone: string; full: string } {
  return formatEventForMessage(iso, timezone);
}

