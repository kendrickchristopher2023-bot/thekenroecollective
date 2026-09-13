import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOwnerOrAdmin(context: { supabase: any; userId: string }) {
  // Owner-type accounts must satisfy mandatory MFA (throws when they don't);
  // plain admins keep their existing frictionless access.
  const g = await import("@/lib/owner-guard.server");
  if (await g.hasOwnerRole(context.supabase, context.userId)) {
    await g.assertOwnerMfaSatisfied(context.supabase, context.userId);
    return true;
  }
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  return !!isAdmin;
}

export const listVendorsForReview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await assertOwnerOrAdmin(context))) return { error: "Forbidden" as const, vendors: [], ads: [] };
    // Sensitive columns (review_notes, reviewed_by, stripe_subscription_id) are
    // revoked from anon/authenticated, so this must go through the admin client.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: vendors } = await supabaseAdmin
      .from("vendors")
      .select("id,owner_user_id,name,slug,category,city,region,country,bio,website,email,phone,hero_image,status,review_notes,reviewed_at,verified_at,created_at")
      .order("created_at", { ascending: false });

    const { data: ads } = await supabaseAdmin
      .from("ad_placements")
      .select("id,vendor_id,owner_user_id,tier,headline,blurb,cta_url,hero_image,region,status,review_notes,reviewed_at,stripe_subscription_id,created_at")
      .order("created_at", { ascending: false });

    // Resolve owner emails via auth admin (server-only)
    const userIds = Array.from(new Set([
      ...(vendors ?? []).map((v: any) => v.owner_user_id).filter(Boolean),
      ...(ads ?? []).map((a: any) => a.owner_user_id).filter(Boolean),
    ]));
    const emails: Record<string, string> = {};
    if (userIds.length) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await Promise.all(
          userIds.map(async (uid) => {
            const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
            if (data?.user?.email) emails[uid] = data.user.email;
          }),
        );
      } catch {
        // Non-fatal: continue without emails
      }
    }

    return {
      vendors: (vendors ?? []).map((v: any) => ({ ...v, owner_email: emails[v.owner_user_id] ?? null })),
      ads: (ads ?? []).map((a: any) => ({ ...a, owner_email: emails[a.owner_user_id] ?? null })),
    };
  });

export const setVendorReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      vendorId: z.string().uuid(),
      status: z.enum(["pending", "reviewing", "verified", "rejected", "paused"]),
      notes: z.string().max(2000).optional().nullable(),
    }), d, "vendors-admin.functions.ts:67"),
  )
  .handler(async ({ data, context }) => {
    if (!(await assertOwnerOrAdmin(context))) return { error: "Forbidden" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const patch = {
      status: data.status,
      review_notes: data.notes ?? null,
      reviewed_at: now,
      reviewed_by: context.userId,
      ...(data.status === "verified" ? { verified_at: now } : {}),
    };
    const { error } = await supabaseAdmin.from("vendors").update(patch).eq("id", data.vendorId);
    if (error) return { error: error.message };
    return { ok: true as const };
  });

export const setAdReviewStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      adId: z.string().uuid(),
      status: z.enum(["pending", "reviewing", "approved", "active", "paused", "rejected", "ended"]),
      notes: z.string().max(2000).optional().nullable(),
    }), d, "vendors-admin.functions.ts:92"),
  )
  .handler(async ({ data, context }) => {
    if (!(await assertOwnerOrAdmin(context))) return { error: "Forbidden" as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("ad_placements")
      .update({
        status: data.status,
        review_notes: data.notes ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      })
      .eq("id", data.adId);
    if (error) return { error: error.message };
    return { ok: true as const };
  });

export const deleteVendorAsOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ vendorId: z.string().uuid() }), d, "vendors-admin.functions.ts:116"))
  .handler(async ({ data, context }) => {
    if (!(await assertOwnerOrAdmin(context))) return { error: "Forbidden" as const };
    // public.vendors is PRIVACY LOCKED; role verified immediately above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("vendors").delete().eq("id", data.vendorId);
    if (error) return { error: error.message };
    return { ok: true as const };
  });
