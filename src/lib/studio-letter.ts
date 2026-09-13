/**
 * Letters: a written letter, read aloud, with music underneath.
 *
 * Why this is not the music route. A music model will happily paraphrase, which
 * is fatal here: the whole point of a letter is that it says what the writer
 * wrote, word for word. So a letter is read by a speech voice, and the music is
 * a separate bed underneath it. The words are the deliverable, the recording is
 * the keepsake, and both come from the same approved text.
 *
 * Two rules live in this module rather than in the interface, because an
 * interface can be bypassed and a rule in the pipeline cannot:
 *   1. No voice cloning of any kind. Only the fixed studio voices.
 *   2. The writing pass may tighten, cut repetition and fix rhythm. It may not
 *      invent a memory, a quotation, a name, a date or any other fact the
 *      writer did not supply, and what it returns is checked against the
 *      writer's own material before it is ever read aloud.
 */

import { STUDIO_VOICES, deliverySettings, studioVoiceId } from "@/lib/studio-voices";

/**
 * How fast a letter is actually read aloud, measured rather than guessed.
 *
 * A 87 word memorial letter at the unhurried pace was recorded and probed: it
 * came out 31.7 seconds long, about 165 words a minute once the paragraph
 * pauses are taken out. The old figure of 110 was a reading-aloud ideal, and it
 * made every estimate roughly twice the real length, which meant a letter
 * written for a minute finished in half of it. This is the measured rate.
 */
export const LETTER_WORDS_PER_MINUTE = 165;

export const LETTER_PACES = [
  { key: "unhurried", label: "Unhurried", factor: 0.85, help: "For a memorial or a blessing." },
  { key: "natural", label: "Natural", factor: 1, help: "How you would read it to one person." },
  { key: "warm", label: "Warm and brisk", factor: 1.12, help: "For a toast in a loud room." },
] as const;

export type LetterPace = (typeof LETTER_PACES)[number]["key"];

/** Real moments people cannot be in the room for. */
export const LETTER_OCCASIONS = [
  {
    key: "memorial",
    label: "Read at a memorial",
    prompt:
      "a letter to be read aloud at a memorial or funeral, honest about the loss, tender rather than grand",
    pace: "unhurried" as LetterPace,
  },
  {
    key: "toast",
    label: "A wedding toast from someone who cannot attend",
    prompt:
      "a wedding toast from someone who cannot be there in person, warm and a little funny, ending on a raised glass",
    pace: "warm" as LetterPace,
  },
  {
    key: "graduate",
    label: "A letter to a graduate",
    prompt: "a letter to someone who has just graduated, proud without being a lecture",
    pace: "natural" as LetterPace,
  },
  {
    key: "milestone",
    label: "A parent to a child at a milestone",
    prompt:
      "a letter from a parent to their child at a milestone, plain spoken, the kind of thing kept in a drawer for thirty years",
    pace: "natural" as LetterPace,
  },
  {
    key: "other",
    label: "Another moment",
    prompt: "a personal letter read aloud",
    pace: "natural" as LetterPace,
  },
] as const;

export type LetterOccasion = (typeof LETTER_OCCASIONS)[number]["key"];

export function occasionPrompt(key: string): string {
  return (
    LETTER_OCCASIONS.find((o) => o.key === key)?.prompt ?? LETTER_OCCASIONS.at(-1)!.prompt
  );
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/** How long this text takes to read, at the chosen pace, in whole seconds. */
export function spokenSeconds(text: string, pace: LetterPace = "natural"): number {
  const factor = LETTER_PACES.find((p) => p.key === pace)?.factor ?? 1;
  const words = countWords(text);
  const paragraphs = text.trim().split(/\n{2,}/).filter(Boolean).length;
  const breathing = Math.max(0, paragraphs - 1) * 1.2;
  return Math.round((words / (LETTER_WORDS_PER_MINUTE * factor)) * 60 + breathing);
}

/** How many words fit a chosen length, so the writing pass is asked for the right size. */
export function letterWordBudget(seconds: number, pace: LetterPace = "natural"): number {
  const factor = LETTER_PACES.find((p) => p.key === pace)?.factor ?? 1;
  return Math.max(20, Math.round((seconds / 60) * LETTER_WORDS_PER_MINUTE * factor));
}

/** Plain guidance when the letter will not fit the length chosen. */
export function fitNote(text: string, seconds: number, pace: LetterPace): string {
  const spoken = spokenSeconds(text, pace);
  if (!countWords(text)) return "";
  if (spoken > seconds + 5) {
    return `Read at this pace it runs about ${spoken} seconds, longer than the ${seconds} you picked. Shorten it, slow down the length, or it will be cut off.`;
  }
  if (spoken < seconds * 0.6) {
    return `Read at this pace it runs about ${spoken} seconds, so there will be music with no words for the rest. That is often what you want at a memorial.`;
  }
  return `Read at this pace it runs about ${spoken} seconds, which fits.`;
}

/**
 * Everything the writer actually supplied, as one haystack. Used to check the
 * returned letter for anything invented.
 */
export function suppliedMaterial(input: {
  letterText?: string;
  words?: string;
  honoree?: string;
  mustInclude?: string;
  keyMoment?: string;
  fromName?: string;
}): string {
  return [
    input.letterText,
    input.words,
    input.honoree,
    input.mustInclude,
    input.keyMoment,
    input.fromName,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

/** Words that look like names but are ordinary sentence openers or titles. */
const NOT_A_FACT = new Set([
  "i",
  "we",
  "you",
  "he",
  "she",
  "they",
  "it",
  "the",
  "a",
  "an",
  "and",
  "but",
  "so",
  "then",
  "when",
  "if",
  "my",
  "your",
  "our",
  "his",
  "her",
  "their",
  "this",
  "that",
  "there",
  "here",
  "god",
  "mum",
  "mom",
  "dad",
  "grandma",
  "grandpa",
  "love",
  "dear",
  "yours",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);

/**
 * Anything in the returned letter that reads like a fact the writer never gave
 * us: a name, a number, a date, or a quotation. Deliberately cautious, because a
 * funeral letter containing an invented memory is worse than no letter. These
 * are shown to the writer for confirmation, never silently accepted.
 */
export function possibleInventions(letter: string, supplied: string): string[] {
  const hay = supplied;
  const out = new Set<string>();

  for (const m of letter.matchAll(/\b([A-Z][a-z]{2,})\b/g)) {
    const word = m[1]!;
    if (NOT_A_FACT.has(word.toLowerCase())) continue;
    // A word starting a sentence is usually not a name.
    const at = m.index ?? 0;
    const before = letter.slice(0, at).trimEnd();
    if (!before || /[.!?]$/.test(before) || before.endsWith("\n")) continue;
    if (!hay.includes(word.toLowerCase())) out.add(word);
  }

  for (const m of letter.matchAll(/\b(\d[\d,:./]*)\b/g)) {
    const num = m[1]!;
    if (!hay.includes(num.toLowerCase())) out.add(num);
  }

  for (const m of letter.matchAll(/["“]([^"”]{4,80})["”]/g)) {
    const quote = m[1]!;
    if (!hay.includes(quote.toLowerCase())) out.add(`"${quote}"`);
  }

  return [...out].slice(0, 12);
}

/**
 * The writing instruction. The two rules are stated as refusals, not
 * preferences, and the length is given in words so the result fits the
 * recording that was paid for.
 */
export function letterWritingPrompt(input: {
  occasion: string;
  seconds: number;
  pace: LetterPace;
  draft: string;
  about: string;
  honoree: string;
  fromName: string;
  mustInclude: string;
}): string {
  const budget = letterWordBudget(input.seconds, input.pace);
  return [
    `Prepare ${occasionPrompt(input.occasion)} to be read aloud.`,
    `LENGTH: about ${budget} words, so it reads in ${input.seconds} seconds at ${LETTER_WORDS_PER_MINUTE} words a minute.`,
    input.honoree ? `IT IS FOR: ${input.honoree}` : "",
    input.fromName ? `IT IS FROM: ${input.fromName}` : "",
    input.mustInclude ? `MUST APPEAR, IN THESE WORDS: ${input.mustInclude}` : "",
    input.about ? `BACKGROUND THE WRITER GAVE YOU: ${input.about}` : "",
    input.draft ? `THE WRITER'S OWN DRAFT, WHICH IS THE SOURCE OF TRUTH:\n${input.draft}` : "",
    "ABSOLUTE RULES. You may tighten, cut repetition, reorder for rhythm and fix grammar. You may NOT invent any fact: no name, no place, no date, no number, no quotation, no memory, no illness, no cause of death, no relationship that is not stated above. If something is missing, leave it out rather than guessing. Write nothing about the writer or the recipient that you were not told.",
    "FORM: paragraphs separated by a blank line. No headings, no stage directions, no emoji, no markdown. Return the letter only.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Mark the text up for the speech voice: paragraph breathing room, and the
 * writer's chosen emphasis. Punctuation is what a speech model actually
 * responds to, so pauses are expressed as punctuation rather than as tags a
 * voice would read out loud.
 */
export function speechText(
  letter: string,
  opts: {
    pace: LetterPace;
    paragraphPause: number;
    emphasis: string[];
    /** The honoree's name spelled as it is said, so the room hears it right. */
    honoree?: string;
    sayName?: string;
  },
): string {
  let out = letter.trim();
  // A mispronounced name is worse than any robotic quality, because it tells
  // the room nobody checked. The phonetic spelling replaces the written name
  // in what is spoken, and only there: the printed keepsake keeps the real
  // spelling. A beat is left before it so it lands.
  const written = (opts.honoree ?? "").trim();
  const said = (opts.sayName ?? "").trim();
  if (written && said && written.toLowerCase() !== said.toLowerCase()) {
    const safe = written.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${safe}\\b`, "g"), `, ${said}`);
  }
  for (const word of opts.emphasis.filter(Boolean).slice(0, 8)) {
    const safe = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safe) continue;
    // Commas around a phrase make a speech voice lean on it, which is the
    // closest honest equivalent of emphasis without inventing markup.
    out = out.replace(new RegExp(`\\b(${safe})\\b`, "gi"), ", $1,");
  }
  // Measured: one break mark bought about 0.5 seconds of silence, which is a
  // breath rather than a pause. A held pause needs more of them.
  const marks = Math.max(1, Math.min(3, Math.round(opts.paragraphPause))) + 1;
  const gap = "\n" + "…\n".repeat(marks);
  out = out.replace(/\n{2,}/g, gap);
  out = out.replace(/,\s*,/g, ",").replace(/,\s*([.!?])/g, "$1");
  if (opts.pace === "unhurried") out = out.replace(/([.!?])\s+/g, "$1 … ");
  // Room after the closing line, so the recording does not stop dead.
  out = `${out}\n…\n…`;
  return out.slice(0, 4500);
}

/**
 * Voice settings for reading a letter. The delivery direction does most of the
 * work; the pace only sets the speed.
 */
export function letterVoiceSettings(pace: LetterPace, delivery = "warm") {
  const speed = pace === "warm" ? 1.05 : pace === "unhurried" ? 0.8 : 0.95;
  return deliverySettings(delivery, speed);
}

/**
 * The fixed studio voices. Curated in studio-voices.ts from ElevenLabs' own
 * library and pinned by id, so no uploaded or cloned voice can be requested.
 */
export const LETTER_VOICES = STUDIO_VOICES.map((v) => ({ id: v.id, label: v.label }));

export function letterVoiceId(value: string): string {
  return studioVoiceId(value);
}


/** A printable letter: the words, with who it is for and from, no markup. */
export function printableLetter(input: {
  title: string;
  letter: string;
  honoree: string;
  fromName: string;
}): string {
  return [
    input.title.trim(),
    input.honoree.trim() ? `For ${input.honoree.trim()}` : "",
    "",
    input.letter.trim(),
    "",
    input.fromName.trim() ? `— ${input.fromName.trim()}` : "",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}
