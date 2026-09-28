/**
 * The invitation, said out loud.
 *
 * This is the script, and only the script, and it is NOT built from what the
 * page renders. "6:00 PM EDT" is a display string; read aloud it becomes "six
 * oh oh pee em ee dee tee". Every sentence below is composed from the stored
 * structured values instead (wall clock, IANA zone, address fields), through
 * `@/lib/speakable`.
 *
 * The one test it is judged by: could a guest who cannot see the page, hearing
 * only this, arrive at the right place, at the right time, on the right day?
 * So the script carries the essentials in speakable form, then the warm part,
 * then the two things a listener cannot scan for (dress code, what to bring):
 *
 *   1. who is invited and to what
 *   2. who is hosting
 *   3. the day, the time with its zone, and the address in full
 *   4. the host's own note, word for word
 *   5. dress code and anything to bring, briefly
 *   6. a single closing line pointing at the RSVP
 *
 * Two rules hold everywhere below:
 *   - Nothing is invented. Every sentence is built from a field the host
 *     actually filled in; a missing field removes its sentence rather than
 *     producing a guess or an empty phrase.
 *   - The script is per EVENT, never per guest. Two hundred guests opening the
 *     same invitation share one recording, which is what keeps this affordable.
 *     That is also why no guest name appears here.
 */

import {
  applyPronunciations,
  spokenAddress,
  spokenDate,
  spokenTime,
  spokenWallClock,
  spokenZone,
  speakableProse,
  type Pronunciation,
} from "@/lib/speakable";

/** Per-device memory of "yes, read it to me" / "no, I'll read it myself". */
export const NARRATION_CHOICE_KEY = "kcc.invite.narration.choice";

export type NarrationChoice = "yes" | "no" | "unset";

export function narrationChoice(): NarrationChoice {
  if (typeof window === "undefined") return "unset";
  try {
    const raw = localStorage.getItem(NARRATION_CHOICE_KEY);
    return raw === "yes" || raw === "no" ? raw : "unset";
  } catch {
    return "unset";
  }
}

export function setNarrationChoice(choice: "yes" | "no") {
  try {
    localStorage.setItem(NARRATION_CHOICE_KEY, choice);
  } catch {
    /* private mode: the choice lasts this visit */
  }
}

/** What the script generator needs. A subset of the event on purpose. */
export interface NarrationSource {
  title?: string | null;
  date?: string | null;
  timezone?: string | null;
  venue?: string | null;
  address?: string | null;
  city?: string | null;
  message?: string | null;
  welcomeQuote?: string | null;
  hostName?: string | null;
  hosts?: { name?: string | null; role?: string | null }[] | null;
  /** Spoken because a listener cannot scan the page for it. */
  dressCode?: string | null;
  /** "Please bring a side dish" style note, or the bring-list summary. */
  bringNote?: string | null;
  /** Host-set phonetic spellings: venues, family names, the honoree. */
  pronunciations?: Pronunciation[] | null;
}

function clean(v: string | null | undefined, max = 700): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** "Christopher and Adrian", "Christopher, Adrian and Maya". */
function joinNames(names: string[]): string {
  const list = names.filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0]!;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** The date line, from the stored calendar values. Weekday first, always. */
export function spokenDateSentence(source: NarrationSource): string {
  const w = source.date ? spokenWallClock(source.date, source.timezone) : null;
  if (!w) return "";
  return `It's on ${spokenDate(w)}.`;
}

/** The time line, with the zone said the way people say it. */
export function spokenTimeSentence(source: NarrationSource): string {
  const w = source.date ? spokenWallClock(source.date, source.timezone) : null;
  if (!w) return "";
  if (w.hour === null) return "It runs all day.";
  const time = spokenTime(w.hour, w.minute);
  const zone = spokenZone(source.timezone);
  if (time === "noon" || time === "midnight") return `It starts at ${time}, ${zone}.`;
  return `It starts at ${time}, ${zone}.`;
}

/** The place line: venue, then the street address expanded, postcode dropped. */
export function spokenPlaceSentence(source: NarrationSource): string {
  const venue = speakableProse(clean(source.venue, 140));
  const address = spokenAddress(clean(source.address, 200));
  const city = speakableProse(clean(source.city, 80));
  const bits: string[] = [];
  if (venue) bits.push(venue);
  if (address) bits.push(address);
  else if (city && !venue.toLowerCase().includes(city.toLowerCase())) bits.push(city);
  if (!bits.length) return "";
  return `It's at ${bits.join(", ")}.`;
}

/**
 * The script, as paragraphs. Paragraphs matter twice over: the reading voice
 * pauses between them, and the captions advance a paragraph at a time so a
 * guest who cannot hear follows the same shape.
 */
export function narrationParagraphs(source: NarrationSource): string[] {
  const title = speakableProse(clean(source.title, 160));
  const out: string[] = [];

  const hostNames = joinNames(
    (source.hosts ?? [])
      .map((h) => clean(h?.name, 60))
      .filter((n) => n.length > 1)
      .slice(0, 3),
  ) || clean(source.hostName, 60);

  // 1. Who is invited, and to what.
  if (title) out.push(`You're invited to ${title}.`);
  else out.push("You're invited.");

  // 2. Who is hosting.
  if (hostNames) out.push(`${hostNames} would love you there.`);

  // 3. The three things a listener has to leave with: day, time, place. Each
  //    its own paragraph, so the voice pauses between them and a guest hearing
  //    it once still catches all three.
  const dateLine = spokenDateSentence(source);
  const timeLine = spokenTimeSentence(source);
  const placeLine = spokenPlaceSentence(source);
  if (dateLine) out.push(timeLine ? `${dateLine} ${timeLine}` : dateLine);
  else if (timeLine) out.push(timeLine);
  if (placeLine) out.push(placeLine);

  // 4. The host's own words, exactly as written (links and hashtags aside).
  const quote = speakableProse(clean(source.welcomeQuote, 240));
  if (quote) out.push(quote.endsWith(".") || quote.endsWith("!") || quote.endsWith("?") ? quote : `${quote}.`);
  const note = speakableProse(clean(source.message, 900));
  if (note) out.push(note);

  // 5. The practical detail a listener cannot scan for.
  const dress = speakableProse(clean(source.dressCode, 160));
  if (dress) out.push(`Dress code: ${dress.replace(/\.$/, "")}.`);
  const bring = speakableProse(clean(source.bringNote, 220));
  if (bring) out.push(bring.endsWith(".") ? bring : `${bring}.`);

  // 6. One closing line, and then silence. The page has the rest.
  out.push("When you're ready, let them know if you can come.");

  return out.map((p) => applyPronunciations(p, source.pronunciations).replace(/\s+/g, " ").trim());
}

/** The words handed to the reading voice, with a real pause between beats. */
export function narrationSpeechText(source: NarrationSource): string {
  return narrationParagraphs(source).join("\n\n");
}


/** Rough spoken length. Studio voices read close to 150 words a minute. */
export function narrationSeconds(paragraphs: string[]): number {
  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  const pauses = Math.max(0, paragraphs.length - 1) * 0.6;
  return Math.max(8, Math.round((words / 150) * 60 + pauses));
}

/** "1 min 10 sec", the way a play button should label itself. */
export function narrationLengthLabel(seconds: number): string {
  const s = Math.max(1, Math.round(seconds));
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} sec` : `${m} min`;
}

/**
 * A stable fingerprint of the words. The recording is remade only when this
 * changes, which is the whole cost control: editing the dress code does not
 * pay for a new reading, editing the host's note does.
 */
export function narrationHash(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619 >>> 0;
    h2 = (h2 + c * (i + 7)) >>> 0;
  }
  return `${h1.toString(36)}${h2.toString(36)}`;
}
