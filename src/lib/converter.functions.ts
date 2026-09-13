import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "atelier-shared";

async function assertConverterAccess(ctx: { supabase: any; userId: string }) {
  const { data: isOwner } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "owner",
  });
  if (isOwner) return;
  // One-time account unlock flips this flag (set by the payments webhook).
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("converter_enabled")
    .eq("id", ctx.userId)
    .maybeSingle();
  if ((profile as { converter_enabled?: boolean } | null)?.converter_enabled) return;
  const { data: sub } = await ctx.supabase
    .from("subscriptions")
    .select("price_id,status,current_period_end")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const active =
    !!sub &&
    ["active", "trialing", "past_due"].includes(String((sub as any).status)) &&
    (!sub.current_period_end || new Date((sub as any).current_period_end) > new Date());
  const pid = String((sub as any)?.price_id ?? "");
  const isAtelier = active && (pid.includes("atelier") || pid.startsWith("atelier_studio"));
  if (!isAtelier) {
    throw new Error("Unlock the Media Converter from Pricing or upgrade to Atelier.");
  }
}

/**
 * Uploads a converted media file to the public atelier-shared bucket
 * under the user's folder, returning a stable public CDN URL.
 */
export const uploadConvertedMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z
      .object({
        filename: z.string().min(1).max(160),
        contentType: z.string().min(1).max(80),
        // base64 (no data: prefix). 28M chars ≈ 20MB binary — matches the client cap.
        base64: z.string().min(8).max(28_000_000),
      }), input, "converter.functions.ts:52"),
  )
  .handler(async ({ data, context }) => {
    await assertConverterAccess(context);
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const path = `${context.userId}/${Date.now()}-${safeName}`;
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const { error } = await context.supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);
    const { data: pub } = context.supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, path };
  });
