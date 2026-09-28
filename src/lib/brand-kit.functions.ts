// Owner-only access to the logo pack.
//
// Gate: the caller's verified email must be on OWNER_REPORT_ALLOWLIST (Chris's
// three accounts and Adrian's two). Deliberately no 2FA requirement here, per
// Christopher: locking an owner out of their own logo files is worse than the
// exposure. Do not narrow this list without asking first.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertOwnerReportAllowlist, isAllowlistedOwnerReportUser } from "@/lib/owner-report-access";
import type { BusinessCard } from "@/lib/business-card";

export type BrandKitData = {
  /** Published cards, so each person's printable scan code is on the page. */
  cards: Pick<BusinessCard, "slug" | "full_name">[];
  /** Short-lived signed link per file in the pack, keyed by file name. */
  files: Record<string, string>;
  /** Short-lived signed link per listening sample (voice/...), keyed by file name. */
  previews: Record<string, string>;
  /** Short-lived signed link per film cut and contact sheet (films/...), keyed by file name. */
  films: Record<string, string>;
  /** Short-lived link for the whole pack as one zip. */
  zipUrl: string;
  /** Seconds the links above stay valid. */
  ttlSeconds: number;
};

/** True when the signed-in caller may open the Brand page. Never throws. */
export const canOpenBrandKit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    allowed: await isAllowlistedOwnerReportUser(context.supabase),
  }));

/** Everything the Brand page needs, for allowlisted owners only. */
export const getBrandKit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrandKitData> => {
    await assertOwnerReportAllowlist(context.supabase);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signedBrandAssetUrls, signedBrandPreviewUrls, signedBrandFilmUrls, mintBrandKitTicket, BRAND_LINK_TTL_SECONDS } =
      await import("@/lib/brand-kit.server");

    const [{ data: rows, error }, files, previews, films, ticket] = await Promise.all([
      supabaseAdmin
        .from("business_cards")
        .select("slug, full_name")
        .eq("published", true)
        .order("sort_order", { ascending: true }),
      signedBrandAssetUrls(),
      signedBrandPreviewUrls(),
      signedBrandFilmUrls(),
      mintBrandKitTicket(context.userId),
    ]);
    if (error) throw new Error(error.message);

    const params = new URLSearchParams({ uid: ticket.uid, exp: String(ticket.exp), sig: ticket.sig });
    return {
      cards: (rows ?? []) as BrandKitData["cards"],
      files,
      previews,
      films,
      zipUrl: `/api/public/brand-pack?${params.toString()}`,
      ttlSeconds: BRAND_LINK_TTL_SECONDS,
    };
  });
