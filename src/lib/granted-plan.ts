/**
 * Manually granted (comped) plans are recorded as ordinary subscription rows
 * with synthetic `manual_*` ids, because there is no real Stripe subscription
 * or customer behind them. Stripe's billing portal therefore cannot open for
 * these accounts — it fails with "No such customer".
 *
 * Any billing surface must check this before offering self-serve billing.
 */
export function isGrantedPlan(sub: {
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  product_id?: string | null;
} | null | undefined): boolean {
  if (!sub) return false;
  return (
    (sub.stripe_customer_id ?? "").startsWith("manual_") ||
    (sub.stripe_subscription_id ?? "").startsWith("manual_") ||
    (sub.product_id ?? "").startsWith("manual_")
  );
}

export const GRANTED_PLAN_NOTICE =
  "This plan was granted to you by The Kenroe Collective, so there is nothing to pay and no billing to manage. Your access stays on until the date shown above. Contact us if you have a question about it.";
