// Scheduled SMS reminder template. Pure and shared by the host UI (preview +
// persistence) and the cron worker (actual send), so what a host writes is
// literally what a guest receives.

export const REMINDER_SMS_MAX = 320;

/**
 * Default template. Tokens are the only dynamic parts, so a host who never
 * touches this still gets a text that names the event and links the invitation.
 */
export const DEFAULT_REMINDER_SMS = "{event} is {when}. Details: {link}";

export interface ReminderSmsTokens {
  eventTitle?: string;
  whenLabel?: string;
  guestName?: string;
  link?: string;
  hostName?: string;
}

/**
 * Renders a host template. Unknown tokens are left alone (so a typo is visible
 * rather than silently blanking the text), and the result is capped at one
 * multi-segment SMS worth of characters.
 */
export function renderReminderSms(template: string | undefined, t: ReminderSmsTokens): string {
  const src = (template ?? "").trim() || DEFAULT_REMINDER_SMS;
  const map: Record<string, string> = {
    event: (t.eventTitle || "Our event").trim(),
    when: (t.whenLabel || "coming up").trim(),
    name: (t.guestName || "there").trim(),
    link: (t.link || "").trim(),
    host: (t.hostName || "").trim(),
  };
  const out = src.replace(/\{(event|when|name|link|host)\}/g, (_m, k: string) => map[k] ?? _m);
  return out.replace(/[ \t]+/g, " ").trim().slice(0, REMINDER_SMS_MAX);
}

/** True when the template is usable: non-empty after rendering. */
export function isValidReminderSms(template: string | undefined): boolean {
  return renderReminderSms(template, { eventTitle: "x", whenLabel: "y", link: "z" }).length > 0;
}
