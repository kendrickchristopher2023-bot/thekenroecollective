// Pure message helpers for Schedules: default reminder plan, merge fields,
// quiet hours and the first-text compliance line. Shared by UI and engine.

import { eventTimeZone } from "@/lib/datetime";
import { spaceLinkPunctuation } from "@/lib/schedule-links";

export interface StepDraft {
  offset_minutes: number;
  channel: "email" | "sms";
  is_starting_now: boolean;
  subject: string | null;
  body: string;
  position: number;
  /** "no_answer" sends only to people who have not answered for that date. */
  audience?: "all" | "no_answer";
}

export const MERGE_FIELDS = ["first_name", "title", "when", "join", "meeting_id", "passcode", "description", "calendar", "rsvp", "host", "host_name", "host_phone", "host_email", "host_note"] as const;

export const DEFAULT_STEPS: StepDraft[] = [
  {
    offset_minutes: -7 * 24 * 60,
    channel: "email",
    is_starting_now: false,
    subject: "Coming up next week: {title}",
    body: "Hi {first_name},\n\nA reminder that {title} is {when}.\n\nJoin: {join}\n\nWill you be there? Let us know: {rsvp}\n\nAdd it to your calendar: {calendar}\n\nSee you there,\n{host}",
    position: 0,
  },
  { offset_minutes: -24 * 60, channel: "sms", is_starting_now: false, subject: null, body: "Hi {first_name}, {title} is tomorrow, {when}. Join: {join} Will you be there? {rsvp}", position: 1 },
  { offset_minutes: -60, channel: "sms", is_starting_now: false, subject: null, body: "{title} starts in 1 hour ({when}). Join: {join}", position: 2 },
  { offset_minutes: 0, channel: "sms", is_starting_now: true, subject: null, body: "{title} is starting now. Join: {join}", position: 3 },
];

/** Complete default for a one-off Send now text. Calendar is intentionally omitted to prioritize RSVP and meeting details. */
export const DEFAULT_MANUAL_SMS = "Hi {first_name},\n\n{title} is {when}.\n\n{description}\n\nJoin meeting: {join}\n\nRSVP: {rsvp}";

/** Offered on the Reminders tab: a text 2 days before, only to people who have not answered. */
export const NUDGE_STEP: StepDraft = {
  offset_minutes: -2 * 24 * 60,
  channel: "sms",
  is_starting_now: false,
  subject: null,
  body: "Hi {first_name}, are you joining {title} on {when}? Reply 1 if you will attend, 2 if you may, 3 if you cannot. Or tap {rsvp}",
  position: 0,
  audience: "no_answer",
};

/** Words and numbers a person can text back to answer. Order matters: exact numbers first. */
const REPLY_YES = new Set(["1", "yes", "y", "yep", "yeah", "yes!", "will", "will attend", "i will", "i will attend", "i'll be there", "ill be there", "attending", "count me in", "si", "sí"]);
const REPLY_MAYBE = new Set(["2", "maybe", "m", "may", "may attend", "might", "not sure", "unsure", "tal vez", "quizas", "quizás"]);
const REPLY_NO = new Set(["3", "no", "n", "nope", "cannot", "cannot attend", "can't", "cant", "can't make it", "cant make it", "can't attend", "cant attend", "not coming", "won't make it", "wont make it", "no thanks"]);

export function parseReplyAnswer(body: string): "yes" | "maybe" | "no" | null {
  const c = String(body ?? "").trim().toLowerCase().replace(/[’]/g, "'").replace(/[.!,]+$/, "").replace(/\s+/g, " ");
  if (REPLY_YES.has(c)) return "yes";
  if (REPLY_MAYBE.has(c)) return "maybe";
  if (REPLY_NO.has(c)) return "no";
  return null;
}

export interface MergeValues {
  first_name?: string | null;
  title?: string | null;
  when?: string | null;
  join?: string | null;
  meeting_id?: string | null;
  passcode?: string | null;
  description?: string | null;
  calendar?: string | null;
  rsvp?: string | null;
  host?: string | null;
  host_name?: string | null;
  host_phone?: string | null;
  host_email?: string | null;
  host_note?: string | null;
}

export function renderTemplate(tpl: string, v: MergeValues): string {
  const hasMeetingId = tpl.includes("{meeting_id}") || (tpl.includes("{description}") && labeledValueIn(v.description, "Meeting ID", v.meeting_id));
  const hasPasscode = tpl.includes("{passcode}") || (tpl.includes("{description}") && labeledValueIn(v.description, "Passcode", v.passcode));
  const join = [(v.join || "see the invitation").trim(), !hasMeetingId && v.meeting_id ? `Meeting ID: ${v.meeting_id.trim()}` : "", !hasPasscode && v.passcode ? `Passcode: ${v.passcode.trim()}` : ""].filter(Boolean).join("\n");
  const map: Record<string, string> = {
    first_name: (v.first_name || "there").trim(),
    title: (v.title || "Our call").trim(),
    when: (v.when || "").trim(),
    join,
    meeting_id: (v.meeting_id || "").trim(),
    passcode: (v.passcode || "").trim(),
    description: (v.description || "").trim(),
    calendar: (v.calendar || "").trim(),
    rsvp: (v.rsvp || "").trim(),
    host: (v.host || "").trim(),
    host_name: (v.host_name || v.host || "").trim(),
    host_phone: (v.host_phone || "").trim(),
    host_email: (v.host_email || "").trim(),
    host_note: (v.host_note || "").trim(),
  };
  return tpl.replace(/\{(first_name|title|when|join|meeting_id|passcode|description|calendar|rsvp|host_name|host_phone|host_email|host_note|host)\}/g, (_m, k: string) => map[k] ?? _m);
}

function labeledValueIn(text: string | null | undefined, label: string, value: string | null | undefined): boolean {
  return !!text && !!value && text.toLocaleLowerCase().includes(`${label}:`.toLocaleLowerCase()) && text.includes(value.trim());
}

export function formatZoomMeetingId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 9 || digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  return value.trim();
}

/** Extracts a public meeting identifier. Password-bearing URL parameters are intentionally ignored. */
export function meetingIdFromUrl(value: string | null | undefined): string | null {
  let url: URL;
  try { url = new URL(normalizeJoinUrl(value) || ""); } catch { return null; }
  const host = url.hostname.toLocaleLowerCase();
  if (host.endsWith("zoom.us")) {
    const id = url.pathname.match(/\/j\/(\d{9,11})(?:\/|$)/i)?.[1];
    return id ? formatZoomMeetingId(id) : null;
  }
  if (host === "meet.google.com") {
    const code = url.pathname.split("/").filter(Boolean)[0];
    return code && /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(code) ? code : null;
  }
  if (host.endsWith("teams.microsoft.com")) {
    const queryId = url.searchParams.get("meetingId");
    if (queryId) return queryId;
    const pathId = url.pathname.match(/\/meetup-join\/([^/?]+)/i)?.[1];
    return pathId ? decodeURIComponent(pathId) : null;
  }
  return null;
}

export function scheduleJoinDetails(s: any) {
  let join = "";
  try { join = normalizeJoinUrl(s?.join_url) || ""; } catch { join = ""; }
  return { join, meetingId: String(s?.meeting_id || "").trim(), passcode: String(s?.meeting_passcode || "").trim(), dialIn: String(s?.dial_in || "").trim(), dialPin: String(s?.dial_pin || "").trim(), location: String(s?.location || "").trim() };
}

export function scheduleJoinLines(s: any): string[] {
  const d = scheduleJoinDetails(s);
  return [d.join ? `Join: ${d.join}` : "", d.meetingId ? `Meeting ID: ${d.meetingId}` : "", d.passcode ? `Passcode: ${d.passcode}` : "", d.dialIn ? `Dial in: ${d.dialIn}${d.dialPin ? `, PIN ${d.dialPin}` : ""}` : "", !d.join && !d.dialIn && d.location ? `Location: ${d.location}` : ""].filter(Boolean);
}

export function withoutMeetingCredentialLines(value: string | null | undefined): string {
  return String(value || "").split("\n").filter((line) => !/^\s*(meeting id|passcode)\s*:/i.test(line)).join("\n").trim();
}

/** Removes protected values from editable copy so they can be appended once, intact. */
export function withoutProtectedLines(rendered: string, protectedLines: string[]): string {
  let freeText = rendered;
  for (const line of protectedLines) {
    const value = line.slice(line.indexOf(":") + 1).trim();
    freeText = freeText.includes(line) ? freeText.replace(line, "") : freeText.replace(value, "");
  }
  return freeText.replace(/(^|\n)\s*(Join(?: meeting)?|RSVP|Meeting ID|Passcode):\s*(?=\n|$)/gi, "$1").replace(/\n{3,}/g, "\n\n").trim();
}

export interface HostDetails {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  note?: string | null;
}

export function hostFromSchedule(s: any): HostDetails | null {
  const h = { name: s?.host_name || null, phone: s?.host_phone || null, email: s?.host_email || null, note: s?.host_note || null };
  return h.name || h.phone || h.email ? h : null;
}

/** "(404) 555-0123" for display; anything else is shown as stored. */
export function prettyPhone(p: string | null | undefined): string {
  const d = String(p ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : String(p ?? "");
}

/** The short line added to every text when host details exist. Empty when there is nothing to add. */
export function hostSmsLine(h: HostDetails | null): string {
  if (!h || (!h.phone && !h.email)) return "";
  const who = (h.name || "").trim();
  const how = h.phone ? prettyPhone(h.phone) : String(h.email);
  return ` Questions? ${who ? `${who} ` : ""}${how}`;
}

export function firstName(displayName: string | null | undefined): string {
  return String(displayName ?? "").trim().split(/\s+/)[0] || "there";
}

/** "Sun, Oct 4 at 7:00 PM EDT", always in the schedule's own zone. */
export function whenLabel(at: Date, timezone: string): string {
  const tz = eventTimeZone(timezone);
  const day = at.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const time = at.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const zone = at.toLocaleString("en-US", { timeZone: tz, timeZoneName: "short" }).split(" ").pop();
  return `${day} at ${time} ${zone}`;
}

/** "1 week before", "1 day before", "Starting now". */
export function offsetLabel(minutes: number, startingNow = false): string {
  if (startingNow || minutes === 0) return "Starting now";
  const m = Math.abs(minutes);
  if (m % (7 * 1440) === 0) return `${m / (7 * 1440)} week${m === 7 * 1440 ? "" : "s"} before`;
  if (m % 1440 === 0) return `${m / 1440} day${m === 1440 ? "" : "s"} before`;
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"} before`;
  return `${m} minutes before`;
}

function localHour(at: Date, tz: string): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  return { h: Number(parts.find((p) => p.type === "hour")?.value), m: Number(parts.find((p) => p.type === "minute")?.value) };
}

/** Is this instant inside 9 PM to 8 AM in the zone? */
export function inQuietHours(at: Date, timezone: string): boolean {
  const { h } = localHour(at, eventTimeZone(timezone));
  return h >= 21 || h < 8;
}

/**
 * Where a quiet-hours text moves to: the next 8:00 AM local, or 8:59 PM the
 * evening before if 8:00 AM would be at or after the start. Never dropped.
 */
export function quietHoursSendAt(due: Date, startsAt: Date, timezone: string): Date {
  if (!inQuietHours(due, timezone)) return due;
  const tz = eventTimeZone(timezone);
  // Walk forward minute-blocks to the next 8:00 local (at most 11 hours).
  let t = new Date(Math.ceil(due.getTime() / 60_000) * 60_000);
  for (let i = 0; i < 12 * 60 && inQuietHours(t, tz); i++) t = new Date(t.getTime() + 60_000);
  if (t < startsAt) return t;
  // Otherwise step back from `due` to 8:59 PM local.
  let b = new Date(Math.floor(due.getTime() / 60_000) * 60_000);
  for (let i = 0; i < 12 * 60 && inQuietHours(b, tz); i++) b = new Date(b.getTime() - 60_000);
  return b;
}

export const DAILY_SMS_CAP = 200;

export function complianceIntro(hostName: string): string {
  return `Sent with The Kenroe Collective for ${hostName || "your host"}.`;
}
export const STOP_LINE = "Reply STOP to opt out.";

/** Event-first SMS wrapper shared by previews and the actual sender. */
export function composeScheduleSms(args: {
  title: string;
  message: string;
  hostLine?: string;
  hostName?: string;
  firstText?: boolean;
  /** Word above the title, e.g. "Reminder". Pass null for messages that are not reminders (welcomes). */
  leadLabel?: string | null;
  protectedLines?: string[];
  maxChars?: number;
}): string {
  const title = args.title.trim() || "Schedule reminder";
  const message = spaceLinkPunctuation(args.message.trim());
  const label = args.leadLabel === undefined ? "Reminder" : args.leadLabel;
  const heading = label ? `${label}: ${title}` : title;
  const startsWithHeading = message.toLocaleLowerCase().startsWith(heading.toLocaleLowerCase());
  const lead = startsWithHeading ? message : `${heading}\n${message}`;
  const protectedBlock = (args.protectedLines ?? []).map((x) => x.trim()).filter(Boolean).join("\n");
  const tail = [protectedBlock, args.hostLine?.trim(), args.firstText ? complianceIntro(args.hostName || "your host") : "", args.firstText ? STOP_LINE : ""]
    .filter(Boolean)
    .join("\n");
  const maxChars = args.maxChars ?? 480;
  const room = Math.max(0, maxChars - (tail ? tail.length + 2 : 0));
  const body = [...lead].slice(0, room).join("").trimEnd();
  return tail ? `${body}\n\n${tail}` : body;
}

/** Converts common web addresses to safe absolute links and rejects unsafe schemes. */
export function normalizeJoinUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { throw new Error("Enter a complete meeting link, such as https://zoom.us/j/123."); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes(".")) {
    throw new Error("Enter a secure web link that starts with https://.");
  }
  return parsed.toString();
}

const GSM = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

/** Characters and text segments, the way carriers count them. */
export function smsSegments(text: string): { chars: number; segments: number; unicode: boolean } {
  const unicode = !GSM.test(text);
  const chars = [...text].length;
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi);
  return { chars, segments, unicode };
}
