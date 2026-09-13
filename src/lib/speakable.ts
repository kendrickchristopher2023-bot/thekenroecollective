/**
 * TURNING STORED DATA INTO WORDS A VOICE CAN SAY.
 *
 * The narration used to be built from the strings the invitation page renders.
 * "6:00 PM EDT" is a DISPLAY format, and read aloud it becomes "six oh oh pee
 * em ee dee tee". A guest who cannot see the page then does not know when to
 * arrive, which is worse than no narration at all.
 *
 * So nothing here parses rendered text. Every sentence is composed from the
 * structured values the host stored: the wall clock, the IANA zone, the address
 * fields. The single test this module is judged by:
 *
 *   Could someone who cannot see the page, hearing only this, arrive at the
 *   right place, at the right time, on the right day?
 *
 * Deliberate choices worth knowing:
 *  - "Eastern Time", never "EDT" and never "Eastern Standard Time". An August
 *    event is in Eastern DAYLIGHT time, so "Standard" is factually wrong half
 *    the year. "Eastern Time" is right all year and is what people say.
 *  - Postcodes are skipped. Nobody navigates by hearing five digits.
 *  - "Dr" is a street, not a doctor. Abbreviations are expanded, always.
 *  - Hashtags and links are never spoken; they are visual things.
 */

import { eventWallClock } from "@/lib/datetime";

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const ORDINALS: Record<number, string> = {
  1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth",
  7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth", 11: "eleventh",
  12: "twelfth", 13: "thirteenth", 14: "fourteenth", 15: "fifteenth",
  16: "sixteenth", 17: "seventeenth", 18: "eighteenth", 19: "nineteenth",
  20: "twentieth", 30: "thirtieth",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Cardinal words for 0-999. Bigger numbers are left as digits. */
export function numberWords(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 999) return String(n);
  const i = Math.trunc(n);
  if (i < 20) return ONES[i]!;
  if (i < 100) {
    const t = TENS[Math.floor(i / 10)]!;
    const r = i % 10;
    return r ? `${t}-${ONES[r]}` : t;
  }
  const h = `${ONES[Math.floor(i / 100)]} hundred`;
  const r = i % 100;
  return r ? `${h} ${numberWords(r)}` : h;
}

/** "twenty-ninth". Dates are spoken as ordinals, never as digits. */
export function ordinalWords(n: number): string {
  const i = Math.trunc(n);
  if (ORDINALS[i]) return ORDINALS[i]!;
  if (i > 20 && i < 100) {
    const t = TENS[Math.floor(i / 10)]!;
    const r = i % 10;
    if (!r) return t.replace(/y$/, "ieth");
    return `${t}-${ORDINALS[r] ?? numberWords(r)}`;
  }
  return String(i);
}

/** Day of week from a calendar date, with no Intl involved. */
function weekdayName(year: number, month: number, day: number): string {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  const idx = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1]! + day) % 7;
  return WEEKDAYS[idx]!;
}

export interface SpokenWall {
  year: number;
  month: number;
  day: number;
  /** Null for an all-day event: there is no time to speak. */
  hour: number | null;
  minute: number;
}

/**
 * The host's own wall clock, from the stored value.
 *
 * A date with no time ("2026-08-29") is an ALL-DAY event, and is treated as one
 * rather than being read as midnight.
 */
export function spokenWallClock(date: string, timezone?: string | null): SpokenWall | null {
  const raw = String(date ?? "").trim();
  if (!raw) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    return {
      year: Number(dateOnly[1]),
      month: Number(dateOnly[2]),
      day: Number(dateOnly[3]),
      hour: null,
      minute: 0,
    };
  }
  const naive = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(raw);
  if (naive) {
    return {
      year: Number(naive[1]),
      month: Number(naive[2]),
      day: Number(naive[3]),
      hour: Number(naive[4]),
      minute: Number(naive[5]),
    };
  }
  // Legacy stored instant: read it in the venue's own zone.
  try {
    const w = eventWallClock(raw, timezone);
    if (!w) return null;
    return { year: w.year, month: w.month, day: w.day, hour: w.hour, minute: w.minute };
  } catch {
    return null;
  }
}

/** "Saturday, August twenty-ninth". The weekday first: it is the most useful word. */
export function spokenDate(w: SpokenWall): string {
  const month = MONTHS[w.month - 1] ?? "";
  return `${weekdayName(w.year, w.month, w.day)}, ${month} ${ordinalWords(w.day)}`;
}

/**
 * "six o'clock in the evening", "half past six in the evening", "noon".
 * Never "six oh oh", and never "twelve o'clock PM".
 */
export function spokenTime(hour: number, minute: number): string {
  const h = ((Math.trunc(hour) % 24) + 24) % 24;
  const m = Math.max(0, Math.min(59, Math.trunc(minute)));
  if (h === 12 && m === 0) return "noon";
  if (h === 0 && m === 0) return "midnight";

  const twelve = h % 12 === 0 ? 12 : h % 12;
  const partOfDay =
    h < 12 ? "in the morning" : h < 17 ? "in the afternoon" : h < 21 ? "in the evening" : "at night";

  if (m === 0) return `${numberWords(twelve)} o'clock ${partOfDay}`;
  if (m === 30) return `half past ${numberWords(twelve)} ${partOfDay}`;
  if (m === 15) return `quarter past ${numberWords(twelve)} ${partOfDay}`;
  if (m === 45) {
    const next = (twelve % 12) + 1;
    return `quarter to ${numberWords(next)} ${partOfDay}`;
  }
  const mins = m < 10 ? `oh ${numberWords(m)}` : numberWords(m);
  return `${numberWords(twelve)} ${mins} ${partOfDay}`;
}

const ZONE_WORDS: Record<string, string> = {
  "America/New_York": "Eastern Time",
  "America/Detroit": "Eastern Time",
  "America/Toronto": "Eastern Time",
  "America/Chicago": "Central Time",
  "America/Winnipeg": "Central Time",
  "America/Denver": "Mountain Time",
  "America/Edmonton": "Mountain Time",
  "America/Phoenix": "Arizona Time",
  "America/Los_Angeles": "Pacific Time",
  "America/Vancouver": "Pacific Time",
  "America/Anchorage": "Alaska Time",
  "Pacific/Honolulu": "Hawaii Time",
  "America/Puerto_Rico": "Atlantic Time",
  "Europe/London": "UK Time",
  "Europe/Dublin": "Irish Time",
  "Europe/Paris": "Central European Time",
  "Europe/Berlin": "Central European Time",
  "Europe/Madrid": "Central European Time",
  "Africa/Lagos": "West Africa Time",
  "Africa/Johannesburg": "South Africa Time",
  "Australia/Sydney": "Eastern Australia Time",
};

/**
 * "Eastern Time". Never a three-letter code, and never "Standard": the
 * Standard/Daylight distinction is wrong for half of every year, and no guest
 * needs it to arrive on time.
 */
export function spokenZone(timezone?: string | null): string {
  const tz = String(timezone ?? "").trim() || "America/New_York";
  if (ZONE_WORDS[tz]) return ZONE_WORDS[tz]!;
  const city = tz.split("/").pop() ?? tz;
  return `${city.replace(/_/g, " ")} time`;
}

/* --------------------------------------------------------------- addresses */

/** Street types, in the order they must be tried (longest first). */
const STREET_WORDS: [RegExp, string][] = [
  [/\bpkwy\b\.?/gi, "Parkway"],
  [/\bhwy\b\.?/gi, "Highway"],
  [/\bblvd\b\.?/gi, "Boulevard"],
  [/\bcir\b\.?/gi, "Circle"],
  [/\bcres\b\.?/gi, "Crescent"],
  [/\bplz\b\.?/gi, "Plaza"],
  [/\bter\b\.?/gi, "Terrace"],
  [/\btrl\b\.?/gi, "Trail"],
  [/\bxing\b\.?/gi, "Crossing"],
  [/\bcty\b\.?/gi, "County"],
  [/\bdr\b\.?/gi, "Drive"],
  [/\brd\b\.?/gi, "Road"],
  [/\bave\b\.?/gi, "Avenue"],
  [/\bav\b\.?/gi, "Avenue"],
  [/\bct\b\.?/gi, "Court"],
  [/\bln\b\.?/gi, "Lane"],
  [/\bpl\b\.?/gi, "Place"],
  [/\bsq\b\.?/gi, "Square"],
  [/\bste\b\.?/gi, "Suite"],
  [/\bapt\b\.?/gi, "Apartment"],
  [/\bbldg\b\.?/gi, "Building"],
  [/\bfl\b\.?/gi, "Floor"],
  [/\bn\b\.?/gi, "North"],
  [/\bs\b\.?/gi, "South"],
  [/\be\b\.?/gi, "East"],
  [/\bw\b\.?/gi, "West"],
  [/\bne\b\.?/gi, "Northeast"],
  [/\bnw\b\.?/gi, "Northwest"],
  [/\bse\b\.?/gi, "Southeast"],
  [/\bsw\b\.?/gi, "Southwest"],
];

/** Words that follow a STREET rather than a saint's name. */
const UNIT_WORDS = new Set([
  "suite", "ste", "apt", "apartment", "unit", "floor", "fl", "building", "bldg",
  "room", "north", "south", "east", "west", "northeast", "northwest",
  "southeast", "southwest",
]);

const STATE_WORDS: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington D.C.",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico",
};

/** House numbers are said in pairs: 1640 is "sixteen forty", not "one thousand six hundred forty". */
function houseNumberWords(token: string): string {
  const digits = token.replace(/\D/g, "");
  if (digits.length === 4) {
    const a = Number(digits.slice(0, 2));
    const b = Number(digits.slice(2));
    if (b === 0) return `${numberWords(a)} hundred`;
    if (b < 10) return `${numberWords(a)} oh ${numberWords(b)}`;
    return `${numberWords(a)} ${numberWords(b)}`;
  }
  if (digits.length === 3) {
    const a = Number(digits[0]);
    const b = Number(digits.slice(1));
    if (b === 0) return `${numberWords(a)} hundred`;
    if (b < 10) return `${numberWords(a)} oh ${numberWords(b)}`;
    return `${numberWords(a)} ${numberWords(b)}`;
  }
  if (digits.length <= 2) return numberWords(Number(digits));
  return digits.split("").map((d) => ONES[Number(d)]).join(" ");
}

/**
 * Unit numbers are said the way a receptionist says them: 105 is "one oh
 * five", 12 is "twelve", 1204 is "twelve oh four", 300 is "three hundred".
 */
function unitNumberWords(token: string): string {
  const digits = token.replace(/\D/g, "");
  if (!digits) return token;
  if (digits.length <= 2) return numberWords(Number(digits));
  if (digits.length === 3) {
    const a = Number(digits[0]);
    const b = Number(digits.slice(1));
    if (b === 0) return `${numberWords(a)} hundred`;
    if (b < 10) return `${numberWords(a)} oh ${numberWords(b)}`;
    return `${numberWords(a)} ${numberWords(b)}`;
  }
  return houseNumberWords(digits);
}

/**
 * "1640 Oakhurst Commons Dr Suite 105, Charlotte, NC 28215" becomes
 * "sixteen forty Oakhurst Commons Drive, Suite 105, Charlotte, North Carolina".
 *
 * The postcode is dropped on purpose: hearing five digits helps nobody arrive.
 */
export function spokenAddress(address: string): string {
  let text = String(address ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  // Postcode, wherever it sits. Nobody navigates by ear on five digits.
  text = text.replace(/\b\d{5}(-\d{4})?\b(?!\s*\w)/g, "").trim();
  text = text.replace(/,\s*,/g, ",").replace(/,\s*$/, "");

  const segments = text.split(",").map((s) => s.trim()).filter(Boolean);

  const spoken = segments.map((segment, index) => {
    let s = segment;

    // "St Marks Ave" is a saint; "Cherry St" and "Cherry St Suite 2" are streets.
    s = s.replace(/\bst\b\.?\s+([A-Z][A-Za-z']*)/gi, (_m, next: string) =>
      UNIT_WORDS.has(next.toLowerCase()) ? `Street ${next}` : `Saint ${next}`,
    );
    s = s.replace(/\bst\b\.?(?!\s*[a-z])/gi, "Street");

    for (const [pattern, word] of STREET_WORDS) s = s.replace(pattern, word);

    // "#105" is a suite number in everything but name.
    s = s.replace(/\s*#\s*(\d)/g, ", Suite $1");

    // A unit gets its own breath: "…Drive, Suite 105", not "Drive Suite 105".
    s = s.replace(/\s+(Suite|Apartment|Unit|Floor|Building|Room)\b/gi, ", $1");

    // The unit number is said digit by digit the way people say it at a door:
    // "Suite one oh five", "Apartment twelve B", never "Suite one hundred five".
    s = s.replace(
      /\b(Suite|Apartment|Unit|Floor|Building|Room)\s+(\d+)([A-Za-z])?\b/gi,
      (_m, word: string, num: string, letter?: string) =>
        `${word} ${unitNumberWords(num)}${letter ? ` ${letter.toUpperCase()}` : ""}`,
    );

    // A state on its own, or a state followed by nothing else.
    const stateOnly = /^([A-Za-z]{2})$/.exec(s.trim());
    if (stateOnly && STATE_WORDS[stateOnly[1]!.toUpperCase()]) {
      return STATE_WORDS[stateOnly[1]!.toUpperCase()]!;
    }

    // Leading house number, on the first segment only.
    if (index === 0) {
      s = s.replace(/^(\d+[A-Za-z]?)\b/, (m) => houseNumberWords(m));
    }
    return s.replace(/,\s*,/g, ",").replace(/\s+/g, " ").trim();
  });

  return spoken.filter(Boolean).join(", ").replace(/,\s*,/g, ",");
}

/* ------------------------------------------------------- general tidying up */

/**
 * Anything the host typed, made safe to read aloud: ampersands become "and",
 * links and hashtags are removed entirely (visual things, noise in the ear),
 * and small standalone numbers become words so "6 attending" is "six attending".
 */
export function speakableProse(text: string): string {
  let s = String(text ?? "");
  s = s.replace(/https?:\/\/\S+/gi, " ");
  s = s.replace(/\bwww\.\S+/gi, " ");
  s = s.replace(/(^|\s)#[\w-]+/g, " ");
  s = s.replace(/&/g, " and ");
  s = s.replace(/\+/g, " plus ");
  s = s.replace(/\b(\d{1,3})(?:st|nd|rd|th)\b/gi, (_m, d) => ordinalWords(Number(d)));
  s = s.replace(/\b(\d{1,2})\b(?!:)/g, (m, d) => numberWords(Number(d)));
  return s.replace(/\s+([.,!?])/g, "$1").replace(/\s+/g, " ").trim();
}

export interface Pronunciation {
  /** The word as written: a venue, a family name. */
  term: string;
  /** How to say it, spelled the way it sounds. */
  sayAs: string;
}

/**
 * Host-set pronunciations, applied last so they win over every rule above.
 * Longest terms first, so "Mary Ann Kendrick" beats "Kendrick".
 */
export function applyPronunciations(text: string, list?: Pronunciation[] | null): string {
  const entries = (list ?? [])
    .map((p) => ({ term: String(p?.term ?? "").trim(), sayAs: String(p?.sayAs ?? "").trim() }))
    .filter((p) => p.term.length > 1 && p.sayAs)
    .sort((a, b) => b.term.length - a.term.length);
  let out = String(text ?? "");
  for (const { term, sayAs } of entries) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|[^\\p{L}])${escaped}(?![\\p{L}])`, "giu"), (_m, pre: string) => `${pre}${sayAs}`);
  }
  return out;
}
