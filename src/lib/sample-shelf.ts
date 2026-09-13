/**
 * The sample shelf: every AI sample a host takes is kept on their own device so
 * a refresh, a closed tab, or a wander to another page never loses the take they
 * liked. Samples hold real audio, which is far too big for localStorage, so they
 * live in IndexedDB. Nothing is uploaded: a sample is a throwaway audition, and
 * the words that made it are what turn it into a full song later.
 */

export type ShelfSample = {
  /** Local id. Only ever meaningful on this device. */
  id: string;
  eventId: string;
  /** When it was made, so the newest sits on top and stale ones age out. */
  createdAt: number;
  /** Sample length in seconds, as the server actually made it. */
  seconds: number;
  /** The exact prompt the sample was made from. This is what makes a full song match. */
  prompt: string;
  /** The form choices behind it, so a host can put the whole form back. */
  settings: Record<string, unknown>;
  /** Name and credit line typed at the time, if any. */
  title: string;
  artist: string;
  contentType: string;
  audio: Blob;
};

/** How many samples to keep per event. Older ones drop off the end. */
export const SHELF_LIMIT = 8;
/** Samples older than this are cleared out, since a stale audition is noise. */
export const SHELF_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const DB_NAME = "kenroe-sample-shelf";
const STORE = "samples";

function hasIdb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("eventId", "eventId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open the sample shelf"));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Sample shelf write failed"));
  });
}

/**
 * Is this entry actually playable? A browser can throw away the audio of an
 * IndexedDB record while the small metadata around it survives, and an older
 * shelf format may not have held a real Blob at all. Either way the entry looks
 * fine in a list and does nothing when pressed, so it is checked rather than
 * assumed.
 */
export function samplePlayable(s: ShelfSample): boolean {
  const audio = s.audio as unknown;
  return audio instanceof Blob && audio.size > 0;
}

/** Same words, same length, same name: one compose kept more than once. */
function dupeKey(s: ShelfSample): string {
  return `${s.prompt}|${s.seconds}|${s.title}`;
}

/**
 * Decides what stays on the shelf: newest first, nothing stale, no repeats of
 * the same take, and never more than the cap. Where a take is on the shelf
 * twice, the copy that still has its audio wins over a newer empty one, since a
 * playable take is the whole point. Pure so the rule is testable without a
 * browser database.
 */
export function pruneShelf(
  samples: ShelfSample[],
  now = Date.now(),
  limit = SHELF_LIMIT,
): { keep: ShelfSample[]; drop: ShelfSample[] } {
  const fresh = samples.filter((s) => now - s.createdAt <= SHELF_MAX_AGE_MS);
  const sorted = [...fresh].sort((a, b) => b.createdAt - a.createdAt);
  const best = new Map<string, ShelfSample>();
  for (const s of sorted) {
    const key = dupeKey(s);
    const held = best.get(key);
    if (!held) {
      best.set(key, s);
      continue;
    }
    if (!samplePlayable(held) && samplePlayable(s)) best.set(key, s);
  }
  const unique = sorted.filter((s) => best.get(dupeKey(s)) === s);
  const keep = unique.slice(0, limit);
  const kept = new Set(keep.map((s) => s.id));
  return { keep, drop: samples.filter((s) => !kept.has(s.id)) };
}


/** Newest-first samples for one event. Returns nothing rather than throwing. */
export async function listSamples(eventId: string): Promise<ShelfSample[]> {
  if (!hasIdb()) return [];
  try {
    const db = await openDb();
    const rows = await new Promise<ShelfSample[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).index("eventId").getAll(eventId);
      req.onsuccess = () => resolve((req.result ?? []) as ShelfSample[]);
      req.onerror = () => reject(req.error ?? new Error("read failed"));
    });
    const { keep, drop } = pruneShelf(rows);
    if (drop.length) await Promise.all(drop.map((s) => removeSample(s.id)));
    db.close();
    return keep;
  } catch {
    return [];
  }
}

/** Puts a sample on the shelf and trims the shelf back to the cap. */
export async function saveSample(sample: ShelfSample): Promise<ShelfSample[]> {
  if (!hasIdb()) return [];
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(sample);
    await done(tx);
    db.close();
  } catch {
    /* a blocked or full database must not cost the host their sample playback */
  }
  return listSamples(sample.eventId);
}

export async function removeSample(id: string): Promise<void> {
  if (!hasIdb()) return;
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await done(tx);
    db.close();
  } catch {
    /* nothing to do: the sample is throwaway either way */
  }
}

/** Plain-language age, for the shelf list. */
export function sampleAgeLabel(createdAt: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - createdAt) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
