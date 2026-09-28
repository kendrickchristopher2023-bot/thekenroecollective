import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
  resolveOrCreateCustomer,
} from "@/lib/stripe.server";

export const AD_TIERS = {
  featured: {
    id: "featured",
    name: "Featured Listing",
    priceId: "ad_featured_monthly",
    priceLabel: "$5 / month",
    blurb: "Priority position in category search results.",
  },
  spotlight: {
    id: "spotlight",
    name: "Spotlight Ad",
    priceId: "ad_spotlight_monthly",
    priceLabel: "$10 / month",
    blurb: "Homepage carousel placement plus top-of-category position.",
  },
} as const;
export type AdTier = keyof typeof AD_TIERS;

const AdInput = z.object({
  tier: z.enum(["featured", "spotlight"]),
  headline: z.string().min(2).max(120),
  blurb: z.string().max(400).optional().nullable(),
  cta_url: z.string().url().max(500).optional().nullable().or(z.literal("")),
  hero_image: z.string().url().max(500).optional().nullable().or(z.literal("")),
  region: z.string().max(80).optional().nullable(),
});

export const createAdCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(AdInput.extend({
      returnUrl: z.string().url(),
      environment: z.enum(["sandbox", "live"]),
    }), d, "ads.functions.ts:69"),
  )
  .handler(async ({ data, context }): Promise<{ clientSecret: string } | { error: string }> => {
    const { supabase, userId, claims } = context;

    // Vendor must exist AND be verified by an owner/admin before paying.
    // public.vendors is PRIVACY LOCKED, so this read uses the service role and
    // is scoped to the authenticated caller's own vendor row.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vendor } = await supabaseAdmin
      .from("vendors")
      .select("id,status")
      .eq("owner_user_id", userId)
      .maybeSingle();
    if (!vendor) {
      return { error: "Create your vendor profile first before purchasing an ad." };
    }
    if (vendor.status !== "verified") {
      const msg =
        vendor.status === "rejected"
          ? "Your vendor application was not approved. Contact support if you believe this is a mistake."
          : vendor.status === "paused"
          ? "Your vendor profile is paused. Contact support to reactivate before purchasing an ad."
          : vendor.status === "reviewing"
          ? "Your vendor application is currently being reviewed. You can purchase an ad as soon as it's approved."
          : "Your vendor application is pending owner review. You can purchase an ad as soon as it's approved.";
      return { error: msg };
    }

    const tierCfg = AD_TIERS[data.tier];

    // Insert pending ad row
    const { data: ad, error: insertError } = await supabase
      .from("ad_placements")
      .insert({
        vendor_id: vendor.id,
        owner_user_id: userId,
        tier: data.tier,
        headline: data.headline,
        blurb: data.blurb || null,
        cta_url: data.cta_url || null,
        hero_image: data.hero_image || null,
        region: data.region || null,
        status: "pending",
      })
      .select("id")
      .single();
    if (insertError || !ad) return { error: insertError?.message ?? "Could not create ad" };

    {
      const { notifyAdminsByEmail } = await import("@/lib/email/notify-admins");
      await notifyAdminsByEmail({
        kind: "ad_submitted",
        title: `New ad submitted: ${data.headline}`,
        body: `Tier: ${tierCfg.name} (${tierCfg.priceLabel})`,
        link: "/admin",
      });
    }

    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const prices = await stripe.prices.list({ lookup_keys: [tierCfg.priceId] });
      if (!prices.data.length) throw new Error("Ad price not configured");
      const stripePrice = prices.data[0];

      const customerId = await resolveOrCreateCustomer(stripe, {
        email: claims?.email,
        userId,
      });

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: "subscription",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        metadata: { userId, adPlacementId: ad.id, kind: "vendor_ad" },
        subscription_data: {
          metadata: { userId, adPlacementId: ad.id, kind: "vendor_ad" },
        },
      });
      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      // Roll back the placeholder row so failed checkouts don't pile up
      await supabase.from("ad_placements").delete().eq("id", ad.id);
      return { error: getStripeErrorMessage(error) };
    }
  });

export const listMyAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // stripe_subscription_id is revoked from anon/authenticated (only the
    // billing-linked owner sees it via this scoped server function).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ad_placements")
      .select("id,tier,headline,blurb,cta_url,hero_image,region,status,stripe_subscription_id,created_at")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: false });
    return { ads: data ?? [] };
  });

export const cancelMyAd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      adId: z.string().uuid(),
      environment: z.enum(["sandbox", "live"]),
    }), d, "ads.functions.ts:178"),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ad } = await supabaseAdmin
      .from("ad_placements")
      .select("id,stripe_subscription_id,owner_user_id")
      .eq("id", data.adId)
      .maybeSingle();
    if (!ad || ad.owner_user_id !== userId) return { error: "Not found" };

    if (ad.stripe_subscription_id) {
      try {
        const stripe = createStripeClient(data.environment as StripeEnv);
        await stripe.subscriptions.update(ad.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
      } catch (error) {
        return { error: getStripeErrorMessage(error) };
      }
    }
    await supabase.from("ad_placements").update({ status: "paused" }).eq("id", ad.id);
    return { ok: true as const };
  });

export const adminSetAdStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      adId: z.string().uuid(),
      status: z.enum(["pending", "reviewing", "active", "paused", "rejected"]),
    }), d, "ads.functions.ts:210"),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isAdmin && !isOwner) return { error: "Forbidden" };
    const { error } = await context.supabase
      .from("ad_placements")
      .update({ status: data.status })
      .eq("id", data.adId);
    if (error) return { error: error.message };
    return { ok: true as const };
  });
