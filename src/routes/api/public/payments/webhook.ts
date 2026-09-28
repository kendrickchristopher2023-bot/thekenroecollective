import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

let _supabase: any = null;
function getSupabase(): any {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

// price_id -> profile tier. Keyed by human-readable lookup_key (stable across sandbox/live).
const PRICE_TO_TIER: Record<string, "host" | "atelier" | "whisper"> = {
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
  host_yearly_v4: "host",
  atelier_onetime: "atelier",
  atelier_monthly: "atelier",
  atelier_yearly: "atelier",
  atelier_monthly_v3: "atelier",
  atelier_yearly_v3: "atelier",
  atelier_trial_30d: "atelier",
  // Bundles that include an events plan alongside Project Management.
  host_pm_bundle_monthly: "host",
  host_pm_bundle_yearly: "host",
  atelier_studio_monthly: "atelier",
  atelier_studio_yearly: "atelier",
  studio_collective_monthly: "atelier",
  studio_collective_yearly: "atelier",
};

// Subscriptions that grant an add-on but no events plan. Their entitlement is
// read straight from the subscriptions row (pricing.functions.ts PM_PRICE_IDS,
// pm_has_events_access), so the webhook must neither "upgrade" profiles.tier
// for them nor reset it to free when they lapse — a Whisper host who cancels
// Project Manager would otherwise lose Whisper.
const TIER_NEUTRAL_PRICES = new Set([
  "pm_addon_monthly",
  "pm_addon_yearly",
  "pm_solo_monthly",
  "pm_solo_yearly",
]);

function isTierNeutralPrice(priceId: string | undefined | null): boolean {
  return !!priceId && TIER_NEUTRAL_PRICES.has(priceId);
}

// Returns null (not "free") for an unrecognized price — the Stripe catalog
// has accumulated legacy/orphaned prices with no lookup_key (old versions,
// duplicate products from past re-pricing) that will never all be enumerated
// here. Callers must NOT treat null as "downgrade to free": a subscription
// still being actively charged on a price this map doesn't know about is a
// mapping gap to fix, not evidence the customer should lose their plan.
function tierForPrice(priceId: string | undefined | null): "host" | "atelier" | "whisper" | null {
  if (!priceId) return null;
  // Whisper one-time unlock should never arrive as a subscription event; preserve tier if it does.
  if (priceId === "whisper_onetime") return "whisper";
  return PRICE_TO_TIER[priceId] ?? null;
}

function subscriptionPriceId(subscription: any): string | undefined {
  const item = subscription?.items?.data?.[0];
  return (
    item?.price?.lookup_key ||
    item?.price?.metadata?.lovable_external_id ||
    item?.price?.id ||
    undefined
  );
}

async function syncSubscription(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("No userId in subscription metadata", subscription.id);
    return;
  }

  const item = subscription.items?.data?.[0];
  const priceId =
    item?.price?.lookup_key ||
    item?.price?.metadata?.lovable_external_id ||
    item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  const sb = getSupabase();
  await sb.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      product_id: productId,
      price_id: priceId,
      status: subscription.status,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      environment: env,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  const stillActive =
    subscription.status === "active" ||
    subscription.status === "trialing" ||
    subscription.status === "past_due" ||
    (subscription.status === "canceled" && periodEnd && periodEnd * 1000 > Date.now());

  // Vendor ad subscriptions: activate the linked ad_placement instead of
  // touching profile.tier (which is for app subscription plans).
  const adPlacementId = subscription.metadata?.adPlacementId;
  if (adPlacementId || priceId === "ad_featured_monthly" || priceId === "ad_spotlight_monthly") {
    if (adPlacementId) {
      await sb
        .from("ad_placements")
        .update({
          stripe_subscription_id: subscription.id,
          status: stillActive ? "active" : "paused",
          starts_at: periodStart ? new Date(periodStart * 1000).toISOString() : null,
          ends_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        })
        .eq("id", adPlacementId);
    }
    return;
  }

  // Add-on-only subscriptions (Project Manager solo / add-on): the row above
  // is the whole grant. Never touch the events plan for them.
  if (isTierNeutralPrice(priceId)) {
    console.log("[webhook] Add-on subscription synced; events plan unchanged", {
      priceId,
      userId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
    return;
  }

  if (!stillActive) {
    await sb.from("profiles").update({ tier: "free" }).eq("id", userId);
    return;
  }
  const tier = tierForPrice(priceId);
  if (!tier) {
    // Active, still being charged, but on a price this map doesn't
    // recognize (legacy version, orphaned duplicate product, etc.) —
    // leave the profile's tier untouched rather than silently stripping a
    // paying customer's plan. This needs a human to add the price to
    // PRICE_TO_TIER or archive the stale Stripe price.
    console.error("[webhook] Unrecognized active price_id — profile tier left unchanged", {
      priceId,
      userId,
      subscriptionId: subscription.id,
    });
    return;
  }
  await sb.from("profiles").update({ tier }).eq("id", userId);
}


async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  const sb = getSupabase();
  await sb
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);

  // If this was a vendor ad subscription, pause the ad.
  const adPlacementId = subscription.metadata?.adPlacementId;
  if (adPlacementId) {
    await sb.from("ad_placements").update({ status: "paused" }).eq("id", adPlacementId);
    return;
  }

  // Cancelling an add-on-only subscription must not reset the events plan.
  if (isTierNeutralPrice(subscriptionPriceId(subscription))) return;

  const userId = subscription.metadata?.userId;
  if (userId) {
    await sb.from("profiles").update({ tier: "free" }).eq("id", userId);
  }
}


async function recordReferralIfAny(session: any, env: StripeEnv) {
  const discountCode = session.metadata?.discountCode;
  const userId = session.metadata?.userId;
  if (!discountCode || !userId) return;
  const sb = getSupabase();
  const { data: code } = await sb
    .from("discount_codes")
    .select("kind,referrer_user_id")
    .ilike("code", discountCode)
    .maybeSingle();
  if (!code || code.kind !== "referral" || !code.referrer_user_id) return;
  if (code.referrer_user_id === userId) return;
  await sb.rpc("record_referral_redemption", {
    _code: discountCode,
    _referred_user_id: userId,
    _environment: env,
  });
}

// Auto-credit referrer's free month by extending their trial_end by 30 days.
// Idempotent: guarded by referrals.credit_granted_at.
async function creditReferrerIfEligible(invoice: any, env: StripeEnv) {
  const sb = getSupabase();
  const subId = invoice.subscription;
  const customerId = invoice.customer;
  if (!subId || !customerId) return;
  // Only credit on the first successful payment for this subscription.
  if (invoice.billing_reason && invoice.billing_reason !== "subscription_create") return;

  // Find the referred user via metadata on the subscription
  const { createStripeClient } = await import("@/lib/stripe.server");
  const stripe = createStripeClient(env);
  const sub = await stripe.subscriptions.retrieve(subId);
  const referredUserId = sub.metadata?.userId;
  if (!referredUserId) return;

  const { data: referral } = await sb
    .from("referrals")
    .select("id,referrer_user_id,credit_granted_at")
    .eq("referred_user_id", referredUserId)
    .eq("environment", env)
    .maybeSingle();
  if (!referral || referral.credit_granted_at) return;

  // Find the referrer's active subscription in the same environment.
  const { data: refSub } = await sb
    .from("subscriptions")
    .select("stripe_subscription_id,current_period_end,status")
    .eq("user_id", referral.referrer_user_id)
    .eq("environment", env)
    .in("status", ["active", "trialing"])
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  let creditNote = "no_active_plan";
  if (refSub?.stripe_subscription_id) {
    try {
      const currentEnd = refSub.current_period_end
        ? Math.floor(new Date(refSub.current_period_end).getTime() / 1000)
        : Math.floor(Date.now() / 1000);
      const newTrialEnd = currentEnd + 30 * 24 * 60 * 60;
      await stripe.subscriptions.update(refSub.stripe_subscription_id, {
        trial_end: newTrialEnd,
        proration_behavior: "none",
      });
      creditNote = "trial_extended_30d";
    } catch (e) {
      console.error("Referral credit failed:", e);
      creditNote = "credit_failed";
    }
  }

  // Only mark as granted when the trial extension actually succeeded — otherwise
  // getMyReferralStats (which counts "free months earned" off credit_granted_at
  // being non-null) would show a reward the referrer never received, with no
  // way to retry since credit_granted_at would already be set.
  await sb
    .from("referrals")
    .update(
      creditNote === "trial_extended_30d"
        ? { credit_granted_at: new Date().toISOString(), credit_note: creditNote }
        : { credit_note: creditNote },
    )
    .eq("id", referral.id);
}

// Gift-fund contributions are recorded here — the server-verified source of
// truth — rather than trusting client-side state after the Stripe redirect.
async function recordGiftContribution(session: any) {
  const sb = getSupabase();
  const eventId = session.metadata?.eventId;
  if (!eventId) {
    console.error("gift_fund checkout missing eventId metadata", session.id);
    return;
  }
  const { data: row, error } = await sb.from("events").select("data").eq("id", eventId).maybeSingle();
  if (error || !row) {
    console.error("gift_fund: event not found", eventId, error);
    return;
  }
  const eventData = (row.data ?? {}) as Record<string, any>;
  const fund =
    eventData.giftFund ?? {
      enabled: true,
      label: "Gift Fund",
      currency: "USD",
      presetAmounts: [25, 50, 100, 250],
      contributions: [],
    };
  const contributions: any[] = fund.contributions ?? [];
  // Idempotent: Stripe may redeliver the same event.
  if (contributions.some((c) => c.sessionId === session.id)) return;

  // The gift amount, not the checkout total — amount_total now includes the
  // processing fee line item. giftAmountCents is the true figure, stashed in
  // session metadata at creation (see createGiftContributionCheckout);
  // amount_total is only a fallback for sessions created before it existed.
  const giftAmountCents = Number(session.metadata?.giftAmountCents);
  const amount = (Number.isFinite(giftAmountCents) && giftAmountCents > 0
    ? giftAmountCents
    : session.amount_total ?? 0) / 100;

  const contribution = {
    id: crypto.randomUUID(),
    name: (session.metadata?.contributorName as string | undefined) || "Anonymous",
    email: session.customer_details?.email || session.customer_email || undefined,
    amount,
    message: (session.metadata?.giftMessage as string | undefined) || undefined,
    sessionId: session.id,
    at: new Date().toISOString(),
  };

  const nextData = {
    ...eventData,
    giftFund: { ...fund, contributions: [contribution, ...contributions] },
  };
  await sb.from("events").update({ data: nextData }).eq("id", eventId);
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  const sb = getSupabase();
  const discountCode = session.metadata?.discountCode;
  if (discountCode) {
    await sb.rpc("increment_discount_usage", { discount_code: discountCode });
  }
  // Record referral redemption for both subscription and one-time sessions.
  await recordReferralIfAny(session, env);

  // One-time add-on purchases (mode === "payment"). Subscription sessions
  // are handled by customer.subscription.* events above.
  if (session.mode !== "payment") return;

  // Delayed-notification methods (SEPA, Bacs, boleto, OXXO) fire
  // checkout.session.completed when the payment is submitted, not settled.
  // "paid" and "no_payment_required" are final; "unpaid" settles later via
  // checkout.session.async_payment_succeeded. Never grant on "unpaid".
  if (session.payment_status === "unpaid") {
    console.log("checkout.session.completed unpaid, deferring grant", session.id);
    return;
  }


  if (session.metadata?.kind === "gift_fund") {
    await recordGiftContribution(session);
    return;
  }

  const userId = session.metadata?.userId;
  if (!userId) {
    console.error("checkout.session.completed missing userId metadata", session.id);
    return;
  }
  const { createStripeClient } = await import("@/lib/stripe.server");
  const stripe = createStripeClient(env);
  const line = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
  const lookupKeys = line.data
    .map((li) => li.price?.lookup_key)
    .filter((k): k is string => !!k);

  if (lookupKeys.includes("whisper_onetime") || lookupKeys.includes("whisper_onetime_v3")) {
    // Don't downgrade a paying Host/Atelier customer who buys a Whisper.
    const { data: existing } = await sb
      .from("profiles")
      .select("tier")
      .eq("id", userId)
      .maybeSingle();
    const current = (existing?.tier ?? "").toLowerCase();
    if (current !== "host" && current !== "atelier") {
      await sb.from("profiles").update({ tier: "whisper" }).eq("id", userId);
    }
  }
  // Group eCards: the sending fee. Payment is the gate on delivery, so mark it
  // here (webhook is the source of truth) as well as on the client return.
  const ecardId = (session.metadata as Record<string, string> | undefined)?.ecardId;
  if (ecardId && lookupKeys.includes("ecard_send_fee")) {
    await sb
      .from("ecards")
      .update({
        is_paid: true,
        paid_at: new Date().toISOString(),
        stripe_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
      })
      .eq("id", ecardId);
  }

  // Kenroe Sound Studio: a finished piece. The credit is what lets the studio
  // compose, so release it here as well as on the client return.
  const purchaseId = (session.metadata as Record<string, string> | undefined)?.purchaseId;
  // Songs are on music_piece_*, letters and spoken word on speech_piece_*.
  if (
    purchaseId &&
    lookupKeys.some((k) => k.startsWith("music_piece_") || k.startsWith("speech_piece_"))
  ) {
    await sb
      .from("sound_piece_purchases")
      .update({
        status: "paid",
        credit_unused: true,
        stripe_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
      })
      .eq("id", purchaseId)
      .eq("status", "pending");
  }


  if (lookupKeys.includes("guest_import_addon")) {
    await sb.from("profiles").update({ guest_import_enabled: true }).eq("id", userId);
  }
  if (lookupKeys.includes("thank_you_cards_addon")) {
    await sb.from("profiles").update({ thank_you_cards_enabled: true }).eq("id", userId);
  }
  if (lookupKeys.includes("sms_pack_addon")) {
    await sb.from("profiles").update({ sms_pack_enabled: true }).eq("id", userId);
  }
  if (lookupKeys.includes("converter_addon")) {
    await sb.from("profiles").update({ converter_enabled: true }).eq("id", userId);
  }

  // One-time single-event passes (Whisper $19, Host $49, Atelier $119). Idempotent via
  // the unique stripe_session_id column.
  for (const key of lookupKeys) {
    const tier = key === "whisper_single_event" ? "whisper"
      : key === "host_single_event" ? "host"
      : key === "atelier_single_event" ? "atelier"
      : null;
    if (!tier) continue;
    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt.getTime() + 365 * 24 * 60 * 60 * 1000);
    const paymentIntentId = typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
    await sb.from("one_time_passes").upsert(
      {
        user_id: userId,
        tier,
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        price_id: key,
        environment: env,
        purchased_at: purchasedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        ai_generations_cap: tier === "atelier" ? 150 : null,
      },
      { onConflict: "stripe_session_id" },
    );
  }

  // Per-event add-ons: authoritative server-side grant. Mirrors the client-called
  // confirmCheckoutSession path so entitlements land even if the browser never
  // returns to the success page. Keep in sync with PER_EVENT_ADDON_PRICE_TO_KEY
  // and PER_EVENT_ADDON_ALLOW_MULTIPLE in payments.functions.ts.
  const perEventAddonMap: Record<string, string> = {
    event_branding_removal: "branding_removal",
    event_photo_wall: "photo_wall",
  };
  const multiBuyKeys = new Set<string>();
  const eventIdMeta = (session.metadata as Record<string, string> | undefined)?.eventId;
  if (eventIdMeta) {
    for (const key of lookupKeys) {
      const addonKey = perEventAddonMap[key];
      if (!addonKey) continue;
      const allowMultiple = multiBuyKeys.has(addonKey);
      const storedKey = allowMultiple ? `${addonKey}:${session.id}` : addonKey;
      await sb.from("event_addons").upsert(
        {
          event_id: eventIdMeta,
          user_id: userId,
          addon_key: storedKey,
          stripe_checkout_session_id: session.id,
          environment: env,
          metadata: { price_id: key, base_key: addonKey, allow_multiple: allowMultiple },
        },
        { onConflict: "event_id,addon_key,environment" },
      );
    }
  }

  // Account-scope add-ons all covered above (guest_import, thank_you_cards, sms_pack, converter, whisper).
}

async function revokeRefundedAddons(charge: any, env: StripeEnv) {
  // Partial goodwill refunds do not remove access. A fully refunded charge does.
  if (charge.refunded !== true) return;
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;
  if (!paymentIntentId) return;
  const { createStripeClient } = await import("@/lib/stripe.server");
  const stripe = createStripeClient(env);
  const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 10 });
  const sb = getSupabase();
  for (const session of sessions.data) {
    const userId = session.metadata?.userId || session.client_reference_id;
    if (!userId) continue;
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 });
    const keys = items.data.map((item: any) => item.price?.lookup_key).filter(Boolean);
    const patch: Record<string, boolean> = {};
    if (keys.includes("guest_import_addon")) patch.guest_import_enabled = false;
    if (keys.includes("thank_you_cards_addon")) patch.thank_you_cards_enabled = false;
    if (keys.includes("sms_pack_addon")) patch.sms_pack_enabled = false;
    if (keys.includes("converter_addon")) patch.converter_enabled = false;
    if (Object.keys(patch).length) await sb.from("profiles").update(patch).eq("id", userId);
    if (keys.includes("event_branding_removal") && session.metadata?.eventId) {
      await sb.from("event_addons")
        .delete()
        .eq("event_id", session.metadata.eventId)
        .eq("addon_key", "branding_removal")
        .eq("environment", env);
    }
  }
}



async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await syncSubscription(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    case "checkout.session.completed": {
      await handleCheckoutCompleted(event.data.object, env);
      // Owner alert (SMS + email). Non-fatal, idempotent per session.
      const { alertOwnerOfCheckout } = await import("@/lib/owner-alerts-payments.server");
      await alertOwnerOfCheckout(event.data.object, env);
      break;
    }
    case "checkout.session.async_payment_succeeded": {
      // Delayed payment settled: run the same grant path, now that it is paid.
      await handleCheckoutCompleted({ ...event.data.object, payment_status: "paid" }, env);
      const { alertOwnerOfCheckout } = await import("@/lib/owner-alerts-payments.server");
      await alertOwnerOfCheckout({ ...event.data.object, payment_status: "paid" }, env);
      break;
    }

    case "invoice.payment_succeeded":
      await creditReferrerIfEligible(event.data.object, env);
      break;
    case "charge.refunded":
      await revokeRefundedAddons(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}


export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook with invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
