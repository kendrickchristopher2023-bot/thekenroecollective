/**
 * Download file names for Sound Studio audio.
 *
 * Storage paths stay UUIDs (safe, collision free, and never guessable), but
 * nobody wants "f844eb43-6dc7-4c8b-9be7-f218140b766e.mp3" in their downloads
 * folder. The friendly name is applied at delivery time, from the piece or
 * playlist title, sanitised for Windows / macOS / Linux filesystems.
 */

const FALLBACK = "Kenroe Sound Studio piece";

/** Characters no common filesystem accepts, plus control characters. */
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

/** Windows refuses these names outright, with or without an extension. */
const RESERVED = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

/** A title turned into a safe file base name (no extension). */
export function safeFileBase(title: string, fallback = FALLBACK): string {
  let out = (title ?? "")
    .replace(ILLEGAL, " ")
    .replace(/\s+/g, " ")
    .trim()
    // A trailing dot or space makes a file unopenable on Windows.
    .replace(/[.\s]+$/g, "")
    .replace(/^[.\s]+/g, "");
  if (RESERVED.has(out.toLowerCase())) out = `${out} file`;
  if (out.length > 80) out = out.slice(0, 80).trim();
  return out || fallback;
}

/** A full download file name, e.g. "The Kendrick Family Bonfire.mp3". */
export function downloadFileName(title: string, ext = "mp3", fallback = FALLBACK): string {
  return `${safeFileBase(title, fallback)}.${ext}`;
}

/**
 * Names for a whole playlist download. Order is preserved and numbered so the
 * files sort the way the playlist plays, and repeated titles never collide.
 */
export function playlistFileNames(
  titles: string[],
  ext = "mp3",
): string[] {
  const used = new Map<string, number>();
  const pad = titles.length >= 10 ? 2 : 1;
  return titles.map((title, i) => {
    const base = `${String(i + 1).padStart(pad, "0")} ${safeFileBase(title)}`;
    const seen = used.get(base.toLowerCase()) ?? 0;
    used.set(base.toLowerCase(), seen + 1);
    return `${seen ? `${base} (${seen + 1})` : base}.${ext}`;
  });
}

/** The zip name for a playlist download. */
export function playlistZipName(name: string): string {
  return `${safeFileBase(name, "Kenroe Sound Studio playlist")}.zip`;
}
