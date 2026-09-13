import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { isGrantedPlan } from "@/lib/granted-plan";

export type SubscriptionRow = {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  product_id: string;
  price_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: string;
};

export function useSubscription() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);

  useEffect(() => {
    let active = true;
    let env: ReturnType<typeof getStripeEnvironment>;
    try {
      env = getStripeEnvironment();
    } catch {
      setLoading(false);
      return;
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) {
        if (active) {
          setSubscription(null);
          setLoading(false);
        }
        return null;
      }
      const { data } = await (supabase as any)
        .from("subscriptions")
        .select("stripe_subscription_id,stripe_customer_id,product_id,price_id,status,current_period_end,cancel_at_period_end,environment")
        .eq("user_id", userId)
        .eq("environment", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active) {
        setSubscription((data as SubscriptionRow | null) ?? null);
        setLoading(false);
      }
      return userId;
    }

    load().then((userId) => {
      if (!active || !userId) return;
      channel = supabase
        .channel(`subscription-changes:${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${userId}` },
          () => load(),
        )
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end)
    : null;
  const inPeriod = !periodEnd || periodEnd > new Date();
  const isActive =
    !!subscription &&
    inPeriod &&
    (["active", "trialing", "past_due"].includes(subscription.status) ||
      (subscription.status === "canceled" && inPeriod));

  // Comped/manually granted plans have no real Stripe customer behind them,
  // so no billing surface should offer self-serve billing for them.
  const isGranted = isGrantedPlan(subscription);

  return { loading, subscription, isActive, isGranted };
}
