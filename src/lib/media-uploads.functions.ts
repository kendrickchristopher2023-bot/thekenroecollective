import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountAddonAccess } from "@/lib/addon-access.server";

// Guest-facing shared assets only (invitation art, announcements, photo walls).
// Everything else lives in the private bucket and is served via signed URLs.
const PUBLIC_BUCKET = "atelier-shared";
const PRIVATE_BUCKET = "atelier-media-private";

// Tiered soft storage caps (bytes). Owner = unlimited.
const STORAGE_CAPS = {
  postcard: 200 * 1024 * 1024,
  trial: 200 * 1024 * 1024,
  whisper: 1024 * 1024 * 1024,
  host: 5 * 1024 * 1024 * 1024,
  atelier: 25 * 1024 * 1024 * 1024,
} as const;

async function isOwner(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "owner" });
  return !!data;
}

async function hasAtelierAccess(ctx: { supabase: any; userId: string }) {
  if (await isOwner(ctx)) return true;
  const { data: sub } = await ctx.supabase
    .from("subscriptions")
    .select("price_id,status,current_period_end")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub) return false;
  const active =
    ["active", "trialing", "past_due"].includes(String((sub as any).status)) &&
    (!sub.current_period_end || new Date((sub as any).current_period_end) > new Date());
  if (!active) return false;
  const pid = String((sub as any).price_id ?? "");
  return pid.includes("atelier") || pid.startsWith("studio_collective");
}

async function computeTierCap(ctx: { supabase: any; userId: string }): Promise<number | null> {
  if (await isOwner(ctx)) return null;
  const { data: sub } = await ctx.supabase
    .from("subscriptions")
    .select("price_id,status,current_period_end")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pid = String((sub as any)?.price_id ?? "");
  const active =
    !!sub &&
    ["active", "trialing", "past_due"].includes(String((sub as any).status)) &&
    (!sub.current_period_end || new Date((sub as any).current_period_end) > new Date());
  if (!active) return STORAGE_CAPS.postcard;
  if (pid.includes("atelier") || pid.startsWith("studio_collective")) return STORAGE_CAPS.atelier;
  if (pid.includes("host")) return STORAGE_CAPS.host;
  if (pid.includes("whisper")) return STORAGE_CAPS.whisper;
  if (pid.includes("trial")) return STORAGE_CAPS.trial;
  return STORAGE_CAPS.postcard;
}

async function sumLiveBytes(ctx: { supabase: any; userId: string }): Promise<number> {
  const { data } = await ctx.supabase
    .from("media_uploads")
    .select("size_bytes")
    .eq("user_id", ctx.userId)
    .is("deleted_at", null);
  return (data ?? []).reduce((a: number, r: any) => a + (r.size_bytes ?? 0), 0);
}

/**
 * Upload a file (base64) AND record it in the user's media library.
 */
export const uploadAndRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z
      .object({
        filename: z.string().min(1).max(160),
        contentType: z.string().min(1).max(80),
        base64: z.string().min(8).max(28_000_000),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        source: z
          .enum(["converter", "invite", "announcement", "wall", "design", "rfq", "other"])
          .default("converter"),
        originalFilename: z.string().max(200).optional(),
        folder: z.string().max(64).optional(),
        tags: z.array(z.string().max(32)).max(20).optional(),
        altText: z.string().max(280).optional(),
        // Default visibility left blank so the server can route private-by-default
        // for sensitive sources (converter/design/rfq) while keeping shared assets public.
        visibility: z.enum(["public", "private"]).optional(),
        responsiveGroupId: z.string().uuid().optional(),
        replaceObjectPath: z.string().max(400).optional(),
        replaceId: z.string().uuid().optional(),
      }), input, "media-uploads.functions.ts:100"),
  )
  .handler(async ({ data, context }) => {
    const { assertNotDemoCaller } = await import("@/lib/demo-mode.server");
    await assertNotDemoCaller("generate", context, { action: "media_upload", source: data.source });
    if (data.source === "converter" && !(await accountAddonAccess(context.supabase, context.userId, "converter"))) {
      throw new Error("Unlock the Media Converter from Pricing or upgrade to Atelier.");
    }

    // Cap enforcement (owners exempt; private bucket counts the same)
    const cap = await computeTierCap(context);
    if (cap !== null) {
      const used = await sumLiveBytes(context);
      const sizeApprox = Math.floor((data.base64.length * 3) / 4);
      if (used + sizeApprox > cap) {
        throw new Error("Storage cap reached for your plan. Delete some files or upgrade for more storage.");
      }
    }

    // Route sensitive-by-default sources to the private bucket when the user has access.
    // Guest-facing sources (invite/announcement/wall) stay public so their stored URLs keep working.
    const sensitiveSources = new Set(["converter", "design", "rfq"]);
    let effectiveVisibility: "public" | "private" =
      data.visibility ?? (sensitiveSources.has(data.source) && (await hasAtelierAccess(context)) ? "private" : "public");
    if (effectiveVisibility === "private" && !(await hasAtelierAccess(context))) {
      // Non-Atelier users fall back to public rather than erroring on an implicit route.
      effectiveVisibility = data.visibility === "private" ? "private" : "public";
      if (data.visibility === "private") {
        throw new Error("Private uploads are available on Atelier or Studio Collective.");
      }
    }

    const bucket = effectiveVisibility === "private" ? PRIVATE_BUCKET : PUBLIC_BUCKET;
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));

    let path: string;
    let upsert = false;
    if (data.replaceObjectPath && data.replaceObjectPath.startsWith(`${context.userId}/`)) {
      path = data.replaceObjectPath;
      upsert = true;
    } else {
      path = `${context.userId}/${Date.now()}-${safeName}`;
    }

    const { error } = await context.supabase.storage
      .from(bucket)
      .upload(path, bytes, { contentType: data.contentType, upsert });
    if (error) throw new Error(error.message);

    let url: string;
    if (bucket === PUBLIC_BUCKET) {
      const { data: pub } = context.supabase.storage.from(bucket).getPublicUrl(path);
      url = upsert ? `${pub.publicUrl}?v=${Date.now()}` : pub.publicUrl;
    } else {
      // Private uploads: return an immediate signed URL so callers can display/download
      // the just-uploaded file. Long-term consumers should call getSignedMediaUrl to refresh.
      const { data: signed } = await context.supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60);
      url = (signed as any)?.signedUrl ?? `private://${bucket}/${path}`;
    }

    if (data.replaceId) {
      await context.supabase
        .from("media_uploads")
        .update({
          public_url: url,
          content_type: data.contentType,
          size_bytes: bytes.byteLength,
          width: data.width ?? null,
          height: data.height ?? null,
          original_filename: data.originalFilename ?? data.filename,
        })
        .eq("id", data.replaceId)
        .eq("user_id", context.userId);
      return { url, path, id: data.replaceId, bucket, visibility: effectiveVisibility };
    }

    const { data: inserted, error: ierr } = await context.supabase
      .from("media_uploads")
      .insert({
        user_id: context.userId,
        bucket,
        object_path: path,
        public_url: url,
        original_filename: data.originalFilename ?? data.filename,
        content_type: data.contentType,
        size_bytes: bytes.byteLength,
        width: data.width ?? null,
        height: data.height ?? null,
        source: data.source,
        folder: data.folder ?? "Uncluttered",
        tags: data.tags ?? [],
        alt_text: data.altText ?? null,
        visibility: effectiveVisibility,
        responsive_group_id: data.responsiveGroupId ?? null,
      })
      .select("id")
      .single();
    if (ierr) throw new Error(ierr.message);
    return { url, path, id: (inserted as any).id, bucket, visibility: effectiveVisibility };
  });

export const listMyUploads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z
      .object({
        limit: z.number().int().min(1).max(500).default(120),
        source: z.string().optional(),
        folder: z.string().optional(),
        tag: z.string().optional(),
        includeTrash: z.boolean().default(false),
        trashOnly: z.boolean().default(false),
      }), input ?? {}, "media-uploads.functions.ts:210"),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("media_uploads")
      .select(
        "id, public_url, object_path, bucket, original_filename, content_type, size_bytes, width, height, source, created_at, folder, tags, alt_text, visibility, responsive_group_id, deleted_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.trashOnly) q = q.not("deleted_at", "is", null);
    else if (!data.includeTrash) q = q.is("deleted_at", null);
    if (data.source) q = q.eq("source", data.source);
    if (data.folder) q = q.eq("folder", data.folder);
    if (data.tag) q = q.contains("tags", [data.tag]);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

/** Soft-delete (move to trash). Permanent purge runs from a separate fn. */
export const deleteMyUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z.object({ id: z.string().uuid(), permanent: z.boolean().default(false) }), input, "media-uploads.functions.ts:235"),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("media_uploads")
      .select("id, bucket, object_path, user_id, responsive_group_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: true };
    if ((row as any).user_id !== context.userId && !(await isOwner(context))) {
      throw new Error("Not allowed");
    }

    if (data.permanent) {
      // Remove storage object (best effort) and any siblings in the responsive group
      const group = (row as any).responsive_group_id as string | null;
      let paths = [(row as any).object_path as string];
      let ids = [data.id];
      if (group) {
        const { data: sibs } = await context.supabase
          .from("media_uploads")
          .select("id, object_path")
          .eq("responsive_group_id", group)
          .eq("user_id", (row as any).user_id);
        paths = (sibs ?? []).map((s: any) => s.object_path);
        ids = (sibs ?? []).map((s: any) => s.id);
      }
      await context.supabase.storage.from((row as any).bucket).remove(paths);
      const { error: derr } = await context.supabase.from("media_uploads").delete().in("id", ids);
      if (derr) throw new Error(derr.message);
      return { ok: true, permanent: true };
    }

    const { error } = await context.supabase
      .from("media_uploads")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreMyUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(z.object({ id: z.string().uuid() }), input, "media-uploads.functions.ts:278"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("media_uploads")
      .update({ deleted_at: null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMyUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z
      .object({
        id: z.string().uuid(),
        folder: z.string().max(64).optional(),
        tags: z.array(z.string().max(32)).max(20).optional(),
        altText: z.string().max(280).nullable().optional(),
      }), input, "media-uploads.functions.ts:299"),
  )
  .handler(async ({ data, context }) => {
    const patch: any = {};
    if (data.folder !== undefined) patch.folder = data.folder;
    if (data.tags !== undefined) patch.tags = data.tags;
    if (data.altText !== undefined) patch.alt_text = data.altText;
    const { error } = await context.supabase
      .from("media_uploads")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkUpdateUploads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(200),
        folder: z.string().max(64).optional(),
        addTags: z.array(z.string().max(32)).max(20).optional(),
      }), input, "media-uploads.functions.ts:324"),
  )
  .handler(async ({ data, context }) => {
    if (data.folder !== undefined) {
      await context.supabase
        .from("media_uploads")
        .update({ folder: data.folder })
        .in("id", data.ids)
        .eq("user_id", context.userId);
    }
    if (data.addTags && data.addTags.length) {
      // Read-merge-write (small batch, safe)
      const { data: rows } = await context.supabase
        .from("media_uploads")
        .select("id, tags")
        .in("id", data.ids)
        .eq("user_id", context.userId);
      for (const r of rows ?? []) {
        const next = Array.from(new Set([...(r as any).tags ?? [], ...data.addTags]));
        await context.supabase.from("media_uploads").update({ tags: next }).eq("id", (r as any).id);
      }
    }
    return { ok: true };
  });

export const listMyFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("media_uploads")
      .select("folder")
      .eq("user_id", context.userId)
      .is("deleted_at", null);
    const counts = new Map<string, number>();
    for (const r of data ?? []) {
      const f = ((r as any).folder ?? "Uncluttered") as string;
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    return { folders: Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)) };
  });

export const getStorageUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const used = await sumLiveBytes(context);
    const cap = await computeTierCap(context);
    return { used, cap, owner: await isOwner(context) };
  });

export const getSignedMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(z.object({ id: z.string().uuid() }), input, "media-uploads.functions.ts:375"))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("media_uploads")
      .select("user_id, bucket, object_path, visibility")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    if ((row as any).user_id !== context.userId && !(await isOwner(context))) throw new Error("Not allowed");
    if ((row as any).visibility !== "private") {
      const { data: pub } = context.supabase.storage.from((row as any).bucket).getPublicUrl((row as any).object_path);
      return { url: pub.publicUrl };
    }
    const { data: signed, error } = await context.supabase.storage
      .from((row as any).bucket)
      .createSignedUrl((row as any).object_path, 60 * 60);
    if (error) throw new Error(error.message);
    return { url: (signed as any).signedUrl };
  });
