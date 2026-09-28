/**
 * Selections (cart) catalog.
 *
 * Maps every SKU that can be added to Selections to its Stripe lookup_key,
 * kind, and quantity rules. Kept small and typed so the drawer, add-to-cart
 * buttons, and checkout server function all read from one truth.
 *
 * v1 covers one-time add-ons only. Subscriptions still use the single-item
 * checkout on /pricing (one plan per session, no bundling).
 */

export type CartItemKind = "addon_event" | "addon_account" | "ai_package";

export type CartCatalogEntry = {
  /** Stable identifier we store in cart_items.sku. Same as Stripe lookup_key today. */
  sku: string;
  /** Stripe lookup_key resolved server-side. */
  stripeLookupKey: string;
  /** Display name in the drawer. */
  name: string;
  /** One-line description in the drawer. */
  blurb: string;
  /** Fixed unit price in cents (display + validation only; source of truth is Stripe). */
  unitAmountCents: number;
  currency: "usd";
  kind: CartItemKind;
  /** True when the SKU must be attached to a specific event. */
  requiresEvent?: boolean;
  /** True when the SKU may optionally target a project (AI packages). */
  supportsProject?: boolean;
  /** True when quantity > 1 is allowed. */
  allowQuantity?: boolean;
  /** Max quantity per line. */
  maxQuantity?: number;
};

export const CART_CATALOG: Record<string, CartCatalogEntry> = {
  event_branding_removal: {
    sku: "event_branding_removal",
    stripeLookupKey: "event_branding_removal",
    name: "Remove branding",
    blurb: "Hide the watermark and Powered-by footer on this event.",
    unitAmountCents: 300,
    currency: "usd",
    kind: "addon_event",
    requiresEvent: true,
  },
  event_photo_wall: {
    sku: "event_photo_wall",
    stripeLookupKey: "event_photo_wall",
    name: "Photo Wall live gallery",
    blurb: "QR-code guest uploads with an auto-refreshing big-screen slideshow.",
    unitAmountCents: 900,
    currency: "usd",
    kind: "addon_event",
    requiresEvent: true,
  },
  // event_cohost_seat removed 2026-07-26 — purchasing a seat granted no
  // actual co-editing permission; there is no collaborator/seat system yet.
  guest_import_addon: {
    sku: "guest_import_addon",
    stripeLookupKey: "guest_import_addon",
    name: "Bulk guest list import",
    blurb: "Excel template import — attaches to your account.",
    unitAmountCents: 500,
    currency: "usd",
    kind: "addon_account",
  },
  thank_you_cards_addon: {
    sku: "thank_you_cards_addon",
    stripeLookupKey: "thank_you_cards_addon",
    name: "Thank-you cards studio",
    blurb: "Animated GIFs, scheduled sends, and free print-at-home files.",
    unitAmountCents: 700,
    currency: "usd",
    kind: "addon_account",
  },
  converter_addon: {
    sku: "converter_addon",
    stripeLookupKey: "converter_addon",
    name: "Media Converter unlock",
    blurb: "Convert & compress images with shareable CDN URLs.",
    unitAmountCents: 500,
    currency: "usd",
    kind: "addon_account",
  },
  ai_packages_event: {
    sku: "ai_packages_event",
    stripeLookupKey: "ai_packages_event",
    name: "AI Packages & Menus (one event)",
    blurb: "One-time unlock for AI-generated packages and menus on this event.",
    unitAmountCents: 1400,
    currency: "usd",
    kind: "ai_package",
    requiresEvent: true,
    supportsProject: true,
  },
};

export function getCatalogEntry(sku: string): CartCatalogEntry | undefined {
  return CART_CATALOG[sku];
}

export function formatMoney(cents: number, currency: string = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
