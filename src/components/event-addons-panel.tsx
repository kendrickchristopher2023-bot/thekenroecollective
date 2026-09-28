import { toUserMessage } from "@/lib/user-error";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getEntitlements, type Entitlements } from "@/lib/entitlements-client";
import { getEventAddons } from "@/lib/payments.functions";
import { addToCart } from "@/lib/cart.functions";
import { CART_CATALOG } from "@/lib/cart-catalog";
import { emitSelectionsChanged } from "@/components/selections-drawer";
import { getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { usePreviewTier } from "@/lib/preview-tier";

/**
 * Per-event add-ons panel.
 *
 * Shows the same curated add-on catalog as the Pricing page, but scoped to
 * a single event: opens checkout in an inline modal (no page reload), passes
 * the eventId through to Stripe metadata, and reads back from event_addons
 * + the user's account entitlements to label each card accurately.
 */

type AddonCatalogEntry = {
  id: string;
  name: string;
  tag: string;
  price: string;
  blurb: string;
  /** Stripe lookup_key. */
  priceId: string;
  /** When true, purchase is recorded against this specific event. */
  perEvent?: boolean;
  /** Optional event_addons key for per-event addons. */
  addonKey?: string;
  /** If entitlements show this addon is already account-wide, mark it included. */
  isIncludedForAccount?: (e: Entitlements) => boolean;
  openLabel: string;
  openTo: string;
  openSearch?: Record<string, string>;
};

const CATALOG: AddonCatalogEntry[] = [
  {
    id: "branding",
    name: "Remove The Kenroe Collective branding",
    tag: "Per-event extra",
    price: "$3 one-time",
    blurb: "Hide the watermark and Powered-by footer on this event. Host & Atelier plans include this automatically.",
    priceId: "event_branding_removal",
    perEvent: true,
    addonKey: "branding_removal",
    isIncludedForAccount: (e) => e.brandingRemovedByTier,
    openLabel: "Preview unbranded invitation",
    openTo: "/invite/$eventId",
  },
  {
    id: "guest-import",
    name: "Bulk guest list import",
    tag: "Account unlock",
    price: "$5 one-time",
    blurb: "Download a pre-formatted Excel template, fill in your guests, and re-upload to import them all at once. Included free with Atelier.",
    priceId: "guest_import_addon",
    isIncludedForAccount: (e) => e.tier === "atelier" || e.guestImportPaid,
    openLabel: "Import guests",
    openTo: "/events/$eventId",
    openSearch: { step: "guests" },
  },
  {
    id: "thank-you",
    name: "Thank-you cards studio",
    tag: "Account unlock",
    price: "$7 one-time",
    blurb: "Animated GIFs, scheduled sends, and free print-at-home cards and mailing labels. Unlocks the full studio across all your events. Included free with Atelier.",
    priceId: "thank_you_cards_addon",
    isIncludedForAccount: (e) => e.tier === "atelier" || e.thankYouCardsPaid,
    openLabel: "Open thank-you card studio",
    openTo: "/events/$eventId",
    openSearch: { step: "share" },
  },
  // AI invite art add-on removed 2026-07-26 — the free AI art generator in
  // an event's Vibe gallery is real and already unlocked for Whisper+ by
  // tier alone (see events.$eventId.tsx's generateAi()); this $15 addon's
  // purchase flag was never checked by that gate, so buying it did nothing.
  // Photo Wall per-event add-on removed 2026-08-01 — Photo Wall is now an
  // Atelier-exclusive feature with no purchase path for other tiers.
  // Co-host editor seat removed 2026-07-26 — purchasing a seat granted no
  // actual co-editing permission; there is no collaborator/seat system yet.
  {
    id: "sms-pack",
    name: "SMS reminders add-on",
    tag: "Account unlock",
    // TODO(credit-ledger): quantity ("250 messages") was previously advertised
    // but there is no per-message counter yet. Copy is intentionally quantity-free
    // until an sms_credit_ledger table + atomic decrement RPC ship.
    price: "$6 one-time",
    blurb: "Unlocks SMS reminders, RSVP nudges, and day-of updates on your account. Included free with Host and Atelier — Postcard and Whisper can add it without upgrading.",
    priceId: "sms_pack_addon",
    isIncludedForAccount: (e) => e.tier === "host" || e.tier === "atelier",
    openLabel: "Open SMS reminders",
    openTo: "/events/$eventId",
    openSearch: { step: "guests" },
  },
  {
    id: "converter",
    name: "Media Converter unlock",
    tag: "Account unlock",
    price: "$5 one-time",
    blurb: "Convert images to WebP/AVIF/JPEG/PNG, resize, compress, and get shareable CDN URLs. Included free with Atelier.",
    priceId: "converter_addon",
    isIncludedForAccount: (e) => e.hasConverter,
    openLabel: "Open Media Converter",
    openTo: "/tools/converter",
  },
];




interface Props {
  eventId: string;
  /** Optional user email + id for the embedded checkout. */
  userEmail?: string;
  userId?: string;
  variant?: "card" | "inline";
}

export function EventAddOnsPanel({ eventId, userEmail, userId, variant = "card" }: Props) {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [purchased, setPurchased] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<null | { entry: AddonCatalogEntry }>(null);
  const [authUser, setAuthUser] = useState<{ id: string; email?: string } | null>(null);
  const previewTier = usePreviewTier();

  const reload = async () => {
    try {
      const env = getStripeEnvironment();
      const r = await getEventAddons({ data: { eventId, environment: env } });
      if ("addonKeys" in r) setPurchased(new Set(r.addonKeys));
    } catch { /* not configured / not signed in */ }
  };

  useEffect(() => {
    let alive = true;
    getEntitlements().then((e) => { if (alive) setEntitlements(e); }).catch(() => {});
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      const u = data.user;
      setAuthUser(u ? { id: u.id, email: u.email ?? undefined } : null);
      // Only query per-event addons when signed in — the server fn requires auth.
      if (u) void reload();
    }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, previewTier]);


  const effectiveUserId = userId ?? authUser?.id;
  const effectiveEmail = userEmail ?? authUser?.email;

  const wrapperCls =
    variant === "card"
      ? "rounded-3xl bg-card p-5 ring-1 ring-ink/5 sm:p-6"
      : "rounded-2xl bg-secondary/30 p-4 ring-1 ring-ink/5";

  return (
    <section className={wrapperCls} aria-label="Event add-ons">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">Add-ons for this event</p>
          <h2 className="mt-1 font-serif text-2xl leading-tight">Polish, automate, and personalize</h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            Add only what this event needs — no plan upgrade required. Account unlocks apply across every event you create.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {CATALOG.map((entry) => {
          const inCart = !!CART_CATALOG[entry.priceId];
          return (
            <AddOnTile
              key={entry.id}
              entry={entry}
              entitlements={entitlements}
              purchasedForEvent={entry.addonKey ? purchased.has(entry.addonKey) : false}
              onBuy={() => setOpen({ entry })}
              eventId={eventId}
              onAddToSelections={inCart ? async () => {
                try {
                  await addToCart({
                    data: {
                      sku: entry.priceId,
                      quantity: 1,
                      eventId: entry.perEvent ? eventId : undefined,
                      environment: getStripeEnvironment(),
                    },
                  });
                  emitSelectionsChanged(true);
                  toast.success(`${entry.name} added to Selections.`);
                } catch (err) {
                  toast.error(toUserMessage(err, "Could not add to Selections."));
                }
              } : undefined}
            />
          );
        })}
      </div>

      {open && (
        <CheckoutDialog
          entry={open.entry}
          eventId={eventId}
          userEmail={effectiveEmail}
          userId={effectiveUserId}
          onClose={() => setOpen(null)}
          onSuccess={async () => {
            setOpen(null);
            toast.success("Purchase complete — applied to this event.");
            await reload();
            // Refresh entitlements so account unlocks reflect immediately.
            try { setEntitlements(await getEntitlements()); } catch {}
          }}
        />
      )}
    </section>
  );
}

function AddOnTile({
  entry,
  entitlements,
  purchasedForEvent,
  onBuy,
  onAddToSelections,
  eventId,
}: {
  entry: AddonCatalogEntry;
  entitlements: Entitlements | null;
  purchasedForEvent: boolean;
  onBuy: () => void;
  onAddToSelections?: () => void;
  eventId: string;
}) {
  const includedByAccount = entitlements ? entry.isIncludedForAccount?.(entitlements) === true : false;
  const included = includedByAccount || purchasedForEvent;
  const includedLabel = purchasedForEvent ? "Added to this event" : "Included with your account";

  return (
    <div className="flex min-h-[15.5rem] flex-col rounded-2xl bg-paper p-4 ring-1 ring-ink/5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-velvet">{entry.tag}</div>
          <div className="mt-1 font-serif text-base leading-tight">{entry.name}</div>
        </div>
        {included && (
          <span className="shrink-0 rounded-full bg-velvet/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-velvet">
            ✓ Unlocked
          </span>
        )}
      </div>
      <div className="mt-2 text-sm font-medium text-velvet">
        {included ? includedLabel : entry.price}
      </div>
      <p className="mt-2 flex-1 text-xs leading-snug text-muted-foreground">{entry.blurb}</p>
      {included && (
        <div className="mt-2 rounded-xl bg-velvet/5 px-3 py-2 text-[11px] text-ink/70 ring-1 ring-velvet/15">
          Ready now — no more checkout needed for this access.
        </div>
      )}
      {included ? (
        <Link
          to={entry.openTo as never}
          params={entry.openTo.includes("$eventId") ? ({ eventId } as never) : undefined}
          search={entry.openSearch as never}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 py-2 text-center text-xs font-medium text-paper hover:opacity-90"
        >
          {entry.openLabel}
        </Link>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onBuy}
            className="inline-block rounded-full bg-ink px-4 py-2 text-center text-xs font-medium text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Buy now
          </button>
          {onAddToSelections && (
            <button
              type="button"
              onClick={onAddToSelections}
              className="inline-block rounded-full border border-ink/15 bg-paper px-4 py-1.5 text-center text-[11px] font-medium text-ink/80 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add to Selections
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CheckoutDialog({
  entry,
  eventId,
  userEmail,
  userId,
  onClose,
  onSuccess,
}: {
  entry: AddonCatalogEntry;
  eventId: string;
  userEmail?: string;
  userId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const returnUrl = typeof window !== "undefined"
    ? `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}&next=${encodeURIComponent(`/events/${eventId}?addon=1`)}`
    : "";

  // Promo code input — applied to the Stripe session on confirmation.
  const [codeInput, setCodeInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | undefined>(undefined);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data && e.data.type === "kenroes:addon-success") onSuccess();
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onSuccess]);

  if (!isPaymentsConfigured()) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-3xl bg-paper p-6 text-center">
          <p className="font-serif text-lg">Payments aren't configured yet.</p>
          <button type="button" onClick={onClose} className="mt-4 rounded-full bg-ink px-5 py-2 text-sm text-paper">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-ink/60 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative my-8 w-full max-w-2xl overflow-hidden rounded-3xl bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink/5 px-6 py-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">{entry.tag}</div>
            <h3 className="mt-1 font-serif text-xl">{entry.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{entry.price}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="border-b border-ink/5 px-6 py-3">
          <label className="flex items-end gap-2 text-xs">
            <div className="flex-1">
              <span className="text-muted-foreground">Have a promo code?</span>
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. WELCOME10"
                className="mt-1 w-full rounded-md bg-card px-3 py-1.5 text-sm uppercase tracking-wide ring-1 ring-ink/10 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setAppliedCode(codeInput.trim() || undefined)}
              className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-paper hover:opacity-90 disabled:opacity-40"
              disabled={!codeInput.trim() || appliedCode === codeInput.trim()}
            >
              {appliedCode && appliedCode === codeInput.trim() ? "Applied" : "Apply"}
            </button>
          </label>
          {appliedCode && (
            <p className="mt-1 text-[11px] text-velvet">Code <strong>{appliedCode}</strong> will be validated at checkout.</p>
          )}
        </div>
        <div className="px-2 py-2 sm:px-4">
          <StripeEmbeddedCheckout
            priceId={entry.priceId}
            discountCode={appliedCode}
            userId={userId}
            customerEmail={userEmail}
            eventId={eventId}
            returnUrl={returnUrl}
          />
        </div>
      </div>
    </div>
  );
}
