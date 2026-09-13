/**
 * Shared helpers for the copy-protection guard on event saves.
 *
 * Client-safe on purpose: the server uses them to find and drop refused media
 * references before saving the rest of the host's edit, and the browser uses
 * the same drop so its local copy matches the cloud and the next autosave
 * doesn't paste the refused link straight back in.
 */

/** Every string on the blob long enough to be a URL, recursively. */
export function walkMediaStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.length > 20) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) walkMediaStrings(v, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) walkMediaStrings(v, out);
  }
  return out;
}

function holdsRefused(item: unknown, refused: Set<string>): boolean {
  if (typeof item === "string") return refused.has(item);
  if (Array.isArray(item)) return false;
  if (item && typeof item === "object") {
    // A gallery entry `{ url, kind, ... }` is one thing: drop it whole when
    // its direct link is refused, rather than leaving a blank tile behind.
    return Object.values(item as Record<string, unknown>).some((v) => typeof v === "string" && refused.has(v));
  }
  return false;
}

/**
 * Returns a copy of `data` with every refused string removed:
 *   - a refused string in an array is dropped, as is an array entry (object)
 *     whose own direct string field is refused (one gallery tile)
 *   - a refused string on an object field is deleted from that object
 * Returns the same reference when nothing matched.
 */
export function stripRefusedMedia<T>(data: T, refusedValues: Iterable<string>): T {
  const refused = new Set<string>();
  for (const v of refusedValues) if (v) refused.add(v);
  if (!refused.size) return data;

  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const next = value.filter((item) => !holdsRefused(item, refused)).map(visit);
      return next.length === value.length && next.every((v, i) => v === value[i]) ? value : next;
    }
    if (value && typeof value === "object") {
      let changed = false;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v === "string" && refused.has(v)) { changed = true; continue; }
        const nv = visit(v);
        if (nv !== v) changed = true;
        out[k] = nv;
      }
      return changed ? out : value;
    }
    return value;
  };

  return visit(data) as T;
}
