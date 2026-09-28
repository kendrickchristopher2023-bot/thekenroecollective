/**
 * Very simple, intentionally small profanity mask.
 *
 * How it works: we look for a short list of clearly offensive words as whole
 * words (case insensitive, ignoring simple letter padding) and replace the
 * letters with asterisks. We mask instead of rejecting so a guest never loses
 * a heartfelt message over one word. Nothing here is clever or exhaustive, and
 * that is on purpose: it is easy to read, easy to extend, and it cannot
 * accidentally swallow ordinary words.
 */
const BLOCKED = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "cunt",
  "dick",
  "piss",
  "slut",
  "whore",
  "nigger",
  "faggot",
  "retard",
];

const PATTERN = new RegExp(`\\b(${BLOCKED.join("|")})(s|es|ing|ed|er)?\\b`, "gi");

export function maskProfanity(text: string): { clean: string; masked: boolean } {
  let masked = false;
  const clean = text.replace(PATTERN, (word) => {
    masked = true;
    return "*".repeat(word.length);
  });
  return { clean, masked };
}

/** True when the message has no real words left once offensive ones are masked. */
export function isAllProfanity(text: string): boolean {
  const { clean } = maskProfanity(text);
  return clean.replace(/[*\s\p{P}]/gu, "").length === 0;
}
