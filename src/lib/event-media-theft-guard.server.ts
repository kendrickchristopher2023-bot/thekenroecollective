/**
 * Freeloading guard for the event save path (upsertEvent).
 *
 * A saved event's `data` blob is a bag of strings the host controls, some of
 * which are URLs into our own Supabase storage. Nothing stops a host from
 * copy-pasting a URL they saw somewhere else straight into their own event's
 * hero photo / vibe gallery / theme art / logo / voice note / soundtrack field,
 * which would silently hot-link another host's paid storage, another event's
 * guest uploads, or the showcase's fixtures, forever.
 *
 * Every field on the event goes through the same walk (the blob is scanned
 * recursively), so there is no "gallery vs hero" distinction: any string that
 * points at one of our media buckets is checked with the rule for that bucket:
 *
 *   - user-id folders (`atelier-shared`, `atelier-media-private`,
 *     `sound-pieces/<userId>/...`) belong to the event owner and every
 *     active collaborator
 *   - event-id folders (`event-photos/<eventId>/...`,
 *     `sound-pieces/invite-narration/<eventId>/...`) belong to that event only
 *   - the showcase's folders (its event id, its media prefix, its system
 *     account) can never be reused by anyone
 *   - studio pieces referenced by share link are checked against sound_pieces
 *     because their public URLs carry opaque share keys, not an owner path
 *
 * A reference that the cloud row already held before this save is never
 * refused again (see OwnershipScope.previousData): the guard stops NEW
 * hot-links, it never un-saves old ones.
 *
 * The checks do not throw. They return the exact strings that were refused so
 * the save path can drop just those and keep the rest of the host's edit.
 */

import { SHOWCASE_EVENT_ID } from "@/lib/showcase";
import { walkMediaStrings } from "@/lib/event-media-strip";

/** Buckets whose first path segment is the uploading user's id. */
const USER_FOLDER_BUCKETS = new Set(["atelier-shared", "atelier-media-private", "sound-pieces"]);
/** Buckets whose first path segment is the event id the media was uploaded for. */
const EVENT_FOLDER_BUCKETS = new Set(["event-photos"]);
/** Folder prefixes inside `sound-pieces` that are keyed by event id, not user id. */
const SOUND_EVENT_PREFIXES = new Set(["invite-narration"]);
/** The locked system account that owns the showcase (see showcase adoption). */
const SHOWCASE_SYSTEM_USER_ID = "b72c64c1-1111-4ead-9ff1-57018eb5b38f";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REFUSAL_SHOWCASE = "That media belongs to the showcase sample and can't be reused here.";
export const REFUSAL_OTHER_ACCOUNT = "That media belongs to another account and can't be reused here.";
export const REFUSAL_OTHER_EVENT = "That media belongs to another event and can't be reused here.";
export const REFUSAL_PIECE = "That studio piece belongs to another account or a demo and can't be reused here.";

/** Pulls `{ bucket, path }` out of a Supabase storage URL (public, signed, authenticated, or image-transform), else null. */
export function parseStorageUrl(value: string): { bucket: string; path: string } | null {
  const match = /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/.exec(value);
  if (!match) return null;
  const [, bucket, rawPath] = match;
  if (!bucket || !rawPath) return null;
  if (!USER_FOLDER_BUCKETS.has(bucket) && !EVENT_FOLDER_BUCKETS.has(bucket)) return null;
  try {
    return { bucket, path: decodeURIComponent(rawPath) };
  } catch {
    return { bucket, path: rawPath };
  }
}

export interface RefusedMedia {
  /** The exact string on the event that was refused (so the caller can drop it). */
  value: string;
  reason: string;
}

export interface MediaTheftCheck {
  ok: boolean;
  /** First refusal's plain-language reason, kept for callers that only need one line. */
  reason?: string;
  refused: RefusedMedia[];
}

/**
 * Who may legitimately have uploaded media onto an event, which event it is,
 * and what the event already referenced before this save.
 *
 * - `allowedOwnerIds`: the row owner plus every active collaborator. Co-hosts
 *   upload under their own user id (media-uploads.functions.ts), so a guard
 *   keyed on the owner alone refused every co-host photo and, once one was on
 *   the event, every later save by the host too.
 * - `eventId`: the event being saved. Event-folder buckets (guest photo-wall
 *   uploads, cached narration) only ever belong to the event they were
 *   uploaded for, whoever is saving.
 * - `previousData`: the row as saved in the cloud. A reference that is already
 *   there is never refused again, so a removed co-host's old upload, or a
 *   piece attached before this guard existed, can't wedge the event.
 */
export interface OwnershipScope {
  allowedOwnerIds: Iterable<string>;
  eventId?: string;
  previousData?: Record<string, unknown> | null;
}

function toScope(scope: string | OwnershipScope): { allowed: Set<string>; eventId: string | null; previous: Set<string> } {
  const resolved: OwnershipScope =
    typeof scope === "string" ? { allowedOwnerIds: [scope] } : scope;
  const allowed = new Set<string>();
  for (const id of resolved.allowedOwnerIds) if (id) allowed.add(id);
  const previous = new Set<string>(resolved.previousData ? walkMediaStrings(resolved.previousData) : []);
  return { allowed, eventId: resolved.eventId ?? null, previous };
}

/**
 * The ownership rule for one storage reference. Returns null when the
 * reference is fine (or not one of ours), else the plain refusal reason.
 */
export function classifyStorageReference(
  value: string,
  allowed: Set<string>,
  eventId: string | null,
): string | null {
  const parsed = parseStorageUrl(value);
  if (!parsed) return null;
  const segments = parsed.path.split("/").filter(Boolean);
  const [first, second] = segments;
  if (!first) return null;

  // The showcase's folders are off limits in every bucket, whatever the caller.
  if (first === SHOWCASE_EVENT_ID || first === SHOWCASE_SYSTEM_USER_ID) return REFUSAL_SHOWCASE;

  if (EVENT_FOLDER_BUCKETS.has(parsed.bucket)) {
    // event-photos/<eventId>/... : guest uploads and wall music for ONE event.
    if (!eventId || first !== eventId) return REFUSAL_OTHER_EVENT;
    return null;
  }

  if (parsed.bucket === "sound-pieces" && SOUND_EVENT_PREFIXES.has(first)) {
    // sound-pieces/invite-narration/<eventId>/... : cached narration for one event.
    if (second === SHOWCASE_EVENT_ID) return REFUSAL_SHOWCASE;
    if (!eventId || second !== eventId) return REFUSAL_OTHER_EVENT;
    return null;
  }

  // User-folder buckets: the first segment is the uploader's user id.
  if (UUID_RE.test(first) && !allowed.has(first)) return REFUSAL_OTHER_ACCOUNT;
  return null;
}

/**
 * Scans an event's about-to-be-saved data blob (every field, recursively) for
 * storage references the saver's people don't own. `scope` is either the
 * owning user id (legacy) or a full ownership scope.
 */
export function checkEventMediaOwnership(
  eventData: Record<string, unknown>,
  scope: string | OwnershipScope,
): MediaTheftCheck {
  const { allowed, eventId, previous } = toScope(scope);
  const refused: RefusedMedia[] = [];
  const seen = new Set<string>();

  for (const value of walkMediaStrings(eventData)) {
    if (previous.has(value) || seen.has(value)) continue;
    const reason = classifyStorageReference(value, allowed, eventId);
    if (!reason) continue;
    seen.add(value);
    refused.push({ value, reason });
  }

  return { ok: refused.length === 0, reason: refused[0]?.reason, refused };
}

/** `{ shareKey -> every string on the event that referenced it }`. */
function soundShareKeys(value: unknown, out = new Map<string, Set<string>>()): Map<string, Set<string>> {
  if (typeof value === "string") {
    try {
      const url = new URL(value, "https://thekenroecollective.com");
      const match = /^\/sound\/([^/?#]+)$/.exec(url.pathname);
      if (match?.[1]) {
        const key = decodeURIComponent(match[1]);
        const set = out.get(key) ?? new Set<string>();
        set.add(value);
        out.set(key, set);
      }
    } catch { /* not a URL */ }
  } else if (Array.isArray(value)) {
    for (const item of value) soundShareKeys(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) soundShareKeys(item, out);
  }
  return out;
}

/**
 * Verifies every NEW studio-piece reference on the event belongs to the owner
 * or an active collaborator and is not a demo piece.
 *
 * `supabase` must be a client that can see other accounts' rows (the service
 * client): sound_pieces RLS only shows a caller their own pieces, so a co-host
 * saving the host's event could never see the host's song and was refused.
 */
export async function checkEventSoundPieceOwnership(
  supabase: any,
  eventData: Record<string, unknown>,
  scope: string | OwnershipScope,
): Promise<MediaTheftCheck> {
  const resolved: OwnershipScope = typeof scope === "string" ? { allowedOwnerIds: [scope] } : scope;
  const { allowed } = toScope(resolved);
  const previousKeys = resolved.previousData ? soundShareKeys(resolved.previousData) : new Map<string, Set<string>>();
  const current = soundShareKeys(eventData);
  const keys = [...current.keys()].filter((k) => !previousKeys.has(k));
  if (!keys.length) return { ok: true, refused: [] };

  const refuseAll = (reason: string): MediaTheftCheck => {
    const refused: RefusedMedia[] = [];
    for (const key of keys) for (const value of current.get(key) ?? []) refused.push({ value, reason });
    return { ok: false, reason, refused };
  };

  const { data, error } = await supabase
    .from("sound_pieces")
    .select("user_id,share_token,share_slug,is_demo")
    .or(`share_token.in.(${keys.join(",")}),share_slug.in.(${keys.join(",")})`);
  if (error) return refuseAll("That studio piece could not be verified.");
  const rows = (data ?? []) as { user_id: string; share_token: string; share_slug: string | null; is_demo: boolean }[];
  const refused: RefusedMedia[] = [];
  for (const key of keys) {
    const row = rows.find((r) => r.share_token === key || r.share_slug === key);
    if (!row || !allowed.has(row.user_id) || row.is_demo) {
      for (const value of current.get(key) ?? []) refused.push({ value, reason: REFUSAL_PIECE });
    }
  }
  return { ok: refused.length === 0, reason: refused[0]?.reason, refused };
}
