import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
  getProcessingFeeLineItem,
  createCheckoutSessionWithTax,
} from "@/lib/stripe.server";

type CheckoutSessionResult =
  | { clientSecret: string }
  | { error: string };
type PortalSessionResult = { url: string } | { error: string };
type ConfirmCheckoutResult =
  | { status: "active" | "processing"; priceId?: string }
  | { error: string };
type TrialResult =
  | { status: "active"; priceId: "atelier_trial_30d"; endsAt: string; guestLimit: number }
  | { error: string };

const ATELIER_TRIAL_PRICE_ID = "atelier_trial_30d" as const;
const ATELIER_TRIAL_GUEST_LIMIT = 20;

function normalizeTrialEmail(email: string): { normalized: string; domain: string } {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split("@");
  const domain = rawDomain.trim();
  const baseLocal = rawLocal.split("+")[0] ?? rawLocal;
  const normalizedLocal = domain === "gmail.com" || domain === "googlemail.com"
    ? baseLocal.replace(/\./g, "")
    : baseLocal;
  return { normalized: `${normalizedLocal}@${domain}`, domain };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function tierForPriceId(priceId: string): string | null {
  if (priceId.startsWith("whisper_")) return "free";
  if (priceId.startsWith("host_")) return "host";
  if (priceId.startsWith("atelier_") || priceId === ATELIER_TRIAL_PRICE_ID) return "atelier";
  if (priceId.startsWith("studio_collective")) return "atelier";
  return null;
}

function profileTierForPaidPrice(priceId: string | undefined | null): "free" | "whisper" | "host" | "atelier" {
  if (!priceId) return "free";
  if (priceId.startsWith("atelier_") || priceId === ATELIER_TRIAL_PRICE_ID || priceId.startsWith("studio_collective")) return "atelier";
  if (priceId.startsWith("host_")) return "host";
  if (priceId.startsWith("whisper_")) return "whisper";
  return "free";
}

async function resolveCouponForDiscount(
  stripe: ReturnType<typeof createStripeClient>,
  discount: { code: string; percent_off: number | null; amount_off: number | null; tier_id: string | null },
): Promise<string> {
  const code = discount.code.trim().toUpperCase();
  const amountCents = discount.amount_off ? Math.round(Number(discount.amount_off) * 100) : 0;
  const couponId = ["kc", code.replace(/[^A-Z0-9_]/g, "_"), discount.percent_off ?? 0, amountCents, discount.tier_id ?? "all"]
    .join("_")
    .slice(0, 80);

  try {
    const existing = await stripe.coupons.retrieve(couponId);
    if (!(existing as any).deleted) return existing.id;
  } catch {
    // Create it below when it does not already exist.
  }

  const coupon = await stripe.coupons.create({
    id: couponId,
    name: `${code} discount`,
    duration: "forever",
    ...(discount.percent_off
      ? { percent_off: Number(discount.percent_off) }
      : { amount_off: amountCents, currency: "usd" }),
    metadata: { discountCode: code, tierId: discount.tier_id ?? "all" },
  });
  return coupon.id;
}

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

async function syncStripeSubscriptionForUser(
  stripe: ReturnType<typeof createStripeClient>,
  subscription: any,
  env: StripeEnv,
  userId: string,
) {
  const item = subscription.items?.data?.[0];
  const stripePrice = item?.price;
  const priceId = stripePrice?.lookup_key || stripePrice?.metadata?.lovable_external_id || stripePrice?.id;
  const productId = typeof stripePrice?.product === "string" ? stripePrice.product : stripePrice?.product?.id;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
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
    ["active", "trialing", "past_due"].includes(subscription.status) ||
    (subscription.status === "canceled" && periodEnd && periodEnd * 1000 > Date.now());

  // AI Packages & Menus subscription add-on (monthly or yearly): don't touch
  // tier (it's an add-on, not a plan). Record an account-wide entitlement
  // that activates immediately and stays active until the subscription ends.
  if (priceId === "ai_packages_monthly" || priceId === "ai_packages_yearly") {
    const scope = priceId === "ai_packages_yearly" ? "account_yearly" : "account_monthly";
    const { data: existing } = await supabaseAdmin
      .from("ai_package_entitlements")
      .select("id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin.from("ai_package_entitlements")
        .update({ active: stillActive })
        .eq("id", (existing as { id: string }).id);
    } else {
      await supabaseAdmin.from("ai_package_entitlements").insert({
        user_id: userId,
        scope,
        environment: env,
        stripe_subscription_id: subscription.id,
        active: stillActive,
      });
    }
  } else if (stillActive) {
    await supabaseAdmin.from("profiles").update({ tier: profileTierForPaidPrice(priceId) }).eq("id", userId);
  }
  return { priceId, active: stillActive };
}

const CheckoutInput = z.object({
  priceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  quantity: z.number().int().min(1).max(5000).optional(),
  discountCode: z.string().min(1).max(40).optional(),
  customerEmail: z.string().email().optional(),
  userId: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
  eventId: z.string().min(1).max(120).optional(),
  projectId: z.string().uuid().optional(),
  returnUrl: z.string().url(),
  environment: z.enum(["sandbox", "live"]),
});

// Maps Stripe price lookup_keys to per-event addon keys stored in event_addons.
// Account-unlock addons (guest import, thank-you cards, AI credits) are NOT here —
// those flip flags on profiles and apply to the whole account.
const PER_EVENT_ADDON_PRICE_TO_KEY: Record<string, string> = {
  event_branding_removal: "branding_removal",
  event_photo_wall: "photo_wall",
};
// Per-event addons that allow MULTIPLE purchases per event. Each purchase
// becomes its own row, keyed by session id, so the standard "once per
// event" upsert doesn't dedupe them away. Empty today — no current
// per-event addon supports multi-buy — but the plumbing stays generic
// for the next one that does.
const PER_EVENT_ADDON_ALLOW_MULTIPLE = new Set<string>();

// Read optional bearer token from the incoming request and resolve it to a
// Supabase user id. If present, the server-verified id REPLACES any userId in
// the request body — this prevents a malicious caller from minting a checkout
// session whose post-payment entitlement grant lands on someone else's account.
// We do NOT require auth here, because anonymous gift / donation flows pass no
// userId at all and should still work.
async function resolveAuthUserId(): Promise<string | undefined> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const header = request?.headers?.get("authorization");
    if (!header?.startsWith("Bearer ")) return undefined;
    const token = header.slice(7).trim();
    if (!token) return undefined;
    const supa = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supa.auth.getClaims(token);
    if (error || !data?.claims?.sub) return undefined;
    return String(data.claims.sub);
  } catch {
    return undefined;
  }
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(CheckoutInput, data, "payments.functions.ts:245"))
  .handler(async ({ data }): Promise<CheckoutSessionResult> => {
    try {
      // Demo host: force sandbox regardless of what the client asked for, so a
      // crafted request can never reach the live Stripe account.
      const { resolveDemoSafeStripeEnv } = await import("@/lib/demo-mode.server");
      const safeEnv = await resolveDemoSafeStripeEnv(data.environment as StripeEnv);
      const stripe = createStripeClient(safeEnv);


      // Retired 2026-07-26 — co-host editor seats granted no real permission
      // (no collaborator system exists for events), and the AI invite art
      // addon's purchase flag was never checked by the real AI art gate
      // (events.$eventId.tsx's generateAi(), tier-only: Whisper+). Both were
      // pure vaporware. pm_studio ("Team", $12/mo) delivered nothing beyond
      // pm_solo ($5/mo) — seat caps come from event tier not PM SKU, no
      // project/storage limits exist, and "client folders" never shipped.
      // custom_domain_monthly ("Branded subdomain", $4/mo) retired 2026-07-27
      // — the advertised subdomain routing doesn't exist yet (needs wildcard
      // DNS), the panel was unreachable behind an Atelier-only gate anyway,
      // and Atelier users already got the existing free path-based /e/slug
      // URL without purchasing. Block checkout server-side too, not just in
      // the UI, so a stale link or direct call can't still charge for any of
      // these.
      const RETIRED_PRICE_IDS = new Set([
        "ai_art_credits_addon",
        "event_cohost_seat",
        "pm_studio_monthly",
        "pm_studio_yearly",
        "custom_domain_monthly",
      ]);
      if (RETIRED_PRICE_IDS.has(data.priceId)) {
        throw new Error("This add-on is no longer available.");
      }

      // C-3 fix: if a session is attached, force userId to the verified subject.
      const verifiedUserId = await resolveAuthUserId();
      const effectiveUserId = verifiedUserId ?? data.userId;
      // Reassign through a local copy so downstream code sees the trusted value.
      data = { ...data, userId: effectiveUserId };

      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const stripePrice = prices.data[0];
      const isRecurring = stripePrice.type === "recurring";

      let discounts: Array<{ coupon: string }> | undefined;
      if (data.discountCode) {
        // Discount codes now work on plans AND add-ons / per-event purchases.
        // Validate via SECURITY DEFINER RPC — never read discount_codes rows
        // directly from the anon client (that path is locked to owners now).
        const tierId = tierForPriceId(data.priceId);
        // "*" tells the RPC to skip tier-scope enforcement for add-ons/per-event
        const rpcTier = tierId ?? "*";
        const { data: verdictRaw, error } = await publicClient().rpc(
          "validate_discount_code",
          effectiveUserId
            ? { p_code: data.discountCode.trim(), p_tier_id: rpcTier, p_user_id: effectiveUserId }
            : { p_code: data.discountCode.trim(), p_tier_id: rpcTier },
        );


        if (error) throw new Error(error.message);
        const verdict = (verdictRaw ?? {}) as {
          valid?: boolean;
          reason?: string;
          percent_off?: number | null;
          amount_off?: number | string | null;
          tier_id?: string | null;
        };
        if (!verdict.valid) throw new Error(verdict.reason || "Discount code not found");
        discounts = [
          {
            coupon: await resolveCouponForDiscount(stripe, {
              code: data.discountCode.trim().toUpperCase(),
              percent_off: verdict.percent_off ?? null,
              amount_off: verdict.amount_off != null ? Number(verdict.amount_off) : null,
              tier_id: verdict.tier_id ?? null,
            }),
          },
        ];
      }


      // Packages & Menus add-on automatic discount — Atelier only.
      // Postcard/Whisper/Host pay full price ($14 one-time / $9 mo / $79 yr).
      // Atelier: 20% off one-time, 25% off monthly/yearly.
      const AI_PACKAGES_PRICE_IDS = new Set([
        "ai_packages_event",
        "ai_packages_monthly",
        "ai_packages_yearly",
      ]);
      if (!discounts && data.userId && AI_PACKAGES_PRICE_IDS.has(data.priceId)) {
        // C-4 fix: read the live subscription row, not profiles.tier.
        // profiles.tier can lag the webhook on downgrade, granting Atelier
        // discounts to users who no longer have an active Atelier sub.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: subs } = await supabaseAdmin
          .from("subscriptions")
          .select("price_id,status,current_period_end")
          .eq("user_id", data.userId)
          .in("status", ["active", "trialing"])
          .limit(20);
        const now = Date.now();
        const hasActiveAtelier = (subs ?? []).some((s: { price_id: string | null; current_period_end: string | null }) => {
          const pid = (s.price_id ?? "").toLowerCase();
          const periodOk = !s.current_period_end || new Date(s.current_period_end).getTime() > now;
          return periodOk && (pid.startsWith("atelier_") || pid === ATELIER_TRIAL_PRICE_ID || pid.startsWith("studio_collective"));
        });

        let percentOff = 0;
        if (hasActiveAtelier) {
          percentOff = data.priceId === "ai_packages_event" ? 20 : 25;
        }

        if (percentOff > 0) {
          const couponId = `ai_packages_atelier_${percentOff}`;
          try {
            await stripe.coupons.retrieve(couponId);
          } catch {
            await stripe.coupons.create({
              id: couponId,
              percent_off: percentOff,
              duration: "forever",
              name: `Packages & Menus — ${percentOff}% off (Atelier)`,
            });
          }
          discounts = [{ coupon: couponId }];
        }
      }

      // Host-minimum add-ons. Guest import and the thank-you cards studio are
      // only purchasable from Host up (they are included free on Atelier).
      // The pricing UI hides the buttons below Host, but the checkout call is
      // the real boundary: a stale link could otherwise charge a Postcard or
      // Whisper account for an add-on whose feature gate would still refuse.
      const HOST_MIN_ADDONS = new Set(["guest_import_addon", "thank_you_cards_addon"]);
      if (HOST_MIN_ADDONS.has(data.priceId)) {
        if (!data.userId) {
          throw new Error("Sign in to buy this add-on.");
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [{ data: prof }, { data: subRows }] = await Promise.all([
          supabaseAdmin.from("profiles").select("tier").eq("id", data.userId).maybeSingle(),
          supabaseAdmin
            .from("subscriptions")
            .select("price_id,status,current_period_end")
            .eq("user_id", data.userId)
            .in("status", ["active", "trialing", "past_due"])
            .limit(20),
        ]);
        const nowMs = Date.now();
        const activePriceIds = (subRows ?? [])
          .filter((s: { current_period_end: string | null }) =>
            !s.current_period_end || new Date(s.current_period_end).getTime() > nowMs)
          .map((s: { price_id: string | null }) => (s.price_id ?? "").toLowerCase());
        const raw = [...activePriceIds, String((prof as { tier?: string } | null)?.tier ?? "").toLowerCase()].join(" ");
        const hasHostOrAbove = raw.includes("host") || raw.includes("atelier") || raw.includes("studio_collective");
        if (!hasHostOrAbove) {
          throw new Error(
            "This add-on is available on Host and Atelier. Upgrade your plan first, then add it.",
          );
        }
      }


      const customerId = data.customerEmail || data.userId
        ? await resolveOrCreateCustomer(stripe, {
            email: data.customerEmail,
            userId: data.userId,
          })
        : undefined;

      // Monthly plans are billed one month at a time. No minimum commitment.
      const lineItems: Array<{ price: string; quantity: number }> = [
        { price: stripePrice.id, quantity: data.quantity ?? 1 },
      ];
      // Flat processing fee — a one-time line item even on a subscription
      // session, so it bills once on the first invoice and never recurs.
      const feeLineItem = await getProcessingFeeLineItem(stripe);
      if (feeLineItem) lineItems.push(feeLineItem);
      const subscriptionData: Record<string, unknown> | undefined = data.userId
        ? { metadata: { userId: data.userId } }
        : undefined;

      const session = await createCheckoutSessionWithTax(
        stripe,
        {
          line_items: lineItems,
          mode: isRecurring ? "subscription" : "payment",
          ui_mode: "embedded_page",
          return_url: data.returnUrl,
          redirect_on_completion: "always",
          ...(discounts && { discounts }),
          ...(customerId && { customer: customerId }),
          ...((data.userId || data.eventId || data.projectId) && {
            metadata: {
              ...(data.userId && { userId: data.userId }),
              ...(data.eventId && { eventId: data.eventId }),
              ...(data.projectId && { projectId: data.projectId }),
              ...(data.discountCode && { discountCode: data.discountCode.trim().toUpperCase() }),
            },
          }),
          ...(isRecurring && subscriptionData && { subscription_data: subscriptionData }),
        },
        {
          // Stripe Tax only collects tax where there is an active registration,
          // so this calculates zero tax until registrations are added.
          automatic_tax: { enabled: true },
          // Digital product, so a billing address is all the tax calc needs.
          billing_address_collection: "required",
          // Only valid when `customer` is set. Uses the address collected in
          // this session for the tax calculation.
          ...(customerId && { customer_update: { address: "auto" as const } }),
        },
      );

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const confirmCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({
      sessionId: z.string().min(8).max(300),
      environment: z.enum(["sandbox", "live"]),
    }), data, "payments.functions.ts:471"),
  )
  .handler(async ({ data, context }): Promise<ConfirmCheckoutResult> => {
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId, {
        expand: ["subscription", "line_items.data.price"],
      });
      if (session.payment_status !== "paid" && session.status !== "complete") {
        return { status: "processing" };
      }

      const sessionUserId = session.metadata?.userId;
      if (sessionUserId && sessionUserId !== context.userId) return { error: "Checkout belongs to another account" };

      if (session.mode === "subscription" && session.subscription) {
        const subscription = typeof session.subscription === "string"
          ? await stripe.subscriptions.retrieve(session.subscription)
          : session.subscription;

        // Apply the prepaid-month customer credit exactly once. The credit
        // covers the day-30 invoice so the next real charge happens on day 60.
        const meta = subscription.metadata ?? {};
        const creditAmount = Number(meta.monthly_prepaid_credit_amount ?? 0);
        const creditCurrency = meta.monthly_prepaid_credit_currency;
        const alreadyApplied = meta.monthly_prepaid_credit_applied === "1";
        const customerId = typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer?.id;
        if (!alreadyApplied && creditAmount > 0 && creditCurrency && customerId) {
          try {
            await stripe.customers.createBalanceTransaction(customerId, {
              amount: -creditAmount,
              currency: creditCurrency,
              description: "Prepaid second month (2-month minimum)",
            });
            await stripe.subscriptions.update(subscription.id, {
              metadata: { ...meta, monthly_prepaid_credit_applied: "1" },
            });
          } catch (err) {
            console.warn("[payments] prepaid credit failed", err);
          }
        }

        const synced = await syncStripeSubscriptionForUser(stripe, subscription, data.environment as StripeEnv, context.userId);
        return { status: synced.active ? "active" : "processing", priceId: synced.priceId };
      }

      if (session.mode === "payment") {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
        const lookupKeys = lineItems.data.map((li) => li.price?.lookup_key).filter((key): key is string => !!key);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (lookupKeys.includes("whisper_onetime") || lookupKeys.includes("whisper_onetime_v3")) {
          const { data: profile } = await supabaseAdmin.from("profiles").select("tier").eq("id", context.userId).maybeSingle();
          const current = ((profile as { tier?: string } | null)?.tier ?? "").toLowerCase();
          if (current !== "host" && current !== "atelier") {
            await supabaseAdmin.from("profiles").update({ tier: "whisper" }).eq("id", context.userId);
          }
        }
        if (lookupKeys.includes("guest_import_addon")) {
          await supabaseAdmin.from("profiles").update({ guest_import_enabled: true }).eq("id", context.userId);
        }
        if (lookupKeys.includes("thank_you_cards_addon")) {
          await supabaseAdmin.from("profiles").update({ thank_you_cards_enabled: true }).eq("id", context.userId);
        }
        if (lookupKeys.includes("converter_addon")) {
          await supabaseAdmin.from("profiles").update({ converter_enabled: true }).eq("id", context.userId);
        }
        if (lookupKeys.includes("sms_pack_addon")) {
          await supabaseAdmin.from("profiles").update({ sms_pack_enabled: true }).eq("id", context.userId);
        }

        // One-time single-event passes (Whisper $19, Host $49, Atelier $99). Idempotent
        // via unique stripe_session_id column — matches the webhook write.
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
            : (session.payment_intent as { id?: string } | null)?.id ?? null;
          await supabaseAdmin.from("one_time_passes").upsert(
            {
              user_id: context.userId,
              tier,
              stripe_session_id: session.id,
              stripe_payment_intent_id: paymentIntentId,
              price_id: key,
              environment: data.environment,
              purchased_at: purchasedAt.toISOString(),
              expires_at: expiresAt.toISOString(),
              ai_generations_cap: tier === "atelier" ? 150 : null,
            },
            { onConflict: "stripe_session_id" },
          );
        }

        // AI Packages & Menus — one-time per event/project unlock.
        // Idempotent: skip if the same scope/user/target already exists,
        // so duplicate confirmations don't create duplicate unlock rows.
        if (lookupKeys.includes("ai_packages_event")) {
          const eventIdMeta = (session.metadata as Record<string, string> | undefined)?.eventId;
          const projectIdMeta = (session.metadata as Record<string, string> | undefined)?.projectId;
          const scope = projectIdMeta ? "project_onetime" : "event_onetime";
          let dupQuery = supabaseAdmin
            .from("ai_package_entitlements")
            .select("id")
            .eq("user_id", context.userId)
            .eq("scope", scope)
            .eq("environment", data.environment);
          if (projectIdMeta) dupQuery = dupQuery.eq("project_id", projectIdMeta);
          else if (eventIdMeta) dupQuery = dupQuery.eq("event_id", eventIdMeta);
          const { data: existingEnt } = await dupQuery.maybeSingle();
          if (!existingEnt) {
            await supabaseAdmin.from("ai_package_entitlements").insert({
              user_id: context.userId,
              scope,
              event_id: eventIdMeta ?? null,
              project_id: projectIdMeta ?? null,
              environment: data.environment,
              stripe_session_id: session.id,
              active: true,
            });
          }
        }

        // Per-event addons: when this session was opened with an eventId in metadata,
        // record the purchase so the relevant per-event feature unlocks immediately.
        const eventId = (session.metadata as Record<string, string> | undefined)?.eventId;
        if (eventId) {
          for (const key of lookupKeys) {
            const addonKey = PER_EVENT_ADDON_PRICE_TO_KEY[key];
            if (!addonKey) continue;
            const allowMultiple = PER_EVENT_ADDON_ALLOW_MULTIPLE.has(addonKey);
            // For multi-buy addons (e.g. extra co-host seats) we store each
            // purchase as its own row by suffixing the session id, so the
            // (event_id, addon_key, environment) unique constraint doesn't
            // collapse repeat purchases. Single-buy addons keep the bare key
            // so they remain idempotent — one row per event.
            const storedKey = allowMultiple ? `${addonKey}:${session.id}` : addonKey;
            await supabaseAdmin.from("event_addons").upsert(
              {
                event_id: eventId,
                user_id: context.userId,
                addon_key: storedKey,
                stripe_checkout_session_id: session.id,
                environment: data.environment,
                metadata: { price_id: key, base_key: addonKey, allow_multiple: allowMultiple },
              },
              { onConflict: "event_id,addon_key,environment" },
            );
          }
        }
        return { status: "active", priceId: lookupKeys[0] };
      }

      return { status: "processing" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const startAtelierTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({
      environment: z.enum(["sandbox", "live"]).optional(),
      deviceFingerprint: z.string().min(8).max(1000).optional(),
    }), data ?? {}, "payments.functions.ts:644"),
  )
  .handler(async ({ data, context }): Promise<TrialResult> => {
    const env = (data.environment ?? "live") as StripeEnv;
    const email = String((context.claims as any)?.email ?? "");
    if (!email.includes("@")) return { error: "A verified email is required to start the Atelier trial." };
    const { normalized, domain } = normalizeTrialEmail(email);
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const forwardedFor = getRequestHeader("cf-connecting-ip")
      ?? getRequestHeader("x-forwarded-for")
      ?? getRequestHeader("x-real-ip")
      ?? "";
    const ip = forwardedFor.split(",")[0]?.trim() ?? "";
    const userAgent = getRequestHeader("user-agent") ?? "";
    const emailHash = await sha256Hex(`email:${normalized}`);
    const ipHash = ip ? await sha256Hex(`ip:${ip}`) : "";
    const deviceHash = data.deviceFingerprint ? await sha256Hex(`device:${data.deviceFingerprint}`) : "";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: result, error } = await supabaseAdmin.rpc("claim_atelier_trial", {
      _user_id: context.userId,
      _email_hash: emailHash,
      _email_domain: domain,
      _ip_hash: ipHash,
      _device_hash: deviceHash,
      _user_agent: userAgent,
      _environment: env,
    });
    if (error) return { error: error.message };
    const payload = (result ?? {}) as any;
    if (payload.error) return { error: String(payload.error) };
    if (payload.status === "active") {
      return {
        status: "active",
        priceId: ATELIER_TRIAL_PRICE_ID,
        endsAt: new Date(payload.endsAt).toISOString(),
        guestLimit: Number(payload.guestLimit ?? ATELIER_TRIAL_GUEST_LIMIT),
      };
    }
    return { error: "Could not start the Atelier trial. Please try again." };
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({
      returnUrl: z.string().url().optional(),
      environment: z.enum(["sandbox", "live"]),
    }), data, "payments.functions.ts:692"),
  )
  .handler(async ({ data, context }): Promise<PortalSessionResult> => {
    const { supabase, userId } = context;

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, product_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError || !sub?.stripe_customer_id) {
      return { error: "You don't have a paid plan to manage right now." };
    }

    // Comped/granted plans have synthetic ids with nothing behind them in
    // Stripe. Opening the portal would fail with a raw "No such customer"
    // error, so answer in plain language instead of calling Stripe at all.
    const { isGrantedPlan, GRANTED_PLAN_NOTICE } = await import("@/lib/granted-plan");
    if (isGrantedPlan(sub as any)) return { error: GRANTED_PLAN_NOTICE };

    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id as string,
        ...(data.returnUrl && { return_url: data.returnUrl }),
      });
      return { url: portal.url };
    } catch (error) {
      // Never surface a raw Stripe error (type codes, request ids) to a
      // customer. Log the detail, return plain language.
      console.error("Billing portal failed", getStripeErrorMessage(error));
      return {
        error:
          "We couldn't open the billing page for your account. Nothing has changed on your plan. Please contact us and we'll sort it out.",
      };
    }
  });

// Schedule cancellation at period end (does NOT revoke access immediately).
export const cancelSubscriptionAtPeriodEnd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({ environment: z.enum(["sandbox", "live"]) }), data, "payments.functions.ts:740"),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) return { error: "No subscription found" };
    // Granted plans have no Stripe subscription to cancel.
    if ((sub.stripe_subscription_id as string).startsWith("manual_")) {
      const { GRANTED_PLAN_NOTICE } = await import("@/lib/granted-plan");
      return { error: GRANTED_PLAN_NOTICE };
    }
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      await stripe.subscriptions.update(sub.stripe_subscription_id as string, {
        cancel_at_period_end: true,
      });
      return { ok: true as const };
    } catch (error) {
      console.error("Cancel at period end failed", getStripeErrorMessage(error));
      return { error: "We couldn't update your plan just now. Nothing has changed. Please try again or contact us." };
    }
  });

// Resume a previously canceled subscription (still within period)
export const resumeSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({ environment: z.enum(["sandbox", "live"]) }), data, "payments.functions.ts:774"),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) return { error: "No subscription found" };
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      await stripe.subscriptions.update(sub.stripe_subscription_id as string, {
        cancel_at_period_end: false,
      });
      return { ok: true as const };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

// Change plan: prorated immediate switch using Stripe price lookup_key
export const changeSubscriptionPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({
      newPriceId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
      environment: z.enum(["sandbox", "live"]),
    }), data, "payments.functions.ts:802"),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.stripe_subscription_id) return { error: "No subscription found" };
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const prices = await stripe.prices.list({ lookup_keys: [data.newPriceId] });
      if (!prices.data.length) return { error: "New price not found" };
      const newPrice = prices.data[0];

      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id as string);
      const itemId = stripeSub.items.data[0]?.id;
      if (!itemId) return { error: "No subscription item to update" };

      await stripe.subscriptions.update(sub.stripe_subscription_id as string, {
        items: [{ id: itemId, price: newPrice.id }],
        proration_behavior: "create_prorations",
        cancel_at_period_end: false,
      });
      return { ok: true as const };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

// Save notification preferences on user's profile
export const updateMyNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({
      product_updates: z.boolean(),
      event_reminders: z.boolean(),
      rfq_bids: z.boolean(),
      marketing: z.boolean(),
      join_requests_email: z.boolean().optional(),
      join_requests_inapp: z.boolean().optional(),
      join_requests_sms: z.boolean().optional(),
    }), data, "payments.functions.ts:843"),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ notification_prefs: data as any })
      .eq("id", userId);
    if (error) return { error: error.message };
    return { ok: true as const };
  });

// Update display name and avatar URL
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({
      display_name: z.string().min(1).max(80).optional(),
      avatar_url: z.string().url().max(500).optional().or(z.literal("")),
    }), data, "payments.functions.ts:867"),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: any = {};
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.avatar_url !== undefined) patch.avatar_url = data.avatar_url || null;
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) return { error: error.message };
    return { ok: true as const };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, tier, notification_prefs")
      .eq("id", userId)
      .maybeSingle();
    return {
      email: context.claims?.email ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: (profile as any)?.avatar_url ?? null,
      tier: profile?.tier ?? "free",
      notification_prefs: {
        product_updates: true,
        event_reminders: true,
        rfq_bids: true,
        marketing: false,
        join_requests_email: true,
        join_requests_inapp: true,
        join_requests_sms: false,
        ...(((profile as any)?.notification_prefs ?? {}) as Record<string, boolean>),
      } as {
        product_updates: boolean;
        event_reminders: boolean;
        rfq_bids: boolean;
        marketing: boolean;
        join_requests_email: boolean;
        join_requests_inapp: boolean;
        join_requests_sms: boolean;
      },
    };
  });

// Returns the per-event addons purchased for a single event. Scoped to the
// signed-in user via RLS; owners/admins also see addons on any event.
export const getEventAddons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({
      eventId: z.string().min(1).max(120),
      environment: z.enum(["sandbox", "live"]),
    }), data, "payments.functions.ts:922"),
  )
  .handler(async ({ data, context }): Promise<{ addonKeys: string[] } | { error: string }> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("event_addons")
      .select("addon_key")
      .eq("event_id", data.eventId)
      .eq("environment", data.environment);
    if (error) return { error: error.message };
    // Strip the ":session_id" suffix on multi-buy keys so the UI can match
    // on the canonical base key (e.g. "cohost_seat") regardless of how many
    // copies were purchased.
    return { addonKeys: (rows ?? []).map((r) => String(r.addon_key ?? "").split(":")[0]).filter(Boolean) };
  });
