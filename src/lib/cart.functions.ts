/**
 * Selections (cart) server functions.
 *
 * v1 scope: one-time add-ons only. Subscriptions still use single-item
 * checkout on /pricing (one plan per session, no bundling). This keeps
 * fulfilment identical to the existing confirmCheckoutSession payment path.
 *
 * Rules enforced server-side:
 *   - At most one open cart per (user, environment).
 *   - Every per-event line item in one cart must target the SAME event.
 *   - Quantities honored only for SKUs whose catalog entry sets allowQuantity.
 */

import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
  getProcessingFeeLineItem,
} from "@/lib/stripe.server";
import { CART_CATALOG, type CartCatalogEntry } from "@/lib/cart-catalog";

type CartRow = {
  id: string;
  user_id: string;
  environment: StripeEnv;
  status: "open" | "checking_out" | "completed" | "abandoned";
  promo_code: string | null;
  stripe_session_id: string | null;
  created_at: string;
  updated_at: string;
};

type JsonScalar = string | number | boolean | null;

type CartItemRow = {
  id: string;
  cart_id: string;
  sku: string;
  kind: "subscription" | "addon_event" | "addon_account" | "ai_package";
  event_id: string | null;
  project_id: string | null;
  quantity: number;
  unit_amount_cents: number | null;
  currency: string;
  metadata: Record<string, JsonScalar>;
  created_at: string;
};

export type CartSnapshot = {
  cart: CartRow;
  items: (CartItemRow & { catalog: CartCatalogEntry | null })[];
  subtotal_cents: number;
};

async function loadOrCreateOpenCart(
  supabase: any,
  userId: string,
  env: StripeEnv,
): Promise<CartRow> {
  const { data: existing } = await supabase
    .from("carts")
    .select("*")
    .eq("user_id", userId)
    .eq("environment", env)
    .eq("status", "open")
    .maybeSingle();
  if (existing) return existing as CartRow;
  const { data: created, error } = await supabase
    .from("carts")
    .insert({ user_id: userId, environment: env })
    .select("*")
    .single();
  if (error) {
    // Race: another concurrent request created the open cart. Re-fetch it.
    if ((error as any).code === "23505") {
      const { data: retry } = await supabase
        .from("carts")
        .select("*")
        .eq("user_id", userId)
        .eq("environment", env)
        .eq("status", "open")
        .maybeSingle();
      if (retry) return retry as CartRow;
    }
    throw new Error(error.message);
  }
  return created as CartRow;
}

async function snapshot(supabase: any, cart: CartRow): Promise<CartSnapshot> {
  const { data: items } = await supabase
    .from("cart_items")
    .select("*")
    .eq("cart_id", cart.id)
    .order("created_at", { ascending: true });
  const rows = (items ?? []) as CartItemRow[];
  const enriched = rows.map((r) => ({ ...r, catalog: CART_CATALOG[r.sku] ?? null }));
  const subtotal = enriched.reduce(
    (sum, r) => sum + (r.unit_amount_cents ?? 0) * r.quantity,
    0,
  );
  return { cart, items: enriched, subtotal_cents: subtotal };
}

const EnvInput = z.object({
  environment: z.enum(["sandbox", "live"]),
});

export const getCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(EnvInput, data, "cart.functions.ts:114"))
  .handler(async ({ data, context }): Promise<CartSnapshot> => {
    const cart = await loadOrCreateOpenCart(context.supabase, context.userId, data.environment);
    return snapshot(context.supabase, cart);
  });

const AddItemInput = z.object({
  sku: z.string().min(1).max(80),
  quantity: z.number().int().min(1).max(5000).optional(),
  eventId: z.string().min(1).max(120).optional(),
  projectId: z.string().uuid().optional(),
  environment: z.enum(["sandbox", "live"]),
});

export const addToCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(AddItemInput, data, "cart.functions.ts:130"))
  .handler(async ({ data, context }): Promise<CartSnapshot> => {
    const entry = CART_CATALOG[data.sku];
    if (!entry) throw new Error(`Unknown SKU: ${data.sku}`);
    if (entry.requiresEvent && !data.eventId && !(entry.supportsProject && data.projectId)) {
      throw new Error(`${entry.name} must be added to a specific event.`);
    }
    const qty = entry.allowQuantity ? Math.min(data.quantity ?? 1, entry.maxQuantity ?? 20) : 1;

    const cart = await loadOrCreateOpenCart(context.supabase, context.userId, data.environment);

    // Enforce: all per-event items in one cart target the same event.
    if (entry.requiresEvent && data.eventId) {
      const { data: existing } = await context.supabase
        .from("cart_items")
        .select("event_id")
        .eq("cart_id", cart.id)
        .not("event_id", "is", null)
        .limit(50);
      const other = (existing ?? []).find(
        (r: { event_id: string | null }) => r.event_id && r.event_id !== data.eventId,
      );
      if (other) {
        throw new Error(
          "Selections already has items for another event. Check out or remove them first.",
        );
      }
    }

    // Upsert on (cart_id, sku, event_id, project_id): re-adding bumps quantity for stackables,
    // otherwise leaves quantity at 1.
    const { data: dupe } = await context.supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("cart_id", cart.id)
      .eq("sku", data.sku)
      .eq("event_id", (data.eventId ?? null) as any)
      .eq("project_id", (data.projectId ?? null) as any)
      .maybeSingle();

    if (dupe) {
      const nextQty = entry.allowQuantity
        ? Math.min((dupe.quantity ?? 1) + qty, entry.maxQuantity ?? 20)
        : 1;
      await context.supabase
        .from("cart_items")
        .update({ quantity: nextQty })
        .eq("id", dupe.id);
    } else {
      const { error } = await context.supabase.from("cart_items").insert({
        cart_id: cart.id,
        sku: entry.sku,
        kind: entry.kind,
        event_id: data.eventId ?? null,
        project_id: data.projectId ?? null,
        quantity: qty,
        unit_amount_cents: entry.unitAmountCents,
        currency: entry.currency,
        metadata: {},
      });
      if (error) throw new Error(error.message);
    }

    return snapshot(context.supabase, cart);
  });

const UpdateItemInput = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(5000),
  environment: z.enum(["sandbox", "live"]),
});

export const updateCartItemQuantity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(UpdateItemInput, data, "cart.functions.ts:204"))
  .handler(async ({ data, context }): Promise<CartSnapshot> => {
    const { data: item } = await context.supabase
      .from("cart_items")
      .select("id, sku, cart_id")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) throw new Error("Item not found");
    const entry = CART_CATALOG[item.sku];
    if (!entry?.allowQuantity) throw new Error("This item is quantity 1.");
    const qty = Math.min(data.quantity, entry.maxQuantity ?? 20);
    await context.supabase.from("cart_items").update({ quantity: qty }).eq("id", data.itemId);
    const cart = await loadOrCreateOpenCart(context.supabase, context.userId, data.environment);
    return snapshot(context.supabase, cart);
  });

const RemoveItemInput = z.object({
  itemId: z.string().uuid(),
  environment: z.enum(["sandbox", "live"]),
});

export const removeCartItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(RemoveItemInput, data, "cart.functions.ts:227"))
  .handler(async ({ data, context }): Promise<CartSnapshot> => {
    await context.supabase.from("cart_items").delete().eq("id", data.itemId);
    const cart = await loadOrCreateOpenCart(context.supabase, context.userId, data.environment);
    return snapshot(context.supabase, cart);
  });

export const clearCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(EnvInput, data, "cart.functions.ts:236"))
  .handler(async ({ data, context }): Promise<CartSnapshot> => {
    const cart = await loadOrCreateOpenCart(context.supabase, context.userId, data.environment);
    await context.supabase.from("cart_items").delete().eq("cart_id", cart.id);
    return snapshot(context.supabase, cart);
  });

/**
 * Build one Stripe Checkout session from the current open cart.
 *
 * v1: payment mode only (all one-time items). Emits line_items in the same
 * shape confirmCheckoutSession already understands — it reads
 * session.metadata.eventId + iterates lookupKeys to fan out per-event and
 * account-unlock fulfilment. No webhook changes required for v1.
 */
const CheckoutCartInput = z.object({
  returnUrl: z.string().url(),
  customerEmail: z.string().email().optional(),
  environment: z.enum(["sandbox", "live"]),
});

type CartCheckoutResult = { clientSecret: string; sessionId: string } | { error: string };

export const createCartCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(CheckoutCartInput, data, "cart.functions.ts:261"))
  .handler(async ({ data, context }): Promise<CartCheckoutResult> => {
    try {
      const cart = await loadOrCreateOpenCart(context.supabase, context.userId, data.environment);
      const snap = await snapshot(context.supabase, cart);
      if (snap.items.length === 0) return { error: "Selections is empty." };

      // Resolve one common eventId / projectId for the session metadata.
      const eventIds = new Set(
        snap.items.map((i) => i.event_id).filter((v): v is string => !!v),
      );
      if (eventIds.size > 1) return { error: "Selections contains items for multiple events." };
      const projectIds = new Set(
        snap.items.map((i) => i.project_id).filter((v): v is string => !!v),
      );
      if (projectIds.size > 1) return { error: "Selections contains items for multiple projects." };
      const eventId = eventIds.size === 1 ? [...eventIds][0] : undefined;
      const projectId = projectIds.size === 1 ? [...projectIds][0] : undefined;

      const stripe = createStripeClient(data.environment as StripeEnv);

      // Resolve all Stripe prices in parallel.
      const uniqueLookupKeys = Array.from(
        new Set(
          snap.items.map((i) => CART_CATALOG[i.sku]?.stripeLookupKey).filter((k): k is string => !!k),
        ),
      );
      const priceResults = await Promise.all(
        uniqueLookupKeys.map((k) => stripe.prices.list({ lookup_keys: [k], limit: 1 })),
      );
      const lookupToPrice = new Map<string, string>();
      priceResults.forEach((res, idx) => {
        const key = uniqueLookupKeys[idx];
        const price = res.data[0];
        if (price) lookupToPrice.set(key, price.id);
      });

      const lineItems: Array<{ price: string; quantity: number }> = [];
      for (const item of snap.items) {
        const entry = CART_CATALOG[item.sku];
        if (!entry) return { error: `Unknown item in Selections: ${item.sku}` };
        const priceId = lookupToPrice.get(entry.stripeLookupKey);
        if (!priceId) return { error: `Price not found for ${entry.name}` };
        lineItems.push({ price: priceId, quantity: item.quantity });
      }
      // Flat processing fee — once per checkout, not per item.
      const feeLineItem = await getProcessingFeeLineItem(stripe);
      if (feeLineItem) lineItems.push(feeLineItem);

      // Resolve Stripe customer (same helper approach as single-item checkout).
      const email = data.customerEmail ?? (context.claims as any)?.email ?? undefined;
      let customerId: string | undefined;
      if (context.userId || email) {
        if (context.userId && !/^[a-zA-Z0-9_-]+$/.test(context.userId)) {
          return { error: "Invalid userId" };
        }
        if (context.userId) {
          const found = await stripe.customers.search({
            query: `metadata['userId']:'${context.userId}'`,
            limit: 1,
          });
          if (found.data.length) customerId = found.data[0].id;
        }
        if (!customerId && email) {
          const existing = await stripe.customers.list({ email, limit: 1 });
          if (existing.data.length) customerId = existing.data[0].id;
        }
        if (!customerId) {
          const created = await stripe.customers.create({
            ...(email && { email }),
            ...(context.userId && { metadata: { userId: context.userId } }),
          });
          customerId = created.id;
        }
      }

      const session = await stripe.checkout.sessions.create({
        line_items: lineItems,
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        redirect_on_completion: "always",
        ...(customerId && { customer: customerId }),
        metadata: {
          userId: context.userId,
          cartId: cart.id,
          ...(eventId && { eventId }),
          ...(projectId && { projectId }),
        },
        payment_intent_data: {
          description: `Selections (${snap.items.length} item${snap.items.length === 1 ? "" : "s"})`,
        },
      });

      // Mark the cart checking_out and stash the session id for the return page.
      await context.supabase
        .from("carts")
        .update({ status: "checking_out", stripe_session_id: session.id })
        .eq("id", cart.id);

      return { clientSecret: session.client_secret ?? "", sessionId: session.id };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

/**
 * Finalize the cart after the embedded checkout return. Marks the cart
 * completed and clears items. Fulfilment (event addons, account unlocks) is
 * still driven by confirmCheckoutSession's existing per-lookup_key logic.
 */
const CompleteCartInput = z.object({
  sessionId: z.string().min(8).max(300),
  environment: z.enum(["sandbox", "live"]),
});

export const completeCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(CompleteCartInput, data, "cart.functions.ts:379"))
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    const { data: cart } = await context.supabase
      .from("carts")
      .select("id, user_id")
      .eq("stripe_session_id", data.sessionId)
      .eq("user_id", context.userId)
      .eq("environment", data.environment)
      .maybeSingle();
    if (!cart) return { error: "Cart not found for this session." };
    await context.supabase.from("cart_items").delete().eq("cart_id", cart.id);
    await context.supabase.from("carts").update({ status: "completed" }).eq("id", cart.id);
    return { ok: true };
  });
