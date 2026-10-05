// Group eCards — server functions for putting several Sound Studio pieces
// (songs, poems, letters) on one card.
//
// The paid-first rule is enforced here, never in the browser: a non-owner can
// only add a piece that has a paid, unrefunded purchase. ecard_pieces has no
// INSERT policy, so the admin client below is the only way a row gets written.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseInput } from "@/lib/user-error";
import { nullSafe } from "@/lib/zod-nullsafe";
import {
  ECARD_MAX_PIECES,
  PIECE_INELIGIBLE_MESSAGE,
  pieceEligibility,
  type PieceEligibility,
} from "@/lib/ecard-pieces";

const BUCKET = "sound-pieces";
const SIGNED_URL_SECONDS = 60 * 60 * 6;

type RoleClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
};

/** Owners are Chris and Adrian: the `owner` role only. */
async function isOwner(supabase: RoleClient, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
  return !!data;
}

async function pieceUrl(path: string, bucket: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (bucket !== BUCKET) {
    return supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl ?? null;
  }
  const { data } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  return data?.signedUrl ?? null;
}

type PieceRow = {
  id: string;
  kind: string;
  title: string;
  seconds: number;
  storage_path: string;
  storage_bucket: string;
  is_demo: boolean;
  removed_at: string | null;
};

async function assertOrganizer(
  supabase: SupabaseClient<Database>,
  ecardId: string,
  userId: string,
): Promise<void> {
  const { data } = await supabase
    .from("ecards")
    .select("id")
    .eq("id", ecardId)
    .eq("organizer_user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Card not found.");
}

/** Which of these pieces have a paid, unrefunded purchase by this person. */
async function paidPieceIds(userId: string, pieceIds: string[]): Promise<Set<string>> {
  if (!pieceIds.length) return new Set();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("sound_piece_purchases")
    .select("piece_id")
    .eq("user_id", userId)
    .eq("status", "paid")
    .is("refunded_at", null)
    .in("piece_id", pieceIds);
  return new Set(
    ((data ?? []) as Array<{ piece_id: string | null }>)
      .map((r) => r.piece_id)
      .filter((id): id is string => Boolean(id)),
  );
}

/**
 * Keep the old single-piece column pointing at the first piece, for the
 * checkout and anything else that still reads it.
 */
async function syncLegacyColumn(ecardId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("ecard_pieces" as never)
    .select("piece_id")
    .eq("ecard_id", ecardId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const first = (data as { piece_id?: string } | null)?.piece_id ?? null;
  await supabaseAdmin.from("ecards").update({ music_piece_id: first }).eq("id", ecardId);
}

export type EcardPieceView = {
  id: string;
  kind: string;
  title: string;
  seconds: number;
  url: string | null;
  heardAt: string | null;
};

export type LibraryPieceView = {
  id: string;
  kind: string;
  title: string;
  seconds: number;
  onCard: boolean;
  eligibility: PieceEligibility;
};

/** The organizer panel: what is on the card, and what from the library can be added. */
export const getEcardPiecesPanel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ ecardId: z.string().uuid() })), i, "input"),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      owner: boolean;
      max: number;
      attached: EcardPieceView[];
      library: LibraryPieceView[];
    }> => {
      await assertOrganizer(context.supabase, data.ecardId, context.userId);
      const owner = await isOwner(context.supabase as never, context.userId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: links } = await supabaseAdmin
        .from("ecard_pieces" as never)
        .select("piece_id, position, heard_at, created_at")
        .eq("ecard_id", data.ecardId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      const linkRows = (links ?? []) as Array<{ piece_id: string; heard_at: string | null }>;

      const { data: lib } = await context.supabase
        .from("sound_pieces")
        .select("id, kind, title, seconds, storage_path, storage_bucket, is_demo, removed_at")
        .eq("user_id", context.userId)
        .is("removed_at", null)
        .order("created_at", { ascending: false })
        .limit(60);
      const library = (lib ?? []) as PieceRow[];

      // Attached pieces are read with the admin client so a piece stays visible
      // on the card even if it drops out of the 60 most recent.
      const attachedIds = linkRows.map((l) => l.piece_id);
      const { data: attachedData } = attachedIds.length
        ? await supabaseAdmin
            .from("sound_pieces")
            .select("id, kind, title, seconds, storage_path, storage_bucket, is_demo, removed_at")
            .in("id", attachedIds)
        : { data: [] };
      const byId = new Map(((attachedData ?? []) as PieceRow[]).map((p) => [p.id, p]));

      const attached: EcardPieceView[] = [];
      for (const l of linkRows) {
        const p = byId.get(l.piece_id);
        if (!p || p.removed_at) continue;
        attached.push({
          id: p.id,
          kind: p.kind,
          title: p.title,
          seconds: p.seconds,
          url: await pieceUrl(p.storage_path, p.storage_bucket),
          heardAt: l.heard_at,
        });
      }

      const paid = owner
        ? new Set<string>()
        : await paidPieceIds(
            context.userId,
            library.map((p) => p.id),
          );
      const onCard = new Set(attachedIds);
      return {
        owner,
        max: ECARD_MAX_PIECES,
        attached,
        library: library.map((p) => ({
          id: p.id,
          kind: p.kind,
          title: p.title,
          seconds: p.seconds,
          onCard: onCard.has(p.id),
          eligibility: pieceEligibility({
            owner,
            paid: paid.has(p.id),
            isDemo: p.is_demo,
            removed: Boolean(p.removed_at),
          }),
        })),
      };
    },
  );

/** Add one piece to the end of the card. Paid first, unless an owner. */
export const addPieceToEcard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(
      nullSafe(z.object({ ecardId: z.string().uuid(), pieceId: z.string().uuid() })),
      i,
      "input",
    ),
  )
  .handler(async ({ data, context }) => {
    await assertOrganizer(context.supabase, data.ecardId, context.userId);
    const { data: pieceData } = await context.supabase
      .from("sound_pieces")
      .select("id, is_demo, removed_at")
      .eq("id", data.pieceId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const piece = pieceData as { id: string; is_demo: boolean; removed_at: string | null } | null;
    if (!piece) throw new Error("That piece can't be found.");

    const owner = await isOwner(context.supabase as never, context.userId);
    const paid = owner ? false : (await paidPieceIds(context.userId, [piece.id])).has(piece.id);
    const verdict = pieceEligibility({
      owner,
      paid,
      isDemo: piece.is_demo,
      removed: Boolean(piece.removed_at),
    });
    if (!verdict.ok) throw new Error(PIECE_INELIGIBLE_MESSAGE[verdict.reason]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("ecard_pieces" as never)
      .select("piece_id, position")
      .eq("ecard_id", data.ecardId);
    const rows = (existing ?? []) as Array<{ piece_id: string; position: number }>;
    if (rows.some((r) => r.piece_id === piece.id)) return { ok: true as const };
    if (rows.length >= ECARD_MAX_PIECES) {
      throw new Error(
        `A card can hold up to ${ECARD_MAX_PIECES} pieces. Remove one to add another.`,
      );
    }
    const position = rows.reduce((m, r) => Math.max(m, r.position), -1) + 1;
    const { error } = await supabaseAdmin
      .from("ecard_pieces" as never)
      .insert({ ecard_id: data.ecardId, piece_id: piece.id, position } as never);
    if (error) throw new Error("Couldn't add that piece to the card.");
    await syncLegacyColumn(data.ecardId);
    return { ok: true as const };
  });

/** Take one piece off the card. The piece itself stays in the library. */
export const removePieceFromEcard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(
      nullSafe(z.object({ ecardId: z.string().uuid(), pieceId: z.string().uuid() })),
      i,
      "input",
    ),
  )
  .handler(async ({ data, context }) => {
    await assertOrganizer(context.supabase, data.ecardId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("ecard_pieces" as never)
      .delete()
      .eq("ecard_id", data.ecardId)
      .eq("piece_id", data.pieceId);
    if (error) throw new Error("Couldn't remove that piece.");
    await syncLegacyColumn(data.ecardId);
    return { ok: true as const };
  });

/** Move a piece one place earlier or later in the play order. */
export const moveEcardPiece = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(
      nullSafe(
        z.object({
          ecardId: z.string().uuid(),
          pieceId: z.string().uuid(),
          direction: z.enum(["up", "down"]),
        }),
      ),
      i,
      "input",
    ),
  )
  .handler(async ({ data, context }) => {
    await assertOrganizer(context.supabase, data.ecardId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("ecard_pieces" as never)
      .select("id, piece_id")
      .eq("ecard_id", data.ecardId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    const rows = (existing ?? []) as Array<{ id: string; piece_id: string }>;
    const at = rows.findIndex((r) => r.piece_id === data.pieceId);
    const to = data.direction === "up" ? at - 1 : at + 1;
    if (at === -1 || to < 0 || to >= rows.length) return { ok: true as const };
    [rows[at], rows[to]] = [rows[to]!, rows[at]!];
    // Rewrite every position so the order is always a clean 0..n-1.
    for (const [i, r] of rows.entries()) {
      await supabaseAdmin
        .from("ecard_pieces" as never)
        .update({ position: i } as never)
        .eq("id", r.id);
    }
    await syncLegacyColumn(data.ecardId);
    return { ok: true as const };
  });

/** Every piece on a revealed card, in order, for the recipient. */
export const getEcardPieces = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    parseInput(nullSafe(z.object({ slug: z.string().min(4).max(64) })), i, "input"),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.rpc(
      "get_ecard_pieces" as never,
      {
        _slug: data.slug,
      } as never,
    );
    const list = (Array.isArray(rows) ? rows : []) as Array<{
      id: string;
      kind: string;
      title: string;
      seconds: number;
      storage_path: string;
      words: string | null;
    }>;
    if (!list.length) return { pieces: [] };
    const { data: buckets } = await supabaseAdmin
      .from("sound_pieces")
      .select("id, storage_bucket")
      .in(
        "id",
        list.map((r) => r.id),
      );
    const bucketOf = new Map(
      ((buckets ?? []) as Array<{ id: string; storage_bucket: string }>).map((b) => [
        b.id,
        b.storage_bucket,
      ]),
    );
    return {
      pieces: await Promise.all(
        list.map(async (r) => ({
          id: r.id,
          kind: r.kind,
          title: r.title,
          seconds: r.seconds,
          words: r.words ?? null,
          url: await pieceUrl(r.storage_path, bucketOf.get(r.id) ?? BUCKET),
        })),
      ),
    };
  });

/** Stamped the first time the recipient plays each piece. */
export const markEcardPieceHeard = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    parseInput(
      nullSafe(z.object({ slug: z.string().min(4).max(64), pieceId: z.string().uuid() })),
      i,
      "input",
    ),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc(
      "mark_ecard_piece_heard" as never,
      {
        _slug: data.slug,
        _piece_id: data.pieceId,
      } as never,
    );
    return { ok: true };
  });
