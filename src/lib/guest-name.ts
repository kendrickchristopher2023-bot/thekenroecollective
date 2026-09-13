/**
 * Guest display-name shortening, matching the convention used in the guest
 * list and reports: first name plus last initial, for example "Chris K".
 *
 * Used anywhere a per-person field needs to say WHOSE data it collects
 * (T-shirt sizes for a guest and each of their named plus-ones), so a party
 * with several plus-ones can never be ambiguous.
 */
export function shortGuestName(name: string | null | undefined): string {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]!;
  if (parts.length === 1) return first;
  const lastInitial = parts[parts.length - 1]!.charAt(0).toUpperCase();
  return `${first} ${lastInitial}`;
}

/** Short name with a positional fallback, e.g. "Riley V" or "Guest 2". */
export function shortGuestNameOr(name: string | null | undefined, fallback: string): string {
  return shortGuestName(name) || fallback;
}

/** Titles a host may have typed into the name field ("Ms. Cameron Wright"). */
const HONORIFICS = new Set([
  "mr", "mrs", "ms", "miss", "mx", "dr", "prof", "professor", "rev", "reverend", "fr", "father",
  "pastor", "sir", "dame", "lord", "lady", "hon", "honorable", "capt", "captain", "sgt", "lt",
  "col", "gen", "maj", "sr", "sra", "srta", "mme", "mlle", "monsieur", "madame", "elder", "deacon",
  "bishop", "coach", "auntie", "aunt", "uncle",
]);

/** Generational and professional suffixes, which are never a greeting name. */
const SUFFIXES = new Set([
  "jr", "sr", "ii", "iii", "iv", "v", "vi", "md", "phd", "dds", "dvm", "esq", "cpa", "rn", "jd",
  "mba", "ret",
]);

const norm = (t: string) => t.toLowerCase().replace(/[.,]/g, "").trim();

/**
 * The name a guest should be greeted by, from whatever the host typed.
 *
 * Hosts type all sorts of things into one field: "Ms. Cameron Wright",
 * "Cameron Wright Jr.", "Cameron", "Mrs." on its own, or nothing at all.
 * Greeting someone as "Hi Ms.," reads like the invitation is not really
 * theirs, so titles and suffixes are never used as a name.
 *
 * Returns null when there is no usable human name — callers must then greet
 * generically ("Hi there,") rather than printing a bare honorific.
 */
export function greetingFirstName(name: string | null | undefined): string | null {
  const tokens = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  // Drop leading titles, but only while a real name token remains behind them.
  let start = 0;
  while (start < tokens.length - 1 && HONORIFICS.has(norm(tokens[start]!))) start += 1;

  // Drop trailing suffixes the same way.
  let end = tokens.length - 1;
  while (end > start && SUFFIXES.has(norm(tokens[end]!))) end -= 1;

  const usable = tokens.slice(start, end + 1);
  const first = usable[0];
  if (!first) return null;

  // A single token that is itself only a title ("Ms.") is not a name.
  const cleaned = first.replace(/[.,]+$/, "").trim();
  if (!cleaned) return null;
  if (usable.length === 1 && (HONORIFICS.has(norm(cleaned)) || SUFFIXES.has(norm(cleaned)))) {
    return null;
  }
  return cleaned;
}

/**
 * Greeting name with a graceful ladder: cleaned first name, else the full name
 * as typed, else null so the caller can say "there" instead of a bare title.
 */
export function greetingNameOrNull(name: string | null | undefined): string | null {
  const first = greetingFirstName(name);
  if (first) return first;
  const full = String(name ?? "").trim();
  if (!full) return null;
  // Full name that is nothing but a title: not usable as a greeting.
  const tokens = full.split(/\s+/).filter(Boolean);
  if (tokens.every((t) => HONORIFICS.has(norm(t)) || SUFFIXES.has(norm(t)))) return null;
  return full;
}

