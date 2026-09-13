// Photo Wall server functions.
//
// Guests upload WITHOUT an account, so the browser never writes to storage
// directly (anon has no INSERT policy on storage.objects, by design). Every
// upload comes through `uploadEventPhoto`, which validates the event, the
// Photo Wall entitlement, the file, and a rate limit before writing with the
// service role and recording a row in public.event_photos.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  SOUNDTRACK_AUDIENCE,
  SOUNDTRACK_LOCKED_MESSAGE,
} from "@/lib/wall-soundtrack-access";
import { z } from "zod";
import { parseInput } from "@/lib/user-error";
import { nullSafe } from "@/lib/zod-nullsafe";
import type { Database } from "@/integrations/supabase/types";
import { isShowcaseEvent, SHOWCASE_READONLY_MESSAGE } from "@/lib/showcase";
import { assertPublicWriteAllowed } from "@/lib/demo-write-guard.server";

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
// Abuse limits: the wall is writable by anyone holding the invite link.
const PER_IP_LIMIT = 10;
const PER_IP_WINDOW_SECONDS = 600;
const PER_EVENT_LIMIT = 300;
const PER_EVENT_WINDOW_SECONDS = 86_400;

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function requestIpHash(): Promise<string> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const ip =
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-forwarded-for") ??
    getRequestHeader("x-real-ip") ??
    "unknown";
  return sha256Hex(`photo-wall-ip:${String(ip).split(",")[0]!.trim()}`);
}

async function assertPhotoWall(eventId: string) {
  const sb = publicClient();
  const { data, error } = await sb.rpc("get_event_public_entitlements", { _event_id: eventId });
  if (error) throw new Error(error.message);
  const ent = (data ?? {}) as { photoWall?: boolean };
  if (ent.photoWall !== true) throw new Error("Photo Wall isn't enabled for this event.");
}

/** Public: the visible photos for an event (used by the wall and the invite page). */
export const listEventPhotos = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z.object({ eventId: z.string().min(1) })), input, "input"),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: rows, error } = await sb.rpc("get_public_event_photos", {
      _event_id: data.eventId,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      label: r.uploader_label,
      createdAt: r.created_at,
      url: sb.storage.from("event-photos").getPublicUrl(r.storage_path).data.publicUrl,
    }));
  });

/** Public: guest upload. Base64 payload keeps this inside the server-fn RPC contract. */
export const uploadEventPhoto = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1),
        fileName: z.string().min(1).max(200),
        contentType: z.string().min(3).max(100),
        label: z.string().trim().max(60).optional(),
        dataBase64: z.string().min(16),
      })), input, "input"),
  )
  .handler(async ({ data }) => {
    // The showcase wall is read-only: a stranger scanning a business card must
    // never be able to put an image in front of the next person who scans one.
    if (isShowcaseEvent(data.eventId)) throw new Error(SHOWCASE_READONLY_MESSAGE);
    await assertPublicWriteAllowed(data.eventId);
    if (!ALLOWED_TYPES.includes(data.contentType.toLowerCase())) {
      throw new Error("Only JPG, PNG, WebP or GIF images can be added.");
    }
    await assertPhotoWall(data.eventId);

    const bytes = Uint8Array.from(atob(data.dataBase64), (c) => c.charCodeAt(0));
    if (bytes.byteLength === 0) throw new Error("That file appears to be empty.");
    if (bytes.byteLength > MAX_PHOTO_BYTES) throw new Error("Each photo must be under 20MB.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, archived_at")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!event) throw new Error("We couldn't find that event.");
    if (event.archived_at) throw new Error("This event is closed to new photos.");

    const ipHash = await requestIpHash();
    const { data: ipOk } = await supabaseAdmin.rpc("check_event_photo_rate_limit", {
      _key: `ip:${ipHash}`,
      _limit: PER_IP_LIMIT,
      _window_seconds: PER_IP_WINDOW_SECONDS,
    });
    if (ipOk === false) {
      throw new Error("That's a lot of photos at once. Give it a few minutes and try again.");
    }
    const { data: eventOk } = await supabaseAdmin.rpc("check_event_photo_rate_limit", {
      _key: `event:${data.eventId}`,
      _limit: PER_EVENT_LIMIT,
      _window_seconds: PER_EVENT_WINDOW_SECONDS,
    });
    if (eventOk === false) {
      throw new Error("This wall has reached today's photo limit. It resets in 24 hours.");
    }

    const ext = (data.contentType.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const rand = Math.random().toString(36).slice(2, 9);
    const path = `${data.eventId}/${Date.now()}-${rand}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("event-photos")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: row, error: insErr } = await supabaseAdmin
      .from("event_photos")
      .insert({
        event_id: data.eventId,
        storage_path: path,
        uploader_label: data.label?.trim() || null,
        ip_hash: ipHash,
        byte_size: bytes.byteLength,
        content_type: data.contentType,
      })
      .select("id")
      .single();
    if (insErr) {
      await supabaseAdmin.storage.from("event-photos").remove([path]);
      throw new Error(insErr.message);
    }

    const url = supabaseAdmin.storage.from("event-photos").getPublicUrl(path).data.publicUrl;
    return { id: row.id, url };
  });

/** Host: every photo including hidden ones, for the moderation panel. */
export const listEventPhotosForHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z.object({ eventId: z.string().min(1) })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    const { data: canEdit } = await context.supabase.rpc("can_edit_event", {
      _event_id: data.eventId,
      _user_id: context.userId,
    });
    if (!canEdit) throw new Error("You don't have access to this event.");
    const { data: rows, error } = await context.supabase
      .from("event_photos")
      .select("id, storage_path, uploader_label, status, created_at")
      .eq("event_id", data.eventId)
      .neq("status", "removed")
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);
    const sb = publicClient();
    return (rows ?? []).map((r) => ({
      id: r.id,
      label: r.uploader_label,
      status: r.status as "visible" | "hidden",
      createdAt: r.created_at,
      path: r.storage_path,
      url: sb.storage.from("event-photos").getPublicUrl(r.storage_path).data.publicUrl,
    }));
  });

/** Host: hide (keeps the file) or remove (deletes the file) a photo. */
export const moderateEventPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1),
        photoId: z.string().uuid(),
        action: z.enum(["hide", "show", "remove"]),
      })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    const { data: canEdit } = await context.supabase.rpc("can_edit_event", {
      _event_id: data.eventId,
      _user_id: context.userId,
    });
    if (!canEdit) throw new Error("You don't have access to this event.");

    const { data: photo, error: readErr } = await context.supabase
      .from("event_photos")
      .select("id, storage_path")
      .eq("id", data.photoId)
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!photo) throw new Error("That photo is no longer there.");

    if (data.action === "remove") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("event-photos").remove([photo.storage_path]);
      const { error } = await context.supabase
        .from("event_photos")
        .update({ status: "removed" })
        .eq("id", photo.id);
      if (error) throw new Error(error.message);
      return { ok: true, status: "removed" as const };
    }

    const next = data.action === "hide" ? "hidden" : "visible";
    const { error } = await context.supabase
      .from("event_photos")
      .update({ status: next })
      .eq("id", photo.id);
    if (error) throw new Error(error.message);
    return { ok: true, status: next };
  });

// ---------------------------------------------------------------------------
// Soundtrack. Three kinds of entry live in event_wall_music:
//   upload — the host's own licensed/royalty-free file, affirmed in writing
//   ai     — an original song composed for this event, so it is ours to play
//   link   — a Spotify / Apple / Amazon launch card, rendered but never played
//            through our page (nobody licences that audio for a slideshow)
// ---------------------------------------------------------------------------

import {
  AI_SONG_CREDIT,
  AI_SONG_MAX_SECONDS,
  AI_SONG_SECONDS,
  DEFAULT_SONG_SETTINGS,
  MAX_MUSIC_BYTES,
  MAX_MUSIC_SECONDS,
  MUSIC_LICENCE_TEXT,
  SAMPLE_HOURLY_UNITS,
  SAMPLE_LIMIT_MESSAGE,
  SAMPLE_SONG_SECONDS,
  sampleUnitCost,

  capFor,
  capMessage,
  compileSongPrompt,
  crossfadeMs,
  fallbackLinkTitle,
  isMoment,
  parseMusicLink,
  placementFor,
  poemWordBudget,

  type MusicSource,
  type SongSettings,
} from "@/lib/wall-soundtrack";

export {
  AI_SONG_CREDIT,
  MAX_MUSIC_BYTES,
  MAX_MUSIC_SECONDS,
  MUSIC_LICENCE_TEXT,
} from "@/lib/wall-soundtrack";

const ALLOWED_AUDIO = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
];

const MUSIC_SELECT =
  "id, storage_path, title, artist, duration_seconds, source, order_index, bpm, energy, crossfade_ms, link_url, link_provider, link_title, link_art_url, prompt, settings, created_at";

type MusicRow = {
  id: string;
  storage_path: string | null;
  title: string;
  artist: string | null;
  duration_seconds: number | null;
  source: string;
  order_index: number;
  bpm: number | null;
  energy: number | null;
  crossfade_ms: number;
  link_url: string | null;
  link_provider: string | null;
  link_title: string | null;
  link_art_url: string | null;
  prompt: string | null;
  settings: unknown;
};

function shapeTrack(row: MusicRow, publicUrl: (path: string) => string) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    seconds: row.duration_seconds,
    source: row.source as MusicSource,
    order: row.order_index,
    bpm: row.bpm,
    energy: row.energy === null ? null : Number(row.energy),
    crossfadeMs: row.crossfade_ms,
    prompt: row.prompt,
    settings: (row.settings ?? {}) as Partial<SongSettings>,
    link:
      row.source === "link" && row.link_url
        ? {
            url: row.link_url,
            provider: row.link_provider ?? "spotify",
            title: row.link_title ?? row.title,
            artUrl: row.link_art_url,
          }
        : null,
    url: row.storage_path ? publicUrl(row.storage_path) : null,
  };
}

export type WallTrack = ReturnType<typeof shapeTrack>;

/**
 * Mirror a wall-composed piece into the single studio library.
 *
 * The audio is NOT copied: the library row points at the same object in the
 * public wall bucket, so the slideshow keeps streaming exactly the file it
 * always did and the crossfade, silence trim and loudness work in
 * wall-soundtrack.ts is untouched. The library row carries the brief plus the
 * measurements so the piece can be remixed or extended later.
 *
 * Best effort by design: if the library write fails the song still exists on
 * the wall and the host is not shown an error for a bookkeeping problem.
 */
async function mirrorWallPieceToLibrary(input: {
  trackId: string;
  userId: string;
  eventId: string;
  kind: string;
  title: string;
  words: string;
  settings: unknown;
  seconds: number;
  storagePath: string;
  prompt: string | null;
  bpm: number | null;
  energy: number | null;
  introMs?: number | null;
  outroMs?: number | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("sound_pieces").insert({
      user_id: input.userId,
      kind: input.kind === "poem" ? "poem" : "song",
      title: input.title,
      words: input.words ?? "",
      settings: (input.settings ?? {}) as never,
      seconds: input.seconds,
      storage_path: input.storagePath,
      storage_bucket: "event-photos",
      origin: "wall",
      wall_music_id: input.trackId,
      event_id: input.eventId,
      prompt: input.prompt,
      bpm: input.bpm,
      energy: input.energy,
      intro_ms: input.introMs ?? null,
      outro_ms: input.outroMs ?? null,
    });
  } catch {
    // Ignored on purpose: see above.
  }
}

type CanEditClient = {
  rpc: (
    fn: "can_edit_event",
    args: { _event_id: string; _user_id: string },
  ) => PromiseLike<{ data: unknown }>;
};

async function assertCanEdit(supabase: CanEditClient, eventId: string, userId: string) {
  const { data: canEdit } = await supabase.rpc("can_edit_event", {
    _event_id: eventId,
    _user_id: userId,
  });
  if (!canEdit) throw new Error("You don't have access to this event.");
}

async function hasAtelierSubscription(supabase: any, userId: string): Promise<boolean> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("price_id,status,current_period_end")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return false;
  const active =
    ["active", "trialing", "past_due"].includes(String(sub.status)) &&
    (!sub.current_period_end || new Date(sub.current_period_end) > new Date());
  if (!active) return false;
  const priceId = String(sub.price_id ?? "");
  return priceId.includes("atelier") || priceId.startsWith("studio_collective");
}

/**
 * Soundtrack tools are audience-gated (see wall-soundtrack-access.ts). Today
 * they are owner-only because AI composing and hosted audio cost money per use.
 * Flip SOUNDTRACK_AUDIENCE there to open them back up to customers.
 */
async function assertSoundtrackAccess(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> },
  userId: string,
) {
  const [{ data: isOwner }, { data: isSuper }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "owner" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  const viewerIsOwner = !!isOwner || !!isSuper;
  if (viewerIsOwner) return;
  if (SOUNDTRACK_AUDIENCE === "everyone") return;
  if (SOUNDTRACK_AUDIENCE === "atelier" && (await hasAtelierSubscription(supabase, userId))) return;
  throw new Error(SOUNDTRACK_LOCKED_MESSAGE);
}

async function assertRoom(eventId: string, source: MusicSource) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("event_wall_music")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("source", source);
  if ((count ?? 0) >= capFor(source)) throw new Error(capMessage(source));
}

async function nextOrderIndex(eventId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("event_wall_music")
    .select("order_index")
    .eq("event_id", eventId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.order_index as number | undefined) ?? -1) + 1;
}

/**
 * Public: the ordered soundtrack for one event.
 *
 * anon has no privileges on event_wall_music (a broad public SELECT policy let
 * anyone enumerate every event's audio paths), so the read runs with the service
 * role and is hard-filtered to the single event in the request.
 */
export const listWallMusic = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z.object({ eventId: z.string().min(1) })), input, "input"),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("event_wall_music")
      .select(MUSIC_SELECT)
      .eq("event_id", data.eventId)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const publicUrl = (path: string) =>
      sb.storage.from("event-photos").getPublicUrl(path).data.publicUrl;
    const tracks = (rows ?? []).map((r) => shapeTrack(r as MusicRow, publicUrl));

    // Transition per adjacent pair, wrapping so the loop back to the top is
    // treated like any other change of track. A "moment" piece (a letter, or a
    // poem the host placed as a moment) is not part of the loop at all, so it is
    // left out of this arithmetic and never crossfaded into a song.
    const audible = tracks.filter((t) => t.url && !isMoment(t.settings));
    audible.forEach((t, i) => {
      const next = audible[(i + 1) % audible.length];
      t.crossfadeMs = audible.length > 1 && next ? crossfadeMs(t, next) : t.crossfadeMs;
    });
    return tracks;
  });

/** Host: upload one licensed track. */
export const uploadWallMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1),
        title: z.string().trim().min(1).max(120),
        artist: z.string().trim().max(120).optional(),
        contentType: z.string().min(3).max(100),
        durationSeconds: z.number().int().positive().max(3600),
        licenceAffirmed: z.literal(true),
        dataBase64: z.string().min(16),
        bpm: z.number().int().min(20).max(220).nullable().optional(),
        energy: z.number().min(0).max(1).nullable().optional(),
      })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.eventId, context.userId);
    await assertSoundtrackAccess(context.supabase as any, context.userId);
    await assertPhotoWall(data.eventId);
    if (!ALLOWED_AUDIO.includes(data.contentType.toLowerCase())) {
      throw new Error("Upload an MP3, M4A, WAV or OGG audio file.");
    }
    if (data.durationSeconds > MAX_MUSIC_SECONDS) {
      throw new Error("Each track must be 5 minutes or shorter.");
    }

    const bytes = Uint8Array.from(atob(data.dataBase64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > MAX_MUSIC_BYTES) throw new Error("Each track must be under 10MB.");
    await assertRoom(data.eventId, "upload");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const type = data.contentType.toLowerCase();
    const ext = type.includes("ogg")
      ? "ogg"
      : type.includes("wav")
        ? "wav"
        : type.includes("mp4") || type.includes("m4a")
          ? "m4a"
          : "mp3";
    const path = `${data.eventId}/music/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("event-photos")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { error: insErr } = await supabaseAdmin.from("event_wall_music").insert({
      event_id: data.eventId,
      storage_path: path,
      title: data.title.trim(),
      artist: data.artist?.trim() || null,
      duration_seconds: Math.round(data.durationSeconds),
      byte_size: bytes.byteLength,
      uploaded_by: context.userId,
      licence_affirmation_text: MUSIC_LICENCE_TEXT,
      source: "upload",
      order_index: await nextOrderIndex(data.eventId),
      bpm: data.bpm ?? null,
      energy: data.energy ?? null,
    });
    if (insErr) {
      await supabaseAdmin.storage.from("event-photos").remove([path]);
      throw new Error(insErr.message);
    }
    return { ok: true };
  });

/**
 * Host: add a streaming playlist as a launch card. We store the URL and any
 * title/art the provider publishes; we never fetch or proxy the audio.
 */
export const addWallMusicLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1),
        url: z.string().trim().min(4).max(2000),
        title: z.string().trim().max(160).optional(),
      })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.eventId, context.userId);
    await assertSoundtrackAccess(context.supabase as any, context.userId);
    await assertPhotoWall(data.eventId);
    const parsed = parseMusicLink(data.url);
    if (!parsed) {
      throw new Error("Paste a Spotify, Apple Music or Amazon Music link.");
    }
    await assertRoom(data.eventId, "link");

    let title = data.title?.trim() || "";
    let artUrl: string | null = null;
    if (parsed.provider === "spotify" || parsed.provider === "apple") {
      try {
        const endpoint =
          parsed.provider === "spotify"
            ? `https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.url)}`
            : `https://music.apple.com/api/v1/oembed?url=${encodeURIComponent(parsed.url)}`;
        const res = await fetch(endpoint, { headers: { accept: "application/json" } });
        if (res.ok) {
          const meta = (await res.json()) as { title?: string; thumbnail_url?: string };
          if (!title && meta.title) title = String(meta.title).slice(0, 160);
          if (meta.thumbnail_url) artUrl = String(meta.thumbnail_url).slice(0, 2000);
        }
      } catch {
        // Metadata is decoration; the card still works without it.
      }
    }
    if (!title) title = fallbackLinkTitle(parsed.provider);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("event_wall_music").insert({
      event_id: data.eventId,
      storage_path: null,
      title,
      uploaded_by: context.userId,
      licence_affirmation_text: "Streaming link card only. No audio is hosted or played by us.",
      source: "link",
      order_index: await nextOrderIndex(data.eventId),
      link_url: parsed.url,
      link_provider: parsed.provider,
      link_title: title,
      link_art_url: artUrl,
    });
    if (error) throw new Error(error.message);
    return { ok: true, provider: parsed.provider };
  });

/**
 * Host: compose an original song for this event.
 *
 * The host's choices are compiled into one musical prompt (polished by the text
 * model when it is available, deterministic otherwise), then handed to the music
 * model. The result is stored once and never regenerated, so a 30-second bed can
 * score a wall of any length through looping.
 */
export const generateWallSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1),
        kind: z.enum(["song", "poem"]).default("song"),
        words: z.string().trim().max(400).default(""),
        genre: z.string().trim().min(1).max(40),
        mood: z.string().trim().min(1).max(40),
        voice: z.string().trim().min(1).max(40),
        poemStyle: z.string().trim().max(60).default("spoken word tribute"),
        poemText: z.string().trim().max(1500).default(""),
        tempo: z.number().int().min(1).max(5),
        bass: z.number().int().min(1).max(5),
        brightness: z.number().int().min(1).max(5),

        seconds: z.number().int().min(10).max(AI_SONG_MAX_SECONDS).optional(),
        title: z.string().trim().max(120).optional(),
        artist: z.string().trim().max(120).optional(),
        // Musical direction from a sample the host already approved, so the full
        // song matches what they heard instead of being re-polished into a drift.
        prompt: z.string().trim().min(20).max(1200).optional(),
      })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.eventId, context.userId);
    await assertSoundtrackAccess(context.supabase as any, context.userId);
    await assertPhotoWall(data.eventId);
    await assertRoom(data.eventId, "ai");

    const apiKey = process.env["ELEVENLABS_API_KEY"];
    if (!apiKey) throw new Error("AI song composing isn't configured yet.");

    const { data: eventRow } = await context.supabase
      .from("events")
      .select("data")
      .eq("id", data.eventId)
      .maybeSingle();
    const eventTitle =
      typeof (eventRow?.data as { title?: unknown } | null)?.title === "string"
        ? (eventRow!.data as { title: string }).title
        : undefined;

    const settings: SongSettings = {
      kind: data.kind,
      words: data.words,
      genre: data.genre,
      mood: data.mood,
      voice: data.voice,
      poemStyle: data.poemStyle,
      poemText: data.poemText,
      tempo: data.tempo,
      bass: data.bass,
      brightness: data.brightness,
    };
    const basePrompt = compileSongPrompt(settings, eventTitle);
    const prompt = data.prompt?.trim() || (await polishSongPrompt(basePrompt, data.kind));


    const lengthMs = Math.min(
      AI_SONG_MAX_SECONDS * 1000,
      Math.max(10_000, Math.round((data.seconds ?? AI_SONG_SECONDS) * 1000)),
    );
    // A three or four minute song is a long round trip. If the connection drops
    // part way we say so in plain words and point at a shorter length, rather
    // than surfacing a raw network error.
    let res: Response;
    try {
      res = await fetch("https://api.elevenlabs.io/v1/music", {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, music_length_ms: lengthMs }),
      });
    } catch {
      throw new Error(
        lengthMs > 120_000
          ? "That long a song took too long to come back. Try 1 or 2 minutes, then loop it on the wall."
          : "The music service didn't answer. Try composing again in a moment.",
      );
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("The music service is busy. Try again in a moment.");
      throw new Error(
        detail.slice(0, 200) || `Couldn't compose that song right now (${res.status}).`,
      );
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.byteLength < 1024) throw new Error("The composer returned an empty track.");

    const bpm = [65, 80, 100, 118, 135][data.tempo - 1]!;
    const energy = Math.min(1, Math.max(0, (data.tempo * 0.15 + data.bass * 0.05) / 1.0 - 0.05));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${data.eventId}/music/ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("event-photos")
      .upload(path, audio, { contentType: "audio/mpeg", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const title =
      data.title?.trim() ||
      `${data.mood} ${data.genre} (AI)`.replace(/\b\w/g, (c) => c.toUpperCase());
    const { data: insertedTrack, error: insErr } = await supabaseAdmin
      .from("event_wall_music")
      .insert({
        event_id: data.eventId,
        storage_path: path,
        title: title.slice(0, 120),
        artist: data.artist?.trim().slice(0, 120) || null,
        duration_seconds: Math.round(lengthMs / 1000),
        byte_size: audio.byteLength,
        uploaded_by: context.userId,
        licence_affirmation_text: AI_SONG_CREDIT,
        source: "ai",
        prompt,
        settings: settings as unknown as never,
        order_index: await nextOrderIndex(data.eventId),
        bpm,
        energy,
      })
      .select("id")
      .single();
    if (insErr || !insertedTrack) {
      await supabaseAdmin.storage.from("event-photos").remove([path]);
      throw new Error(insErr?.message ?? "Couldn't save that song.");
    }
    // Every composed piece also belongs in the one studio library, whichever
    // door it came through. The wall row stays the source of truth for
    // playback (order, crossfade, trimming); the library entry points at the
    // same audio file so nothing is copied and playback is untouched.
    await mirrorWallPieceToLibrary({
      trackId: (insertedTrack as { id: string }).id,
      userId: context.userId,
      eventId: data.eventId,
      kind: data.kind,
      title: title.slice(0, 120),
      words: data.kind === "poem" ? data.poemText : data.words,
      settings,
      seconds: Math.round(lengthMs / 1000),
      storagePath: path,
      prompt,
      bpm,
      energy,
    });
    return { ok: true, prompt };
  });

/**
 * Host: compose a short throwaway taste of the song before paying for the full
 * length. Nothing is stored: the audio comes straight back to the browser, so
 * the track list, the wall caps and the invitation are all untouched. The
 * polished musical direction is returned with it so the full compose can reuse
 * the exact take the host approved, names and pronunciation included.
 */
export const sampleWallSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1),
        kind: z.enum(["song", "poem"]).default("song"),
        words: z.string().trim().max(400).default(""),
        genre: z.string().trim().min(1).max(40),
        mood: z.string().trim().min(1).max(40),
        voice: z.string().trim().min(1).max(40),
        poemStyle: z.string().trim().max(60).default("spoken word tribute"),
        poemText: z.string().trim().max(1500).default(""),
        tempo: z.number().int().min(1).max(5),
        bass: z.number().int().min(1).max(5),
        brightness: z.number().int().min(1).max(5),

        // 10, 20 or 30 seconds. Longer tastes cost more of the hourly allowance.
        seconds: z.union([z.literal(10), z.literal(20), z.literal(30)]).optional(),

      })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.eventId, context.userId);
    await assertSoundtrackAccess(context.supabase as any, context.userId);
    await assertPhotoWall(data.eventId);

    const apiKey = process.env["ELEVENLABS_API_KEY"];
    if (!apiKey) throw new Error("AI song composing isn't configured yet.");

    const seconds = data.seconds ?? SAMPLE_SONG_SECONDS;
    const cost = sampleUnitCost(seconds);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 3_600_000).toISOString();
    // Metered in ten-second units, so a 30-second taste counts as three. Older
    // rows predate the length choice and are read as the shortest sample.
    const { data: recent } = await supabaseAdmin
      .from("event_activity_log")
      .select("details")
      .eq("event_id", data.eventId)
      .eq("action", "wall_song_sample")
      .gte("occurred_at", since)
      .limit(200);
    const used = (recent ?? []).reduce((sum, row) => {
      const secs = (row.details as { seconds?: unknown } | null)?.seconds;
      return sum + sampleUnitCost(typeof secs === "number" ? secs : SAMPLE_SONG_SECONDS);
    }, 0);
    if (used + cost > SAMPLE_HOURLY_UNITS) throw new Error(SAMPLE_LIMIT_MESSAGE);


    const { data: eventRow } = await context.supabase
      .from("events")
      .select("data")
      .eq("id", data.eventId)
      .maybeSingle();
    const eventTitle =
      typeof (eventRow?.data as { title?: unknown } | null)?.title === "string"
        ? (eventRow!.data as { title: string }).title
        : undefined;

    const settings: SongSettings = {
      kind: data.kind,
      words: data.words,
      genre: data.genre,
      mood: data.mood,
      voice: data.voice,
      poemStyle: data.poemStyle,
      poemText: data.poemText,
      tempo: data.tempo,
      bass: data.bass,
      brightness: data.brightness,
    };
    const prompt = await polishSongPrompt(compileSongPrompt(settings, eventTitle), data.kind);


    const res = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, music_length_ms: seconds * 1000 }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("The music service is busy. Try again in a moment.");
      throw new Error(
        detail.slice(0, 200) || `Couldn't make a sample right now (${res.status}).`,
      );
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.byteLength < 1024) throw new Error("The composer returned an empty sample.");

    await supabaseAdmin.from("event_activity_log").insert({
      event_id: data.eventId,
      action: "wall_song_sample",
      actor_type: "host",
      actor_user_id: context.userId,
      details: { seconds } as unknown as never,
    });

    return {
      ok: true as const,
      prompt,
      contentType: "audio/mpeg",
      seconds,
      samplesUsed: used + cost,
      samplesLeft: Math.max(0, SAMPLE_HOURLY_UNITS - (used + cost)),
      audioBase64: base64FromBytes(audio),
    };

  });

/** Chunked base64 so a sample never blows the argument stack. */
function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}


/**
 * Turns the compiled description into richer direction. Best effort: if the text
 * model is unavailable the deterministic prompt is used as-is, so a gateway blip
 * never blocks a host from getting a piece. Poems get their own brief, because a
 * spoken piece needs the voice in front and the music underneath, and the verse
 * must survive the rewrite word for word.
 */
async function polishSongPrompt(
  basePrompt: string,
  kind: "song" | "poem" = "song",
): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return basePrompt;
  try {
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway("google/gemini-3.6-flash"),
      system:
        kind === "poem"
          ? "You write prompts for a music model that can perform spoken word over music. Use American English spelling. Rewrite the request as clear direction for a spoken performance: the speaking voice, its pace and warmth, and a sparse instrumental bed sitting well under the voice. If exact words to be read are given, repeat them verbatim at the end under the line 'Words to read:' and change nothing in them, not a single word or name. No headings otherwise. Reply with the prompt only."
          : "You write prompts for a music generation model. Use American English spelling. Rewrite the request as one vivid paragraph of musical direction: instrumentation, groove, arrangement, vocal character, and how the piece grows from start to finish. Keep every constraint given, including any spelling of names. No lyrics, no headings, no more than 90 words. Reply with the prompt only.",
      prompt: basePrompt,
    });
    const cleaned = text.trim().replace(/^["']|["']$/g, "");
    return cleaned.length > 20 ? cleaned.slice(0, 1800) : basePrompt;
  } catch {
    return basePrompt;
  }
}

/**
 * Host: turn a few plain words into a stronger brief, or write the verse of a
 * poem outright. Text only, nothing is stored and no audio is made, so a host
 * can iterate on the words for free before spending anything on a performance.
 */
export const draftWallSongWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1),
        // "brief" strengthens the description; "poem" writes the verse itself.
        want: z.enum(["brief", "poem"]),
        words: z.string().trim().max(400).default(""),
        genre: z.string().trim().min(1).max(40),
        mood: z.string().trim().min(1).max(40),
        poemStyle: z.string().trim().max(60).default("spoken word tribute"),
        seconds: z.number().int().min(10).max(AI_SONG_MAX_SECONDS).default(AI_SONG_SECONDS),
      })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.eventId, context.userId);
    await assertSoundtrackAccess(context.supabase as any, context.userId);

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("The writing assistant isn't configured yet.");

    const { data: eventRow } = await context.supabase
      .from("events")
      .select("data")
      .eq("id", data.eventId)
      .maybeSingle();
    const eventTitle =
      typeof (eventRow?.data as { title?: unknown } | null)?.title === "string"
        ? (eventRow!.data as { title: string }).title
        : "";

    const budget = poemWordBudget(data.seconds);
    const system =
      data.want === "poem"
        ? `You write short pieces to be read aloud at a family celebration. Use American English spelling. Write a ${data.poemStyle} that feels ${data.mood}. About ${budget} words, in short lines, no title, no stage directions, no emoji. Use only names and facts the host gave you and invent nothing about the people. Warm and specific, never greeting-card generic. Reply with the poem only.`
        : "You help a host describe the piece of music they want. Use American English spelling. Rewrite their notes as three or four vivid sentences: who it is for, the feeling, the moment it plays, and any names spelled the way they should be pronounced. Keep every fact they gave and invent no new ones. No lists, no headings, under 90 words. Reply with the description only.";

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);
    const lines = [
      data.words ? `Host's notes: ${data.words}` : "Host gave no notes yet.",
      eventTitle ? `Event: ${eventTitle}` : "",
      `Style: ${data.mood} ${data.genre}`,
    ].filter(Boolean);

    let text = "";
    try {
      const res = await generateText({
        model: gateway("google/gemini-3.6-flash"),
        system,
        prompt: lines.join("\n"),
      });
      text = res.text.trim();
    } catch {
      throw new Error("The writing assistant is busy. Try again in a moment.");
    }
    if (text.length < 10) throw new Error("Couldn't write that yet. Add a little more detail.");
    return { ok: true as const, text: text.slice(0, 1500) };
  });


/** Host: reorder the soundtrack. */
export const reorderWallMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1),
        trackIds: z.array(z.string().uuid()).min(1).max(20),
      })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.eventId, context.userId);
    await assertSoundtrackAccess(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const [index, id] of data.trackIds.entries()) {
      const { error } = await supabaseAdmin
        .from("event_wall_music")
        .update({ order_index: index })
        .eq("id", id)
        .eq("event_id", data.eventId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Host: remove a track or link card. */
export const deleteWallMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z.object({ eventId: z.string().min(1), trackId: z.string().uuid() })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.eventId, context.userId);
    await assertSoundtrackAccess(context.supabase as any, context.userId);
    const { data: track } = await context.supabase
      .from("event_wall_music")
      .select("id, storage_path")
      .eq("id", data.trackId)
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (!track) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The library entry for a wall-composed piece points at this same audio
    // file, so it goes when the file goes. Studio pieces are never touched.
    await supabaseAdmin
      .from("sound_pieces")
      .delete()
      .eq("wall_music_id", track.id)
      .eq("origin", "wall");
    if (track.storage_path) {
      await supabaseAdmin.storage.from("event-photos").remove([track.storage_path]);
    }
    const { error } = await context.supabase.from("event_wall_music").delete().eq("id", track.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Host: rename a track, AI song or playlist card.
 *
 * The name is what a guest reads: on the wall's now-playing label and, when the
 * song is attached to an invitation, on the invitation card itself. Playlist
 * rows carry a second copy of the name for the launch card, so both are updated.
 */
export const renameWallMusic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1),
        trackId: z.string().uuid(),
        title: z.string().trim().min(1).max(120),
      })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.eventId, context.userId);
    await assertSoundtrackAccess(context.supabase as any, context.userId);
    const { data: track } = await context.supabase
      .from("event_wall_music")
      .select("id, source")
      .eq("id", data.trackId)
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (!track) throw new Error("That track is no longer on this event.");
    const title = data.title.trim().slice(0, 120);
    const patch: { title: string; link_title?: string } = { title };
    if (track.source === "link") patch.link_title = title;
    const { error } = await context.supabase
      .from("event_wall_music")
      .update(patch)
      .eq("id", track.id)
      .eq("event_id", data.eventId);
    if (error) throw new Error(error.message);
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("sound_pieces")
        .update({ title })
        .eq("wall_music_id", track.id)
        .eq("origin", "wall");
    }
    return { ok: true, title };
  });

/**
 * Host: re-compose an AI song in place, keeping its name, artist, settings and
 * position. The stored prompt drives the new take, so the result stays in the
 * same musical direction. The previous audio is only replaced once a new take
 * is fully generated and uploaded — a failed regenerate never loses a good one.
 */
export const regenerateWallSong = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z.object({ eventId: z.string().min(1), trackId: z.string().uuid() })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.eventId, context.userId);
    await assertSoundtrackAccess(context.supabase as any, context.userId);
    await assertPhotoWall(data.eventId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: track } = await supabaseAdmin
      .from("event_wall_music")
      .select("id, storage_path, prompt, settings, duration_seconds, source")
      .eq("id", data.trackId)
      .eq("event_id", data.eventId)
      .maybeSingle();
    if (!track || track.source !== "ai" || !track.storage_path) {
      throw new Error("Only an AI-composed song on this event can be recomposed.");
    }

    const apiKey = process.env["ELEVENLABS_API_KEY"];
    if (!apiKey) throw new Error("AI song composing isn't configured yet.");

    const prompt =
      track.prompt?.trim() ||
      compileSongPrompt({
        ...DEFAULT_SONG_SETTINGS,
        ...((track.settings ?? {}) as Partial<SongSettings>),
      } as SongSettings);
    const lengthMs = Math.max(
      10_000,
      Math.round((track.duration_seconds ?? AI_SONG_SECONDS) * 1000),
    );
    const res = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, music_length_ms: lengthMs }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("The music service is busy. Try again in a moment.");
      throw new Error(
        detail.slice(0, 200) || `Couldn't recompose that song right now (${res.status}).`,
      );
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.byteLength < 1024) throw new Error("The composer returned an empty track.");

    // Replace the audio at the same path so the invitation link, if any, keeps
    // working and now plays the new take.
    const { error: upErr } = await supabaseAdmin.storage
      .from("event-photos")
      .upload(track.storage_path, audio, { contentType: "audio/mpeg", upsert: true });
    if (upErr) throw new Error(upErr.message);

    await supabaseAdmin
      .from("sound_pieces")
      .update({ seconds: Math.round(lengthMs / 1000) })
      .eq("wall_music_id", track.id)
      .eq("origin", "wall");

    const { error: updErr } = await supabaseAdmin
      .from("event_wall_music")
      .update({
        byte_size: audio.byteLength,
        duration_seconds: Math.round(lengthMs / 1000),
      })
      .eq("id", track.id);
    if (updErr) throw new Error(updErr.message);
    return { ok: true };
  });

/**
 * Owner: AI songs already composed for any event this person can edit, so one
 * can be reused on another event without paying for a second generation.
 */
export const listReusableAiSongs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z.object({ excludeEventId: z.string().min(1) })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertSoundtrackAccess(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("event_wall_music")
      .select("id, event_id, title, artist, duration_seconds")
      .eq("source", "ai")
      .neq("event_id", data.excludeEventId)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);

    const out: {
      trackId: string;
      eventId: string;
      eventTitle: string;
      title: string;
      artist: string | null;
      seconds: number | null;
    }[] = [];
    const titleCache = new Map<string, string>();
    for (const row of rows ?? []) {
      const { data: canEdit } = await context.supabase.rpc("can_edit_event", {
        _event_id: row.event_id,
        _user_id: context.userId,
      });
      if (!canEdit) continue;
      let eventTitle = titleCache.get(row.event_id);
      if (eventTitle === undefined) {
        const { data: ev } = await supabaseAdmin
          .from("events")
          .select("data")
          .eq("id", row.event_id)
          .maybeSingle();
        const t = (ev?.data as { title?: unknown } | null)?.title;
        eventTitle = typeof t === "string" ? t : "Another event";
        titleCache.set(row.event_id, eventTitle);
      }
      out.push({
        trackId: row.id,
        eventId: row.event_id,
        eventTitle,
        title: row.title,
        artist: row.artist,
        seconds: row.duration_seconds,
      });
    }
    return out;
  });

/**
 * Host: copy an AI song onto another event. The audio file is duplicated in
 * storage (cheap, no regeneration) and the new copy counts against the target
 * event's AI cap, so per-event limits still hold.
 */
export const copyWallSongToEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        trackId: z.string().uuid(),
        targetEventId: z.string().min(1),
      })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.targetEventId, context.userId);
    await assertSoundtrackAccess(context.supabase as any, context.userId);
    await assertPhotoWall(data.targetEventId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: src } = await supabaseAdmin
      .from("event_wall_music")
      .select(
        "id, event_id, storage_path, title, artist, duration_seconds, byte_size, prompt, settings, bpm, energy, source",
      )
      .eq("id", data.trackId)
      .maybeSingle();
    if (!src || src.source !== "ai" || !src.storage_path) {
      throw new Error("Only an AI-composed song can be reused.");
    }
    if (src.event_id === data.targetEventId) throw new Error("That song is already on this event.");
    await assertCanEdit(context.supabase, src.event_id, context.userId);
    await assertRoom(data.targetEventId, "ai");

    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from("event-photos")
      .download(src.storage_path);
    if (dlErr || !file) throw new Error("Couldn't read the original song file.");
    const bytes = new Uint8Array(await file.arrayBuffer());

    const path = `${data.targetEventId}/music/ai-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.mp3`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("event-photos")
      .upload(path, bytes, { contentType: "audio/mpeg", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { error: insErr } = await supabaseAdmin.from("event_wall_music").insert({
      event_id: data.targetEventId,
      storage_path: path,
      title: src.title,
      artist: src.artist,
      duration_seconds: src.duration_seconds,
      byte_size: bytes.byteLength,
      uploaded_by: context.userId,
      licence_affirmation_text: AI_SONG_CREDIT,
      source: "ai",
      prompt: src.prompt,
      settings: src.settings as never,
      order_index: await nextOrderIndex(data.targetEventId),
      bpm: src.bpm,
      energy: src.energy,
    });
    if (insErr) {
      await supabaseAdmin.storage.from("event-photos").remove([path]);
      throw new Error(insErr.message);
    }
    return { ok: true, title: src.title };
  });

/**
 * Host: place a saved studio piece (song, poem or letter) on this event's wall.
 *
 * Studio pieces live in the private sound-pieces bucket, and the wall streams
 * public files, so the audio is copied into the same public wall storage every
 * other wall track already uses. That keeps a paid piece unbrowsable and leaves
 * the crossfade, silence trimming and loudness work untouched.
 *
 * Placement is decided by `placementFor`, not by the caller: a letter is always
 * a moment played once, because a letter looping under a slideshow all night
 * would be absurd. Letters count against the same six-pieces-per-event cap.
 */
export const attachPieceToWall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({
        eventId: z.string().min(1),
        pieceId: z.string().uuid(),
        /** Only honoured for a poem: "bed" loops, "moment" plays once. */
        placement: z.enum(["bed", "moment"]).default("bed"),
      })), input, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertCanEdit(context.supabase, data.eventId, context.userId);
    await assertSoundtrackAccess(context.supabase as any, context.userId);
    await assertPhotoWall(data.eventId);
    await assertRoom(data.eventId, "ai");

    const { data: piece } = await context.supabase
      .from("sound_pieces")
      .select("id, kind, title, seconds, storage_path, storage_bucket, settings, prompt")
      .eq("id", data.pieceId)
      .eq("user_id", context.userId)
      .is("removed_at", null)
      .maybeSingle();
    const row = piece as {
      id: string;
      kind: string;
      title: string;
      seconds: number;
      storage_path: string;
      storage_bucket: string | null;
      settings: unknown;
      prompt: string | null;
    } | null;
    if (!row) throw new Error("That piece can't be found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bucket = row.storage_bucket || "sound-pieces";
    const { data: file, error: dlErr } = await supabaseAdmin.storage
      .from(bucket)
      .download(row.storage_path);
    if (dlErr || !file) throw new Error("Couldn't read that piece's audio file.");
    const bytes = new Uint8Array(await file.arrayBuffer());

    const path = `${data.eventId}/music/ai-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.mp3`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("event-photos")
      .upload(path, bytes, { contentType: "audio/mpeg", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const placement = placementFor(row.kind, data.placement);
    const settings = {
      ...((row.settings ?? {}) as Record<string, unknown>),
      kind: row.kind,
      placement,
    };
    const { error: insErr } = await supabaseAdmin.from("event_wall_music").insert({
      event_id: data.eventId,
      storage_path: path,
      title: row.title.slice(0, 120),
      duration_seconds: Math.max(1, Math.round(row.seconds)),
      byte_size: bytes.byteLength,
      uploaded_by: context.userId,
      licence_affirmation_text: AI_SONG_CREDIT,
      source: "ai",
      prompt: row.prompt,
      settings: settings as never,
      order_index: await nextOrderIndex(data.eventId),
    });
    if (insErr) {
      await supabaseAdmin.storage.from("event-photos").remove([path]);
      throw new Error(insErr.message);
    }
    return { ok: true as const, title: row.title, placement, seconds: row.seconds };
  });
