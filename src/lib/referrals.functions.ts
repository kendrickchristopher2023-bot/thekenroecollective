import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Returns the current user's personal referral code, creating one on first use.
 * The code is a discount_code row (20% off, unlimited uses) tagged with
 * referrer_user_id so redemptions can be attributed back.
 */
export const getOrCreateMyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_or_create_my_referral_code");
    if (error) throw new Error(error.message);
    return { code: data as string };
  });

export const getMyReferralStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await context.supabase
      .from("referrals")
      .select("id,redeemed_at,credit_granted_at,referred_user_id")
      .eq("referrer_user_id", context.userId)
      .order("redeemed_at", { ascending: false })
      .limit(50);
    const list = rows ?? [];
    return {
      total: list.length,
      pending: list.filter((r: any) => !r.credit_granted_at).length,
      credited: list.filter((r: any) => r.credit_granted_at).length,
      recent: list.slice(0, 10),
    };
  });

// Called from the checkout redemption flow (invoked by webhook after
// successful first payment) to attribute a redemption.
export const recordReferralRedemption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(z.object({ code: z.string().min(1).max(60) }), i, "referrals.functions.ts:41"),
  )
  .handler(async ({ data, context }) => {
    const { data: rowId, error } = await context.supabase.rpc("record_referral_redemption", {
      _code: data.code,
      _referred_user_id: context.userId,
      _environment: "live",
    });
    if (error) throw new Error(error.message);
    return { id: rowId as string | null };
  });
