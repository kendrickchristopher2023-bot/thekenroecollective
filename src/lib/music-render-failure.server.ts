// Self-healing for a paid render that fails. Server-only: it talks to the
// database with the admin client and to the payment provider, so it must never
// sit in a module the browser can reach.
import { toUserMessage } from "@/lib/user-error";

const MAX_RENDER_ATTEMPTS = 2;

/**
 * Item 12: a paid render that fails self-heals.
 *
 * Every failure is counted on the purchase, and the credit is left unused so a
 * retry costs nothing. Once the attempts run out, the payment is refunded
 * automatically through the payment provider and the purchase is closed, so no
 * one is left waiting on support to notice. If the refund call itself fails the
 * purchase stays a live credit, which is the safe side to fail on.
 *
 * Returns the message the host should see.
 */
export async function handleRenderFailure(purchaseId: string, error: unknown): Promise<string> {
  const detail = toUserMessage(error, "The composer was unavailable.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("sound_piece_purchases")
    .select("id, render_attempts, amount_cents, stripe_payment_intent_id, environment, refunded_at")
    .eq("id", purchaseId)
    .maybeSingle();
  const p = (row ?? null) as {
    render_attempts: number | null;
    amount_cents: number;
    stripe_payment_intent_id: string | null;
    environment: string;
    refunded_at: string | null;
  } | null;
  const attempts = (p?.render_attempts ?? 0) + 1;

  await supabaseAdmin
    .from("sound_piece_purchases")
    .update({ render_attempts: attempts, last_error: detail.slice(0, 500), credit_unused: true })
    .eq("id", purchaseId);

  if (!p || p.refunded_at || attempts < MAX_RENDER_ATTEMPTS) {
    return `The composer couldn't finish that piece: ${detail} Nothing extra was charged, and your payment is still waiting as a credit. Try again and it costs nothing.`;
  }

  if (!p.stripe_payment_intent_id) {
    return `The composer couldn't finish that piece: ${detail} Your payment is still a credit you can spend on a retry. If it keeps failing, reply to your receipt and we'll return the money.`;
  }

  try {
    const { createStripeClient } = await import("@/lib/stripe.server");
    const stripe = createStripeClient(p.environment === "live" ? "live" : "sandbox");
    const refund = await stripe.refunds.create({
      payment_intent: p.stripe_payment_intent_id,
      reason: "requested_by_customer",
    });
    await supabaseAdmin
      .from("sound_piece_purchases")
      .update({
        status: "refunded",
        credit_unused: false,
        refunded_at: new Date().toISOString(),
        refund_id: refund.id,
        refund_reason: `render_failed: ${detail.slice(0, 200)}`,
      })
      .eq("id", purchaseId);
    return "The composer couldn't finish that piece, so we've refunded you in full automatically. It will be back on your card within a few days. Nothing to chase, and you're welcome to try again any time.";
  } catch (refundError) {
    console.error("Music refund failed", purchaseId, refundError);
    return `The composer couldn't finish that piece: ${detail} Your payment is still a credit, so a retry costs nothing, and we're returning the money if it can't be delivered.`;
  }
}
