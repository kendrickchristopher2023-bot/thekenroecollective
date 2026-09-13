import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getRevenueDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: isOwner } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "owner",
    });
    if (!isOwner) throw new Error("Forbidden");

    const { getDemoScope } = await import("@/lib/demo-accounts.server");
    const scope = await getDemoScope();
    // Owner-scoped tables get demo/production separation (shared database).
    const scopeOwner = <T extends { eq: any; neq: any }>(q: T, column: string): T => {
      if (scope.onlyUserId) return q.eq(column, scope.onlyUserId);
      let out: any = q;
      for (const id of scope.excludeUserIds) out = out.neq(column, id);
      return out as T;
    };

    // vendors and vendor_reviews are PRIVACY LOCKED, so those two aggregate
    // reads use the service role. The owner role is verified above and the
    // projections stay non-identifying (status, category, rating).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [subs, vendors, rfqs, ads, impressions, reviews] = await Promise.all([
      scopeOwner(
        supabase
          .from("subscriptions")
          .select("status, current_period_end, product_id, environment, created_at"),
        "user_id",
      ),
      scopeOwner(
        supabaseAdmin.from("vendors").select("id, status, category, created_at"),
        "owner_user_id",
      ),
      scopeOwner(supabase.from("rfq_requests").select("id, status, created_at"), "requester_user_id"),
      scopeOwner(
        supabase.from("ad_placements").select("id, status, monthly_price_id, created_at"),
        "owner_user_id",
      ),
      supabase.from("ad_impressions").select("placement_id, kind, at"),
      scopeOwner(supabaseAdmin.from("vendor_reviews").select("rating"), "reviewer_user_id"),
    ]);


    const liveSubs = (subs.data || []).filter((s) => s.environment === "live");
    const activeSubs = liveSubs.filter(
      (s) =>
        (s.status === "active" || s.status === "trialing") &&
        (!s.current_period_end || new Date(s.current_period_end) > new Date()),
    );

    const subsByTier: Record<string, number> = {};
    for (const s of activeSubs) {
      const t = s.product_id || "unknown";
      subsByTier[t] = (subsByTier[t] || 0) + 1;
    }

    const vendorList = vendors.data || [];
    const vendorsByStatus: Record<string, number> = {};
    for (const v of vendorList) vendorsByStatus[v.status] = (vendorsByStatus[v.status] || 0) + 1;

    const rfqList = rfqs.data || [];
    const rfqsByStatus: Record<string, number> = {};
    for (const r of rfqList) rfqsByStatus[r.status] = (rfqsByStatus[r.status] || 0) + 1;

    const adList = ads.data || [];
    const activeAds = adList.filter((a) => a.status === "active");
    const monthlyAdRevenue = 0; // priced via Stripe price IDs; aggregate via Stripe when wired

    const impressionList = impressions.data || [];
    const clicks = impressionList.filter((i) => i.kind === "click").length;
    const views = impressionList.filter((i) => i.kind === "impression").length;

    const reviewList = reviews.data || [];
    const avgRating = reviewList.length
      ? reviewList.reduce((s, r) => s + Number(r.rating || 0), 0) / reviewList.length
      : 0;

    return {
      subscriptions: {
        active: activeSubs.length,
        total: liveSubs.length,
        byTier: subsByTier,
      },
      vendors: {
        total: vendorList.length,
        byStatus: vendorsByStatus,
      },
      rfqs: {
        total: rfqList.length,
        byStatus: rfqsByStatus,
      },
      ads: {
        active: activeAds.length,
        monthlyRevenue: monthlyAdRevenue,
        clicks,
        impressions: views,
      },
      reviews: {
        total: reviewList.length,
        averageRating: Number(avgRating.toFixed(2)),
      },
    };
  });
