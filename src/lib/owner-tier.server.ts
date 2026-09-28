// Applies a plan tier to a user (manual subscription rows plus payment
// provider clean-up). Server-only: it uses the admin client and Stripe, so it
// must never sit in a module the browser can reach.
import type { OwnerTier } from "@/lib/owner-users.functions";
import type { StripeEnv } from "@/lib/stripe.server";

const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

function isManualSub(id: string | null | undefined): boolean {
  return !id || id.startsWith("manual_");
}

function tierFromPriceId(priceId: string | null | undefined): OwnerTier {
  const t = String(priceId ?? "").toLowerCase();
  if (t.includes("atelier")) return "atelier";
  if (t.includes("host")) return "host";
  if (t.includes("whisper")) return "whisper";
  return "postcard";
}

export async function applyTier(supabaseAdmin: any, targetUserId: string, tier: OwnerTier) {
  const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select("id, price_id, status, environment, stripe_subscription_id")
    .eq("user_id", targetUserId)
    .in("status", ACTIVE_STATUSES);

  const stripeErrors: string[] = [];

  for (const s of ((subs ?? []) as any[])) {
    if (tierFromPriceId(s.price_id) === tier) continue;
    // Real Stripe subscriptions must be canceled through Stripe; manual rows
    // (fake `manual_*` ids) only exist locally and are just closed in the DB.
    if (!isManualSub(s.stripe_subscription_id)) {
      try {
        const env: StripeEnv = s.environment === "live" ? "live" : "sandbox";
        const stripe = createStripeClient(env);
        await stripe.subscriptions.cancel(s.stripe_subscription_id as string);
      } catch (e) {
        stripeErrors.push(getStripeErrorMessage(e));
      }
    }
    await supabaseAdmin
      .from("subscriptions")
      .update({
        status: "canceled",
        cancel_at_period_end: false,
        current_period_end: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", s.id);
  }

  const alreadyOnTier = ((subs ?? []) as any[]).some((s) => tierFromPriceId(s.price_id) === tier);

  if (tier !== "postcard" && !alreadyOnTier) {
    await supabaseAdmin.from("subscriptions").insert({
      user_id: targetUserId,
      stripe_subscription_id: `manual_${crypto.randomUUID()}`,
      stripe_customer_id: `manual_cust_${targetUserId.slice(0, 8)}`,
      product_id: `manual_${tier}`,
      price_id: `${tier}_monthly`,
      status: "active",
      environment: "live",
      current_period_start: new Date().toISOString(),
      current_period_end: null,
      cancel_at_period_end: false,
    });
  }

  await supabaseAdmin.from("profiles").update({ tier }).eq("id", targetUserId);

  return stripeErrors;
}
