import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AUDIENCES = ["all", "whisper", "host", "atelier"] as const;
const STATUSES = ["draft", "published", "archived"] as const;

const UpsertInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  emoji: z.string().max(8).optional().nullable(),
  body_html: z.string().max(40000).default(""),
  cover_image_url: z.string().url().max(2000).optional().nullable(),
  cta_label: z.string().max(60).optional().nullable(),
  cta_url: z.string().url().max(2000).optional().nullable(),
  audience_tier: z.enum(AUDIENCES).default("all"),
  status: z.enum(STATUSES).default("draft"),
});

async function assertOwner(ctx: { supabase: any; userId: string }) {
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  await assertOwnerAccess(ctx.supabase, ctx.userId);
}

export const listProductUpdatesAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { data, error } = await context.supabase
      .from("product_updates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertProductUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(UpsertInput, i, "product-updates.functions.ts:40"))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const now = new Date().toISOString();
    const row: any = {
      title: data.title,
      emoji: data.emoji || null,
      body_html: data.body_html ?? "",
      cover_image_url: data.cover_image_url || null,
      cta_label: data.cta_label || null,
      cta_url: data.cta_url || null,
      audience_tier: data.audience_tier,
      status: data.status,
      published_at: data.status === "published" ? now : null,
      created_by: context.userId,
    };
    if (data.id) {
      // If transitioning to published and was not before, set published_at; otherwise preserve existing.
      const { data: existing } = await context.supabase
        .from("product_updates")
        .select("published_at,status")
        .eq("id", data.id)
        .maybeSingle();
      if (existing?.status === "published" && data.status === "published") {
        row.published_at = existing.published_at; // keep
      }
      const { error } = await context.supabase
        .from("product_updates")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("product_updates")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deleteProductUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ id: z.string().uuid() }), i, "product-updates.functions.ts:84"))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { error } = await context.supabase
      .from("product_updates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Customer-facing ---

export const listMyProductUpdates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Pull published updates targeted at the user's tier (or "all"),
    // along with their dismissals.
    const [{ data: profile }, { data: updates }, { data: dismissals }] = await Promise.all([
      context.supabase
        .from("profiles")
        .select("tier")
        .eq("id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("product_updates")
        .select(
          "id,title,emoji,body_html,cover_image_url,cta_label,cta_url,audience_tier,published_at",
        )
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("product_update_dismissals")
        .select("update_id")
        .eq("user_id", context.userId),
    ]);
    const tier = (profile as any)?.tier ?? "free";
    const dismissed = new Set(
      (dismissals ?? []).map((d: any) => d.update_id as string),
    );
    const visible = (updates ?? []).filter(
      (u: any) => u.audience_tier === "all" || u.audience_tier === tier,
    );
    return visible.map((u: any) => ({
      ...u,
      dismissed: dismissed.has(u.id),
    }));
  });

// --- Public changelog page (no auth — RLS already allows anon read of
// published rows via "Anyone can read published updates") ---
export const listPublicProductUpdates = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb
    .from("product_updates")
    .select("id,title,emoji,body_html,cover_image_url,cta_label,cta_url,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(100);
  if (error) return [];
  return data ?? [];
});

export const dismissProductUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ id: z.string().uuid() }), i, "product-updates.functions.ts:153"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("product_update_dismissals")
      .insert({ update_id: data.id, user_id: context.userId });
    if (error && !error.message.toLowerCase().includes("duplicate")) {
      throw new Error(error.message);
    }
    return { ok: true };
  });
