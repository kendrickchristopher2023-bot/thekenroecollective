// Pure link helpers for Schedules. Long token links keep working forever;
// texts use the short forms because every character costs.

export const SCHEDULE_SITE_ORIGIN = "https://thekenroecollective.com";

/** 10 characters, letters and digits, no 0 O 1 l I. Matches gen_schedule_short_code(). */
export const SHORT_CODE_RE = /^[2-9A-HJ-NP-Za-km-z]{10}$/;

export function personPageLink(token: string): string {
  return `${SCHEDULE_SITE_ORIGIN}/sc/${token}`;
}
export function calendarLink(token: string): string {
  return `${SCHEDULE_SITE_ORIGIN}/api/public/schedule-calendar/${token}`;
}
export function shortPersonLink(code: string): string {
  return `${SCHEDULE_SITE_ORIGIN}/a/${code}`;
}
export function shortCalendarLink(code: string): string {
  return `${SCHEDULE_SITE_ORIGIN}/cal/${code}`;
}

/** Short links when the person has a code, long links otherwise. */
export function textLinks(person: { rsvp_token: string; short_code?: string | null }) {
  const code = person.short_code && SHORT_CODE_RE.test(person.short_code) ? person.short_code : null;
  return {
    rsvp: code ? shortPersonLink(code) : personPageLink(person.rsvp_token),
    calendar: code ? shortCalendarLink(code) : calendarLink(person.rsvp_token),
  };
}

/** Same length as a real short link, for previews before a person exists. */
export const SAMPLE_SHORT_CODE = "AbCd2345Xy";

/** Marker the email template swaps for a "Will you be there?" link. */
export const EMAIL_RSVP_MARK = "[[rsvp_link]]";

/** "https://x.com/a/abc." -> "https://x.com/a/abc ." so phones do not swallow the punctuation. */
export function spaceLinkPunctuation(text: string): string {
  return text.replace(/(https?:\/\/[^\s]*[^\s.,])([.,]+)(?=\s|$)/g, "$1 $2");
}
