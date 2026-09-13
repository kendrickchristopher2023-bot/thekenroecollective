/**
 * Folders and playlists for Kenroe Sound Studio.
 *
 * A playlist is organisation, never a copy: `sound_playlist_items` holds a
 * REFERENCE to a piece, so the same piece can sit in several playlists and
 * taking it out of one never touches the audio or the library row.
 *
 * Sharing is a private link by default. The public reader returns audio,
 * titles and order and nothing else: no brief, no words, no settings, no
 * owner id, no event id. Pieces taken down with `takedownPiece` set
 * `removed_at`, and the reader skips them, so a take-down empties the piece
 * out of every playlist it is in, including links already sent.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseInput } from "@/lib/user-error";
import { nullSafe } from "@/lib/zod-nullsafe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { downloadFileName } from "@/lib/sound-download-name";

const BUCKET = "sound-pieces";
const SIGNED_URL_SECONDS = 60 * 60 * 6;

/** Playable link for one piece, from whichever bucket its audio lives in. */
async function audioUrl(
  path: string,
  bucket: string | null | undefined,
  downloadAs?: string,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const from = bucket || BUCKET;
  if (from !== BUCKET) {
    const { data } = supabaseAdmin.storage
      .from(from)
      .getPublicUrl(path, downloadAs ? { download: downloadAs } : undefined);
    return data?.publicUrl ?? null;
  }
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS, downloadAs ? { download: downloadAs } : undefined);
  return data?.signedUrl ?? null;
}

const nameField = z.string().trim().min(1).max(80);

type PlaylistRow = {
  id: string;
  name: string;
  description: string | null;
  event_id: string | null;
  share_token: string;
  share_slug: string | null;
  created_at: string;
  updated_at: string;
};

/** My folders, each with its pieces in playing order. */
export const listMyPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: plData } = await context.supabase
      .from("sound_playlists")
      .select("id, name, description, event_id, share_token, share_slug, created_at, updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    const playlists = (plData ?? []) as PlaylistRow[];
    if (!playlists.length) return { playlists: [] };

    const { data: itemData } = await context.supabase
      .from("sound_playlist_items")
      .select("id, playlist_id, piece_id, position")
      .in(
        "playlist_id",
        playlists.map((p) => p.id),
      )
      .order("position", { ascending: true });
    const items = (itemData ?? []) as Array<{
      id: string;
      playlist_id: string;
      piece_id: string;
      position: number;
    }>;

    const pieceIds = [...new Set(items.map((i) => i.piece_id))];
    const pieces = new Map<
      string,
      {
        id: string;
        title: string;
        kind: string;
        seconds: number;
        bpm: number | null;
        energy: number | null;
        url: string | null;
      }
    >();
    if (pieceIds.length) {
      const { data: pieceData } = await context.supabase
        .from("sound_pieces")
        .select("id, title, kind, seconds, bpm, energy, storage_path, storage_bucket")
        .in("id", pieceIds)
        .is("removed_at", null);
      for (const r of (pieceData ?? []) as Array<{
        id: string;
        title: string;
        kind: string;
        seconds: number;
        bpm: number | null;
        energy: number | null;
        storage_path: string;
        storage_bucket: string | null;
      }>) {
        pieces.set(r.id, {
          id: r.id,
          title: r.title,
          kind: r.kind,
          seconds: r.seconds,
          bpm: r.bpm,
          energy: r.energy,
          url: await audioUrl(r.storage_path, r.storage_bucket),
        });
      }
    }

    return {
      playlists: playlists.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        eventId: p.event_id,
        shareToken: p.share_token,
        shareSlug: p.share_slug,
        /** The readable link, slug when there is one, token for old rows. */
        shareKey: p.share_slug || p.share_token,
        createdAt: p.created_at,
        items: items
          .filter((i) => i.playlist_id === p.id)
          .map((i) => ({ itemId: i.id, position: i.position, piece: pieces.get(i.piece_id) ?? null }))
          .filter((i) => i.piece !== null)
          .map((i) => ({ itemId: i.itemId, position: i.position, ...i.piece! })),
      })),
    };
  });

/** Make a new folder. */
export const createPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z
      .object({
        name: nameField,
        description: z.string().trim().max(300).optional(),
        eventId: z.string().trim().max(64).optional(),
      })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("sound_playlists")
      .insert({
        user_id: context.userId,
        name: data.name,
        description: data.description || null,
        event_id: data.eventId || null,
      })
      .select("id, share_token, share_slug")
      .single();
    if (error || !row) throw new Error("Couldn't create that folder. Please try again.");
    const r = row as { id: string; share_token: string; share_slug: string | null };
    return { id: r.id, shareKey: r.share_slug || r.share_token };
  });

/** Rename a folder, change its note, or link / unlink an event. */
export const updatePlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z
      .object({
        id: z.string().uuid(),
        name: nameField.optional(),
        description: z.string().trim().max(300).nullable().optional(),
        eventId: z.string().trim().max(64).nullable().optional(),
      })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      name?: string;
      description?: string | null;
      event_id?: string | null;
    } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.eventId !== undefined) patch.event_id = data.eventId;
    if (!Object.keys(patch).length) return { ok: true as const };
    const { error } = await context.supabase
      .from("sound_playlists")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Couldn't save that change.");
    return { ok: true as const };
  });

/** Delete the folder. The pieces inside it are untouched. */
export const deletePlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ id: z.string().uuid() })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sound_playlists")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Couldn't delete that folder.");
    return { ok: true as const };
  });

/** Ownership check that also refuses a piece that has been taken down. */
async function assertOwnedPlaylist(
  supabase: { from: (t: string) => any },
  userId: string,
  playlistId: string,
) {
  const { data } = await supabase
    .from("sound_playlists")
    .select("id")
    .eq("id", playlistId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("That folder isn't yours.");
}

/** Put pieces in a folder, at the end of the order. */
export const addPiecesToPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z
      .object({
        playlistId: z.string().uuid(),
        pieceIds: z.array(z.string().uuid()).min(1).max(50),
      })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertOwnedPlaylist(context.supabase as never, context.userId, data.playlistId);
    // Every piece must be mine and still live. RLS enforces this too; checking
    // here turns a silent no-op into a clear message.
    const { data: mine } = await context.supabase
      .from("sound_pieces")
      .select("id")
      .in("id", data.pieceIds)
      .eq("user_id", context.userId)
      .is("removed_at", null);
    const allowed = ((mine ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (!allowed.length) throw new Error("Those pieces aren't available to add.");

    const { data: existing } = await context.supabase
      .from("sound_playlist_items")
      .select("piece_id, position")
      .eq("playlist_id", data.playlistId)
      .order("position", { ascending: false });
    const rows = (existing ?? []) as Array<{ piece_id: string; position: number }>;
    const already = new Set(rows.map((r) => r.piece_id));
    let next = rows.length ? rows[0].position + 1 : 0;
    const toAdd = allowed.filter((id) => !already.has(id));
    if (!toAdd.length) return { added: 0 };

    const { error } = await context.supabase.from("sound_playlist_items").insert(
      toAdd.map((pieceId) => ({
        playlist_id: data.playlistId,
        piece_id: pieceId,
        position: next++,
      })),
    );
    if (error) throw new Error("Couldn't add to that folder.");
    return { added: toAdd.length };
  });

/** Take a piece out of a folder. The piece itself stays in the library. */
export const removePieceFromPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ playlistId: z.string().uuid(), pieceId: z.string().uuid() })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertOwnedPlaylist(context.supabase as never, context.userId, data.playlistId);
    const { error } = await context.supabase
      .from("sound_playlist_items")
      .delete()
      .eq("playlist_id", data.playlistId)
      .eq("piece_id", data.pieceId);
    if (error) throw new Error("Couldn't take that out of the folder.");
    return { ok: true as const };
  });

/**
 * Move one piece one place up or down. This is the plain, keyboard and
 * screen-reader friendly path; drag and drop calls setPlaylistOrder instead
 * and both end up writing the same positions.
 */
export const movePieceInPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z
      .object({
        playlistId: z.string().uuid(),
        pieceId: z.string().uuid(),
        direction: z.enum(["up", "down"]),
      })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertOwnedPlaylist(context.supabase as never, context.userId, data.playlistId);
    const { data: rows } = await context.supabase
      .from("sound_playlist_items")
      .select("id, piece_id, position")
      .eq("playlist_id", data.playlistId)
      .order("position", { ascending: true });
    const items = (rows ?? []) as Array<{ id: string; piece_id: string; position: number }>;
    const at = items.findIndex((r) => r.piece_id === data.pieceId);
    if (at < 0) throw new Error("That piece isn't in this folder.");
    const to = data.direction === "up" ? at - 1 : at + 1;
    if (to < 0 || to >= items.length) return { ok: true as const, moved: false };
    const reordered = [...items];
    const [moved] = reordered.splice(at, 1);
    reordered.splice(to, 0, moved);
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].position === i) continue;
      await context.supabase
        .from("sound_playlist_items")
        .update({ position: i })
        .eq("id", reordered[i].id);
    }
    return { ok: true as const, moved: true };
  });

/** The whole order at once, used by drag and drop. */
export const setPlaylistOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z
      .object({
        playlistId: z.string().uuid(),
        pieceIds: z.array(z.string().uuid()).min(1).max(200),
      })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    await assertOwnedPlaylist(context.supabase as never, context.userId, data.playlistId);
    const { data: rows } = await context.supabase
      .from("sound_playlist_items")
      .select("id, piece_id")
      .eq("playlist_id", data.playlistId);
    const byPiece = new Map(
      ((rows ?? []) as Array<{ id: string; piece_id: string }>).map((r) => [r.piece_id, r.id]),
    );
    let i = 0;
    for (const pieceId of data.pieceIds) {
      const id = byPiece.get(pieceId);
      if (!id) continue;
      await context.supabase.from("sound_playlist_items").update({ position: i++ }).eq("id", id);
    }
    return { ok: true as const };
  });

/** A download link for one of my pieces, named from its title. */
export const getPieceDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ id: z.string().uuid() })), i, "input"),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("sound_pieces")
      .select("title, storage_path, storage_bucket")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("removed_at", null)
      .maybeSingle();
    if (!row) return { url: null, fileName: null };
    const piece = row as { title: string; storage_path: string; storage_bucket: string | null };
    const fileName = downloadFileName(piece.title);
    return {
      url: await audioUrl(piece.storage_path, piece.storage_bucket, fileName),
      fileName,
    };
  });

type SharedRow = {
  playlist_id: string;
  playlist_name: string;
  description: string | null;
  host_name: string | null;
  piece_id: string | null;
  title: string | null;
  kind: string | null;
  seconds: number | null;
  storage_path: string | null;
  storage_bucket: string | null;
  bpm: number | null;
  energy: number | null;
  item_position: number | null;
};

/** Rows for a shared playlist, by its readable key or its old token. */
export async function readSharedPlaylist(key: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("get_shared_playlist", { _key: key });
  const rows = (Array.isArray(data) ? data : []) as SharedRow[];
  if (!rows.length) return null;
  return {
    name: rows[0].playlist_name,
    description: rows[0].description,
    hostName: rows[0].host_name,
    rows: rows.filter((r) => r.piece_id && r.storage_path),
  };
}

/**
 * The shared playlist reader. Deliberately narrow: title, kind, length, order
 * and a playable link. Nothing about the brief, the words, the settings, the
 * owner or the event travels with it.
 */
export const getSharedPlaylist = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ key: z.string().min(6).max(80) })), i, "input"),
  )
  .handler(async ({ data }) => {
    const found = await readSharedPlaylist(data.key);
    if (!found) return { playlist: null };
    return {
      playlist: {
        name: found.name,
        description: found.description,
        hostName: found.hostName,
        tracks: await Promise.all(
          found.rows.map(async (r, i) => ({
            id: r.piece_id as string,
            title: r.title as string,
            kind: r.kind as string,
            seconds: r.seconds ?? 0,
            bpm: r.bpm,
            energy: r.energy === null ? null : Number(r.energy),
            position: i,
            url: await audioUrl(r.storage_path as string, r.storage_bucket),
          })),
        ),
      },
    };
  });

/** One shared piece, as a download named from its title. */
export const getSharedPieceDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ key: z.string().min(6).max(80) })), i, "input"),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.rpc("get_shared_sound_piece", { _key: data.key });
    const row = (Array.isArray(rows) ? rows[0] : null) as {
      title: string;
      storage_path: string;
      storage_bucket: string | null;
    } | null;
    if (!row) return { url: null, fileName: null };
    const fileName = downloadFileName(row.title);
    return { url: await audioUrl(row.storage_path, row.storage_bucket, fileName), fileName };
  });
