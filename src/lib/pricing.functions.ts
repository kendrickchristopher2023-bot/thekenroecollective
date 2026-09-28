import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const ATELIER_TRIAL_PRICE_ID = "atelier_trial_30d";
const ATELIER_TRIAL_GUEST_LIMIT = 20;

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

// "ecards" is a presentation-only category: Group eCards is priced per card at
// checkout, so it has no rows in pricing_tiers.
export type PricingCategory = "events" | "projects" | "bundles" | "addons" | "ecards";

export type PricingTier = {
  id: string;
  name: string;
  blurb: string;
  price_monthly: number;
  price_yearly: number;
  price_onetime: number;
  features: string[];
  popular: boolean;
  sort_order: number;
  active: boolean;
  category: PricingCategory;
};

export const getPublicTiers = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data, error } = await sb
    .from("pricing_tiers")
    .select("id,name,blurb,price_monthly,price_yearly,price_onetime,features,popular,sort_order,active,category")
    .eq("active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    ...r,
    price_monthly: Number(r.price_monthly),
    price_yearly: Number(r.price_yearly ?? 0),
    price_onetime: Number(r.price_onetime ?? 0),
    features: Array.isArray(r.features) ? (r.features as string[]) : [],
    category: (r.category as PricingCategory) ?? "events",
  })) as PricingTier[];
});

async function assertOwner(ctx: { supabase: any; userId: string }) {
  // Role + mandatory MFA (aal2) for owner/super_admin. See owner-guard.server.
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  await assertOwnerAccess(ctx.supabase, ctx.userId);
}

export const getAllTiersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context);
    const { data, error } = await context.supabase
      .from("pricing_tiers")
      .select("*")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data;
  });

const TierUpsert = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  blurb: z.string().max(300),
  price_monthly: z.number().min(0).max(100000),
  features: z.array(z.string().max(200)).max(30),
  popular: z.boolean(),
  sort_order: z.number().int(),
  active: z.boolean(),
});

export const upsertTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(TierUpsert, input, "pricing.functions.ts:83"))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { error } = await context.supabase
      .from("pricing_tiers")
      .upsert({ ...data, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(z.object({ id: z.string() }), input, "pricing.functions.ts:95"))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { error } = await context.supabase.from("pricing_tiers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Discount code validation (public) — uses SECURITY DEFINER RPC so callers
// cannot list or enumerate codes; only the resolved verdict is returned.
export const validateDiscount = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    parseInput(z.object({
      code: z.string().min(1).max(40),
      tier_id: z.string().min(1),
      user_id: z.string().uuid().optional(),
    }), i, "pricing.functions.ts:107"),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: row, error } = await sb.rpc(
      "validate_discount_code",
      data.user_id
        ? { p_code: data.code.trim(), p_tier_id: data.tier_id, p_user_id: data.user_id }
        : { p_code: data.code.trim(), p_tier_id: data.tier_id },
    );

    if (error) throw new Error(error.message);
    const r = (row ?? {}) as {
      valid?: boolean;
      reason?: string;
      percent_off?: number | null;
      amount_off?: number | string | null;
      kind?: string;
    };
    if (!r.valid) return { valid: false as const, reason: r.reason ?? "Code not found" };
    return {
      valid: true as const,
      percent_off: r.percent_off ?? null,
      amount_off: r.amount_off != null ? Number(r.amount_off) : null,
      kind: r.kind ?? "promo",
    };
  });


// Admin: roles
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("claim_first_admin");
    if (error) throw new Error(error.message);
    return { claimed: data === true };
  });

export const meIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: data === true };
  });

export const meIsOwner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    return { isOwner: data === true };
  });

// Canonical tier values used across the app: "free" | "whisper" | "host" | "atelier".
// Map Stripe price lookup_keys (stable across sandbox/live) to a tier.
const PRICE_TO_TIER: Record<string, "whisper" | "host" | "atelier"> = {
  whisper_onetime: "whisper",
  whisper_monthly: "whisper",
  whisper_yearly: "whisper",
  whisper_monthly_v2: "whisper",
  whisper_yearly_v2: "whisper",
  whisper_onetime_v3: "whisper",
  whisper_monthly_v3: "whisper",
  whisper_yearly_v3: "whisper",
  host_onetime: "host",
  host_monthly: "host",
  host_yearly: "host",
  host_monthly_v3: "host",
  host_yearly_v3: "host",
  atelier_onetime: "atelier",
  atelier_monthly: "atelier",
  atelier_yearly: "atelier",
  atelier_monthly_v3: "atelier",
  atelier_yearly_v3: "atelier",
  atelier_trial_30d: "atelier",
  studio_collective_monthly: "atelier",
  studio_collective_yearly: "atelier",
};

const PM_PRICE_IDS = new Set([
  "pm_addon_monthly",
  "pm_addon_yearly",
  "host_pm_bundle_monthly",
  "host_pm_bundle_yearly",
  "pm_solo_monthly",
  "pm_solo_yearly",
  "atelier_studio_monthly",
  "atelier_studio_yearly",
]);

const TIER_RANK: Record<"postcard" | "whisper" | "host" | "atelier", number> = {
  postcard: 0,
  whisper: 1,
  host: 2,
  atelier: 3,
};

function normalizeTier(raw: string | null | undefined): "postcard" | "whisper" | "host" | "atelier" {
  const t = (raw ?? "").toLowerCase().trim();
  if (!t) return "postcard";
  if (PRICE_TO_TIER[t]) return PRICE_TO_TIER[t];
  if (t.includes("atelier")) return "atelier";
  if (t.includes("host")) return "host";
  if (t.includes("whisper")) return "whisper";
  // Legacy 'free' and any unknown value map to the new free tier: Postcard.
  return "postcard";
}

function subscriptionInForce(sub: { status?: string | null; current_period_end?: string | null } | null | undefined) {
  if (!sub) return false;
  return (
    (["active", "trialing", "past_due"].includes(String(sub.status)) &&
      (!sub.current_period_end || new Date(sub.current_period_end) > new Date())) ||
    (sub.status === "canceled" && !!sub.current_period_end && new Date(sub.current_period_end) > new Date())
  );
}

export const meEntitlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z.object({ environment: z.enum(["sandbox", "live"]).optional() }), input ?? {}, "pricing.functions.ts:236"),
  )
  .handler(async ({ data, context }) => {
    // Comped/manual plans are stamped `live` when an owner grants them, so we
    // can't filter by environment in SQL — a comp would silently vanish (and
    // the host would see upgrade walls) on any non-live environment. Fetch all
    // rows and drop only the real Stripe rows from other environments.
    const subQuery = context.supabase
      .from("subscriptions")
      .select("price_id,status,current_period_end,environment,product_id")
      .eq("user_id", context.userId);

    const [{ data: isOwner }, { data: profile }, { data: subs }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
      context.supabase
        .from("profiles")
        .select("tier,guest_import_enabled,thank_you_cards_enabled,converter_enabled,sms_pack_enabled")
        .eq("id", context.userId)
        .maybeSingle(),
      subQuery.order("created_at", { ascending: false }),
    ]);

    type SubRow = {
      price_id: string | null;
      status: string | null;
      current_period_end: string | null;
      environment?: string | null;
      product_id?: string | null;
    };
    const isComped = (sub: SubRow) => String(sub.product_id ?? "").startsWith("manual_");

    const envScoped = ((subs ?? []) as SubRow[]).filter(
      (sub) => !data.environment || isComped(sub) || sub.environment === data.environment,
    );

    // Treat sub as "in force" only if status indicates access (including
    // canceled-but-still-in-period and past_due during dunning).
    const activeSubs = envScoped.filter(subscriptionInForce);

    const activePriceIds = activeSubs.map((sub) => String(sub.price_id ?? "")).filter(Boolean);
    const primaryTierPriceId = activePriceIds.find((priceId) => normalizeTier(priceId) !== "postcard") ?? null;
    const activePriceId = primaryTierPriceId ?? activePriceIds[0] ?? null;
    const activeTier = activePriceIds
      .map(normalizeTier)
      .sort((a, b) => TIER_RANK[b] - TIER_RANK[a])[0];

    // Subscription is the source of truth when active; otherwise fall back to
    // profile.tier (set by webhook — includes one-time Whisper purchases).
    const tier: "postcard" | "whisper" | "host" | "atelier" = isOwner
      ? "atelier" // owners get the highest tier's features by design
      : activeTier && activeTier !== "postcard"
        ? activeTier
        : normalizeTier(profile?.tier);

    const guestImportPaid = !!profile?.guest_import_enabled;
    const thankYouCardsPaid = !!(profile as { thank_you_cards_enabled?: boolean } | null)?.thank_you_cards_enabled;
    const isAtelierTrial = activePriceId === ATELIER_TRIAL_PRICE_ID;
    const canImportGuests = isOwner === true || tier === "atelier" || guestImportPaid;
    const canUseThankYouStudio = isOwner === true || tier === "atelier" || thankYouCardsPaid;
    const canCollectPayments = isOwner === true || tier === "host" || tier === "atelier";
    // Branding removed automatically on paid tiers; Postcard/Whisper can buy the $3 addon per-event.
    const brandingRemovedByTier = isOwner === true || tier === "host" || tier === "atelier";
    // Project Management is a paid add-on for ALL tiers (including Atelier).
    // Event integration (linking PM ↔ events) is gated separately by tier
    // (Host/Atelier) inside the UI.
    const hasPmAddon = activePriceIds.some((priceId) => PM_PRICE_IDS.has(priceId));
    const hasProjectManagement = isOwner === true || hasPmAddon;
    const hasAtelier = isOwner === true || tier === "atelier";
    const converterPaid = !!(profile as { converter_enabled?: boolean } | null)?.converter_enabled;
    const hasConverter = hasAtelier || converterPaid;
    const smsPackPaid = !!(profile as { sms_pack_enabled?: boolean } | null)?.sms_pack_enabled;
    // Free SMS is Host/Atelier only. Postcard AND Whisper must buy the $6
    // `sms_pack_addon`. This flag previously said `tier !== "postcard"`, which
    // showed Whisper hosts an SMS panel that queueSms would always reject —
    // canSendSms is the same helper the send path enforces, so the UI and the
    // server can no longer disagree.
    const { canSendSms } = await import("@/lib/tier-limits");
    const hasSmsReminders = isOwner === true || canSendSms(tier, smsPackPaid);

    return {
      isOwner: isOwner === true,
      tier,
      canImportGuests,
      guestImportPaid,
      canUseThankYouStudio,
      thankYouCardsPaid,
      canCollectPayments,
      brandingRemovedByTier,
      hasProjectManagement,
      hasPmAddon,
      hasAtelier,
      hasConverter,
      converterPaid,
      hasSmsReminders,
      smsPackPaid,
      activePriceId,
      trialEndsAt: isAtelierTrial ? (activeSubs.find((sub) => sub.price_id === ATELIER_TRIAL_PRICE_ID)?.current_period_end ?? null) : null,
      trialGuestLimit: isAtelierTrial ? ATELIER_TRIAL_GUEST_LIMIT : null,
    };
  });


