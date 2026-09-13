import Stripe from "stripe";
import { isDemoRequestSync, logDemoGuard } from "@/lib/demo-mode.server";

const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

const GATEWAY_STRIPE_BASE = "https://connector-gateway.lovable.dev/stripe";

export function getConnectionApiKey(env: StripeEnv): string {
  return env === "sandbox"
    ? getEnv("STRIPE_SANDBOX_API_KEY")
    : getEnv("STRIPE_LIVE_API_KEY");
}

/**
 * Every Stripe call in the app goes through here, so this is where the demo
 * boundary is enforced: a demo request (demo account signed in, demo cookie,
 * or demo host) can only ever reach the sandbox account, whatever `env` the
 * caller asked for. Individual call sites no longer need to remember this.
 */
export function createStripeClient(requestedEnv: StripeEnv): Stripe {
  let env = requestedEnv;
  if (requestedEnv === "live" && isDemoRequestSync()) {
    env = "sandbox";
    void logDemoGuard("payment", { requested: "live", forced: "sandbox" });
  }
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");

  return new Stripe(connectionApiKey, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient((input, init) => {
      const stripeUrl = input instanceof Request ? input.url : input.toString();
      const gatewayUrl = stripeUrl.replace("https://api.stripe.com", GATEWAY_STRIPE_BASE);
      return fetch(gatewayUrl, {
        ...init,
        headers: {
          ...Object.fromEntries(
            new Headers(
              init?.headers ?? (input instanceof Request ? input.headers : undefined),
            ).entries(),
          ),
          "X-Connection-Api-Key": connectionApiKey,
          "Lovable-API-Key": lovableApiKey,
        },
      });
    }),
  });
}

/**
 * Finds this user's Stripe Customer, or makes one, always carrying
 * `metadata.userId`. Every user-linked checkout must pass the returned id as
 * `customer`, because that is what later lookups (receipts, refunds, the
 * payments dashboard) search on. Passing `customer_email` instead creates a
 * Customer with no userId on it, which cannot be found again.
 */
export async function resolveOrCreateCustomer(
  stripe: Stripe,
  options: { email?: string | null; userId: string },
): Promise<string> {
  // userId is interpolated into a Stripe search query, so reject anything that
  // could break out of the quoted value.
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error("Invalid userId");
  const found = await stripe.customers.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 1,
  });
  if (found.data.length) return found.data[0]!.id;
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    const c = existing.data[0];
    if (c) {
      if (c.metadata?.["userId"] !== options.userId) {
        await stripe.customers.update(c.id, {
          metadata: { ...c.metadata, userId: options.userId },
        });
      }
      return c.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email ? { email: options.email } : {}),
    metadata: { userId: options.userId },
  });
  return created.id;
}

// Flat processing fee, charged once per checkout (first invoice only for
// subscriptions — Stripe never re-bills a one-time line item on renewal).
// Shared by every checkout-session creator so the fee stays consistent and
// only needs updating in one place if the amount or price ever changes.
export const PROCESSING_FEE_LOOKUP_KEY = "checkout_processing_fee_v1";

/**
 * Looks up the processing-fee Price and returns it as a checkout line item,
 * or null if the price isn't found — callers should proceed without the fee
 * rather than fail checkout entirely over a missing catalog entry.
 */
export async function getProcessingFeeLineItem(
  stripe: Stripe,
): Promise<{ price: string; quantity: number } | null> {
  try {
    // lookup_key is only guaranteed unique among ACTIVE prices — if this fee
    // is ever revised by minting a new price on the same key (the same
    // pattern that left the Whisper/Host catalog with orphaned duplicates),
    // an unfiltered list could resurface an archived predecessor.
    const prices = await stripe.prices.list({
      lookup_keys: [PROCESSING_FEE_LOOKUP_KEY],
      active: true,
      limit: 1,
    });
    const fee = prices.data[0];
    if (!fee) {
      console.error(`Processing fee price not found for lookup_key ${PROCESSING_FEE_LOOKUP_KEY}`);
      return null;
    }
    return { price: fee.id, quantity: 1 };
  } catch (error) {
    console.error("Failed to load processing fee price", error);
    return null;
  }
}

/**
 * Creates a Checkout Session with Stripe Tax turned on, and quietly retries
 * without it if the account is not set up for tax yet.
 *
 * Stripe Tax needs an account-level head office address before
 * `automatic_tax` is accepted. Without it, Stripe rejects the whole session
 * with a 400, which would block every checkout. So we try with tax first and
 * fall back to a plain session on tax configuration errors only. Once the head
 * office and registrations are set in the Stripe Dashboard, tax starts
 * calculating with no further code changes.
 */
export async function createCheckoutSessionWithTax(
  stripe: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
  taxParams: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session> {
  try {
    return await stripe.checkout.sessions.create({ ...params, ...taxParams });
  } catch (error) {
    const message = getStripeErrorMessage(error);
    const isTaxConfigError =
      /head office|automatic tax|automatic_tax|tax calculation|origin address/i.test(message);
    if (!isTaxConfigError) throw error;
    console.error("Stripe Tax not configured, creating session without tax:", message);
    return await stripe.checkout.sessions.create(params);
  }
}

export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as {
      message?: string;
      type?: string;
      code?: string;
      decline_code?: string;
      param?: string;
      requestId?: string;
      raw?: {
        message?: string;
        type?: string;
        code?: string;
        decline_code?: string;
        param?: string;
        requestId?: string;
      };
    };
    const message = e.raw?.message ?? e.message;
    if (message) {
      const details = [
        e.raw?.type ?? e.type,
        e.raw?.code ?? e.code,
        e.raw?.decline_code ?? e.decline_code,
        e.raw?.param ?? e.param,
        e.raw?.requestId ?? e.requestId,
      ].filter(Boolean);
      return details.length ? `${message} (${details.join(", ")})` : message;
    }
  }
  return "Stripe request failed";
}

export async function verifyWebhook(
  req: Request,
  env: StripeEnv,
): Promise<{ type: string; data: { object: any } }> {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  const secret =
    env === "sandbox"
      ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
      : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");

  if (!signature || !body) throw new Error("Missing signature or body");

  let timestamp: string | undefined;
  const v1Signatures: string[] = [];
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signatures.push(value);
  }
  if (!timestamp || v1Signatures.length === 0) throw new Error("Invalid signature format");

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) throw new Error("Webhook timestamp too old");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = Buffer.from(new Uint8Array(signed)).toString("hex");
  if (!v1Signatures.includes(expected)) throw new Error("Invalid webhook signature");

  return JSON.parse(body);
}
