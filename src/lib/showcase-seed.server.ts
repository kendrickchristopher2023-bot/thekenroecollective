/**
 * The showcase invitation heals itself.
 *
 * The showcase row was lost once: it was seeded into the shared live database
 * while the published cleanup still had an older list of events to preserve.
 * The database now refuses to delete it (see protect_showcase_event_delete),
 * but "cannot be deleted" is not the same as "is always there". This module is
 * the other half: anything that notices the showcase missing can call
 * ensureShowcaseEvent() and get it back, exactly as it was, in one call.
 *
 * Callers today: the nightly demo reset, the public invitation loader when it
 * is asked for the showcase id and finds nothing, and the business card page
 * before it decides where "See a real invitation" points.
 *
 * Server-only: uses the service-role client.
 */
import { SHOWCASE_EVENT_ID } from "@/lib/showcase";
import {
  SHOWCASE_BRING_ITEMS,
  SHOWCASE_COMMENTS,
  SHOWCASE_MEDIA_PREFIX,
  SHOWCASE_WELL_WISHES,
  showcaseEventRow,
} from "@/lib/showcase-event.server";
import { ensureShowcaseAccount } from "@/lib/demo-accounts.server";

/** Public bucket that holds the showcase imagery and audio. */
const MEDIA_BUCKET = "event-photos";

/** Measured once from the stored file (ffprobe), so the player shows a real length. */
const VOICE_NOTE_SECONDS = 21;

/**
 * Captions on the invented photo-wall pictures. All fourteen are generated
 * images: no real person appears in any of them.
 */
const SHOWCASE_PHOTOS = [
  { file: "wall-1.jpg", uploaderLabel: "A toast, before anyone arrived" },
  { file: "wall-2.jpg", uploaderLabel: "Her bouquet, five minutes old" },
  { file: "wall-3.jpg", uploaderLabel: "The floor, waiting" },
  { file: "wall-4.jpg", uploaderLabel: "Aunt Loretta's cake" },
  { file: "wall-5.jpg", uploaderLabel: "The long table, just before dusk" },
  { file: "wall-6.jpg", uploaderLabel: "First glasses" },
  { file: "wall-7.jpg", uploaderLabel: "Shoes off by nine" },
  { file: "wall-8.jpg", uploaderLabel: "Nobody sat down" },
  { file: "wall-9.jpg", uploaderLabel: "Rosalind and Theo, table three" },
  { file: "wall-10.jpg", uploaderLabel: "First slice" },
  { file: "wall-11.jpg", uploaderLabel: "Lanterns at ten" },
  { file: "wall-12.jpg", uploaderLabel: "Requests welcome" },
  { file: "wall-13.jpg", uploaderLabel: "Back up the path" },
  { file: "wall-14.jpg", uploaderLabel: "The dessert table, going fast" },
] as const;

/** A public URL for a showcase asset. */
function mediaUrl(file: string): string {
  const base = (process.env["SUPABASE_URL"] ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${SHOWCASE_MEDIA_PREFIX}/${file}`;
}

/** Do not hammer the database from a hot public path: one heal attempt a minute per worker. */
let lastAttemptAt = 0;

export type EnsureShowcaseResult =
  | { ok: true; present: true; restored: boolean }
  | { ok: false; reason: string };

/**
 * Make sure the showcase event row and its samples exist. Idempotent: when the
 * row is already there this is one SELECT. When it is missing, the row is
 * re-inserted under its locked system account with the same content and media, the
 * cleanup tombstone that would keep it out is removed, and the sample wishes,
 * comments, photos and bring list are put back.
 */
export async function ensureShowcaseEvent(opts?: { force?: boolean }): Promise<EnsureShowcaseResult> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await db
    .from("events")
    .select("id,user_id")
    .eq("id", SHOWCASE_EVENT_ID)
    .maybeSingle();

  // Present: make sure the samples are too (they cascade away with the row).
  if (existing) {
    const systemUserId = await ensureShowcaseAccount();
    if (!systemUserId) return { ok: false, reason: "Showcase system account unavailable" };
    if ((existing as { user_id?: string }).user_id !== systemUserId) {
      const { error: adoptError } = await db.rpc("adopt_showcase_event", { _owner: systemUserId });
      if (adoptError) return { ok: false, reason: adoptError.message };
    }
    const { count } = await db
      .from("event_well_wishes")
      .select("id", { count: "exact", head: true })
      .eq("event_id", SHOWCASE_EVENT_ID);
    if ((count ?? 0) === 0) await restoreSamples(db);
    return { ok: true, present: true, restored: false };
  }

  const now = Date.now();
  if (!opts?.force && now - lastAttemptAt < 60_000) {
    return { ok: false, reason: "recently attempted" };
  }
  lastAttemptAt = now;

  const userId = await ensureShowcaseAccount();
  if (!userId) return { ok: false, reason: "Showcase system account unavailable" };

  const row = showcaseEventRow(userId, {
    hero: mediaUrl("hero.jpg"),
    voiceNote: mediaUrl("voice-note.mp3"),
    voiceNoteDuration: VOICE_NOTE_SECONDS,
    song: mediaUrl("song.mp3"),
  });

  const { error: insertErr } = await db.from("events").insert(row as never);
  // A parallel worker may have won the race; that is still success.
  if (insertErr && insertErr.code !== "23505") {
    return { ok: false, reason: insertErr.message };
  }

  // The cleanup must never treat the showcase as something an owner removed.
  await db.from("demo_seed_tombstones").delete().eq("kind", "event").eq("row_key", SHOWCASE_EVENT_ID);

  const samples = await restoreSamples(db);
  if (!samples.ok) return { ok: false, reason: samples.reason };
  return { ok: true, present: true, restored: true };
}

async function restoreSamples(
  db: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await db.rpc("restore_showcase_samples", {
    _wishes: SHOWCASE_WELL_WISHES as never,
    _comments: SHOWCASE_COMMENTS as never,
    _photos: SHOWCASE_PHOTOS.map((p) => ({
      storagePath: `${SHOWCASE_MEDIA_PREFIX}/${p.file}`,
      uploaderLabel: p.uploaderLabel,
    })) as never,
    _bring_items: SHOWCASE_BRING_ITEMS as never,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

/** True when the showcase row is in the database right now. Read only. */
export async function showcaseExists(): Promise<boolean> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data } = await db.from("events").select("id").eq("id", SHOWCASE_EVENT_ID).maybeSingle();
  return !!data;
}
