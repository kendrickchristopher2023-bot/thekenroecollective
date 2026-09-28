// Client-side wrapper around meEntitlements that applies the owner
// "preview as tier" override from localStorage. Use this everywhere in the
// UI instead of calling meEntitlements directly so the preview switcher
// affects every gate consistently.
import { meEntitlements } from "@/lib/pricing.functions";
import { getPreviewTier } from "@/lib/preview-tier";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";

const UNAUTHENTICATED: Entitlements = {
  isOwner: false,
  tier: "postcard",
  canImportGuests: false,
  guestImportPaid: false,
  canUseThankYouStudio: false,
  thankYouCardsPaid: false,
  canCollectPayments: false,
  brandingRemovedByTier: false,
  hasProjectManagement: false,
  hasPmAddon: false,
  hasAtelier: false,
  hasConverter: false,
  converterPaid: false,
  hasSmsReminders: false,
  smsPackPaid: false,
  activePriceId: null,
  trialEndsAt: null,
  trialGuestLimit: null,
};

export type Tier = "postcard" | "whisper" | "host" | "atelier";

export type Entitlements = {
  isOwner: boolean;
  tier: Tier;
  canImportGuests: boolean;
  guestImportPaid: boolean;
  canUseThankYouStudio: boolean;
  thankYouCardsPaid: boolean;
  canCollectPayments: boolean;
  /** True when the user's tier removes The Kenroe Collective branding automatically (Host+). Per-event $3 addon is separate. */
  brandingRemovedByTier: boolean;
  hasProjectManagement: boolean;
  /** True when the PM add-on subscription is active. PM is a paid add-on for ALL tiers including Atelier — this is the single source of truth for PM access (owner-role exempted). */
  hasPmAddon: boolean;
  /** True when the user is on Atelier (or the Atelier Studio bundle), or owner. */
  hasAtelier: boolean;
  /** Media converter tool — Atelier-included OR one-time account unlock for any tier. */
  hasConverter: boolean;
  /** True when the user paid the one-time converter unlock. */
  converterPaid: boolean;
  /** SMS reminders/nudges — Host & Atelier-included OR one-time account unlock for any tier. */
  hasSmsReminders: boolean;
  /** True when the user paid the one-time SMS pack unlock. */
  smsPackPaid: boolean;
  activePriceId?: string | null;
  trialEndsAt?: string | null;
  trialGuestLimit?: number | null;
  /** True when an owner is previewing a non-owner tier. */
  previewing?: boolean;
};

export async function getEntitlements(): Promise<Entitlements> {
  // Avoid calling the protected server fn when there's no session — it 401s
  // and surfaces as a runtime error on public pages / pre-auth mounts.
  const { data } = await supabase.auth.getSession();
  if (!data.session) return UNAUTHENTICATED;
  let environment: "sandbox" | "live" | undefined;
  try {
    environment = getStripeEnvironment();
  } catch {
    environment = undefined;
  }
  const raw = (await meEntitlements({ data: environment ? { environment } : {} } as any)) as Entitlements;
  // Owners always get the switcher; in the demo environment any signed-in
  // visitor can flip tiers too (UI-only, permissions unchanged).
  const { isDemoRuntime } = await import("@/lib/demo-mode");
  if (!raw.isOwner && !isDemoRuntime()) return raw;
  const preview = getPreviewTier();
  if (!preview) return raw;
  // Owner previewing as a paying tier: recompute feature flags from the
  // previewed tier exactly as a normal customer of that tier would see them.
  const tier = preview;
  const isHostOrAbove = tier === "host" || tier === "atelier";
  const isAtelier = tier === "atelier";
  return {
    ...raw,
    tier,
    canImportGuests: isAtelier,
    canUseThankYouStudio: isAtelier,
    canCollectPayments: isHostOrAbove,
    brandingRemovedByTier: isHostOrAbove,
    hasProjectManagement: false,
    hasPmAddon: false,
    hasAtelier: isAtelier,
    hasConverter: isAtelier,
    converterPaid: false,
    // Free SMS is Host/Atelier only; Postcard/Whisper buy the $6 pack.
    hasSmsReminders: isHostOrAbove,
    smsPackPaid: false,
    activePriceId: null,
    trialEndsAt: null,
    trialGuestLimit: null,
    guestImportPaid: false,
    thankYouCardsPaid: false,
    previewing: true,
  };
}

/** Guest-facing Spanish i18n on the invite page. Whisper+ (paid tiers). */
export function hasGuestI18n(ent: Pick<Entitlements, "tier" | "isOwner" | "previewing">): boolean {
  if (ent.isOwner && !ent.previewing) return true;
  return ent.tier === "whisper" || ent.tier === "host" || ent.tier === "atelier";
}

const TIER_RANK: Record<Tier, number> = { postcard: 0, whisper: 1, host: 2, atelier: 3 };

/**
 * Per-event entitlements. Starts from the user's account entitlements
 * (subscription-derived) and, if a valid one-time pass is attached to the
 * given event, upgrades the effective tier to the pass tier when higher.
 * Subscriptions always trump passes; a lower-tier pass never downgrades.
 */
export async function getEventEntitlements(eventId: string): Promise<Entitlements> {
  const base = await getEntitlements();
  if (!eventId) return base;
  try {
    const { getEventPass } = await import("@/lib/one-time-passes.functions");
    const pass = await getEventPass({ data: { eventId } } as any);
    if (!pass) return base;
    const passTier: Tier = pass.tier as Tier;
    if (TIER_RANK[passTier] <= TIER_RANK[base.tier]) return base;
    const isHostOrAbove = passTier === "host" || passTier === "atelier";
    const isAtelier = passTier === "atelier";
    return {
      ...base,
      tier: passTier,
      canCollectPayments: base.canCollectPayments || isHostOrAbove,
      brandingRemovedByTier: base.brandingRemovedByTier || isHostOrAbove,
      hasAtelier: base.hasAtelier || isAtelier,
      hasProjectManagement: base.hasProjectManagement,
      hasConverter: base.hasConverter || isAtelier,
      // Passes follow the same rule as subscriptions: free SMS starts at Host.
      hasSmsReminders: base.hasSmsReminders || isHostOrAbove,
      canImportGuests: base.canImportGuests || isAtelier,
      canUseThankYouStudio: base.canUseThankYouStudio || isAtelier,
    };
  } catch {
    return base;
  }
}


