// Refund policy engine for one-time single-event passes.
// - 24-hour window from purchase
// - Only if the pass has NOT been materially used (first_material_use_at is null)
// - One self-serve refund per customer lifetime (subsequent must go through support)
// Server-side gate: re-verifies eligibility, then issues Stripe refund via API,
// revokes the pass, and appends a refund_log row.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

export type RefundEligibility = {
  eligible: boolean;
  reason?: "materially_used" | "window_expired" | "already_refunded" | "revoked" | "not_found";
  refundExpiresAt?: string | null;
  hasPriorRefund?: boolean;
};

const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Read-only eligibility check for the given pass owned by the caller. */
export const checkRefundEligibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({ passId: z.string().uuid() }), data, "refunds.functions.ts:25"),
  )
  .handler(async ({ data, context }): Promise<RefundEligibility> => {
    const { supabase, userId } = context;
    const { data: pass } = await supabase
      .from("one_time_passes")
      .select("id,purchased_at,first_material_use_at,refunded_at,revoked_at")
      .eq("id", data.passId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!pass) return { eligible: false, reason: "not_found" };

    const { data: prior } = await supabase
      .from("refund_log")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    const hasPriorRefund = (prior?.length ?? 0) > 0;

    const passRow = pass as {
      purchased_at: string;
      first_material_use_at: string | null;
      refunded_at: string | null;
      revoked_at: string | null;
    };
    if (passRow.refunded_at) return { eligible: false, reason: "already_refunded", hasPriorRefund };
    if (passRow.revoked_at) return { eligible: false, reason: "revoked", hasPriorRefund };
    if (passRow.first_material_use_at) return { eligible: false, reason: "materially_used", hasPriorRefund };
    const purchasedAt = new Date(passRow.purchased_at).getTime();
    const refundExpiresAt = new Date(purchasedAt + REFUND_WINDOW_MS).toISOString();
    if (Date.now() - purchasedAt > REFUND_WINDOW_MS) {
      return { eligible: false, reason: "window_expired", refundExpiresAt, hasPriorRefund };
    }
    return { eligible: !hasPriorRefund, refundExpiresAt, hasPriorRefund };
  });

/** Issue the Stripe refund, revoke the pass, and append a refund_log row. */
export const requestPassRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({
      passId: z.string().uuid(),
      environment: z.enum(["sandbox", "live"]),
      reason: z.string().max(500).optional(),
    }), data, "refunds.functions.ts:65"),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; refundId: string } | { error: string }> => {
    const { supabase, userId } = context;

    // Re-verify eligibility server-side, ignoring any client claim.
    const { data: pass } = await supabase
      .from("one_time_passes")
      .select("id,purchased_at,first_material_use_at,refunded_at,revoked_at,stripe_payment_intent_id,environment")
      .eq("id", data.passId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!pass) return { error: "Pass not found" };
    const p = pass as {
      purchased_at: string;
      first_material_use_at: string | null;
      refunded_at: string | null;
      revoked_at: string | null;
      stripe_payment_intent_id: string | null;
      environment: string;
    };
    if (p.refunded_at) return { error: "This pass has already been refunded." };
    if (p.revoked_at) return { error: "This pass is no longer active." };
    if (p.first_material_use_at) return { error: "This purchase is final — the pass has been used." };
    if (Date.now() - new Date(p.purchased_at).getTime() > REFUND_WINDOW_MS) {
      return { error: "The 24-hour refund window has expired." };
    }
    const { data: prior } = await supabase
      .from("refund_log")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    if ((prior?.length ?? 0) > 0) {
      return { error: "Only one self-serve refund per customer. Please contact support." };
    }
    if (!p.stripe_payment_intent_id) return { error: "Missing payment reference — please contact support." };

    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const refund = await stripe.refunds.create({
        payment_intent: p.stripe_payment_intent_id,
        reason: "requested_by_customer",
        metadata: { passId: data.passId, userId },
      });

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("one_time_passes").update({
        refunded_at: new Date().toISOString(),
        revoked_at: new Date().toISOString(),
        refund_reason: data.reason ?? "self_serve_24h",
      }).eq("id", data.passId);

      await supabaseAdmin.from("refund_log").insert({
        user_id: userId,
        pass_id: data.passId,
        stripe_refund_id: refund.id,
        stripe_payment_intent_id: p.stripe_payment_intent_id,
        amount_cents: refund.amount ?? null,
        currency: refund.currency ?? null,
        reason: data.reason ?? "self_serve_24h",
        environment: data.environment,
      });

      return { ok: true, refundId: refund.id };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/** Server-side stamp for first material use of an attached pass. Call on
 *  the first occurrence of a delivery action tied to the pass's event
 *  (invitation email, SMS queued, AI generation, export, announcement
 *  published, check-in activated). Idempotent — only the first call sticks. */
export const markPassMaterialUse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({
      eventId: z.string().min(1).max(120),
      reason: z.string().min(1).max(64),
    }), data, "refunds.functions.ts:145"),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    await supabase.rpc("mark_pass_material_use", {
      _user: userId,
      _event_id: data.eventId,
      _reason: data.reason,
    });
    return { ok: true };
  });
