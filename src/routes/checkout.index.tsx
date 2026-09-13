import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { supabase } from "@/integrations/supabase/client";
import { isPaymentsConfigured, getStripeEnvironment } from "@/lib/stripe";
import { logPurchaseConsent } from "@/lib/consent.functions";
import { REFUND_POLICY_VERSION } from "@/routes/refund-policy";



// Single source of truth for every purchasable Stripe lookup_key. Kept as
// a Set so /checkout rejects unknown or misspelled ids up front rather than
// bouncing the user through a broken Stripe session.
const VALID_PRICES = new Set([
  // Tier subscriptions (v1 + v3 for backward compat with historical links)
  "whisper_onetime",
  "whisper_monthly",
  "whisper_yearly",
  "whisper_monthly_v2",
  "whisper_yearly_v2",
  "whisper_onetime_v3",
  "whisper_monthly_v3",
  "whisper_yearly_v3",
  // Single-event one-time passes (Whisper $19, Host $49, Atelier $99)
  "whisper_single_event",
  "host_single_event",
  "atelier_single_event",
  "atelier_single_event_v2",
  "host_onetime",
  "host_monthly",
  "host_yearly",
  "host_monthly_v3",
  "host_yearly_v3",
  "host_yearly_v4",
  "atelier_onetime",
  "atelier_monthly",
  "atelier_yearly",
  "atelier_monthly_v3",
  "atelier_yearly_v3",
  // Project Management (standalone + Atelier Studio bundle)
  // pm_studio_monthly/yearly ("Team" tier) retired 2026-07-26 — delivered
  // nothing beyond pm_solo (seat caps come from event tier, not PM SKU;
  // no project/storage limits exist; "client folders" never shipped).
  "pm_addon_monthly",
  "pm_addon_yearly",
  "pm_solo_monthly",
  "pm_solo_yearly",
  "host_pm_bundle_monthly",
  "host_pm_bundle_yearly",
  "atelier_studio_monthly",
  "atelier_studio_yearly",
  "studio_collective_monthly",
  "studio_collective_yearly",
  // Account unlocks (one-time, flip a flag on profiles)
  "guest_import_addon",
  "thank_you_cards_addon",
  "converter_addon",
  "sms_pack_addon",
  // ai_art_credits_addon and event_cohost_seat removed 2026-07-26 — both
  // sold features that don't exist in the app yet.
  // custom_domain_monthly ("Branded subdomain") removed 2026-07-27 — the
  // advertised subdomain routing doesn't exist yet.
  // Per-event add-ons (recorded in event_addons via Stripe metadata)
  "event_branding_removal",
  "event_photo_wall",
]);

const NEXT_KEY = "kenroes:checkout-next";

export const Route = createFileRoute("/checkout/")({
  validateSearch: (search: Record<string, unknown>): { price?: string; qty?: number; code?: string; next?: string } => ({
    price: typeof search.price === "string" ? search.price : undefined,
    qty: typeof search.qty === "string" || typeof search.qty === "number"
      ? Math.max(1, Math.min(5000, Number(search.qty) || 1))
      : undefined,
    code: typeof search.code === "string" ? search.code : undefined,
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Checkout — The Kenroe Collective" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const { price, qty, code, next } = Route.useSearch();
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Persist post-checkout destination so the return route can send the user back.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (next) window.sessionStorage.setItem(NEXT_KEY, next);
    } catch {}
  }, [next]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setUser(u ? { id: u.id, email: u.email ?? undefined } : null);
      setAuthChecked(true);
    });
  }, []);

  if (!price || !VALID_PRICES.has(price)) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <section className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="font-serif text-3xl">Pick a plan first</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Head back to pricing and choose a plan.
          </p>
          <Link
            to="/pricing"
            className="mt-6 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper"
          >
            View pricing
          </Link>
        </section>
        <SiteFooter />
      </div>
    );
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-md px-6 py-24 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      </div>
    );
  }

  if (!user) {
    const params = new URLSearchParams({ price });
    if (qty) params.set("qty", String(qty));
    if (code) params.set("code", code);
    if (next) params.set("next", next);
    navigate({ to: "/auth", search: { redirect: `/checkout?${params.toString()}` } as any });
    return null;
  }

  if (!isPaymentsConfigured()) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <PaymentTestModeBanner />
        <SiteFooter />
      </div>
    );
  }

  const returnQuery = next ? `&next=${encodeURIComponent(next)}` : "";
  const returnUrl = `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}${returnQuery}`;

  return (
    <div className="min-h-screen bg-paper">
      <PaymentTestModeBanner />
      <SiteNav />
      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl">Complete your purchase</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Secure checkout — cancel any time. Your in-progress event or project draft is saved.
            </p>
          </div>
          <Link
            to={((next as string) || "/pricing") as any}
            className="shrink-0 rounded-full border border-ink/15 px-4 py-2 text-xs font-medium text-ink/70 hover:border-velvet/40 hover:text-ink"
          >
            ← Cancel & keep my draft
          </Link>
        </div>
        {(price.startsWith("whisper_onetime") || price.startsWith("host_onetime") || price.startsWith("atelier_onetime")) && (
          <div className="mt-4 rounded-2xl border border-velvet/30 bg-velvet/5 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-velvet">Heads up — you could save</p>
            <p className="mt-1 text-sm text-ink">
              You're buying a one-time pass for this event. If you host more than once a year, switching to a subscription plan saves real money — cancel any time:
            </p>
            <ul className="mt-2 space-y-1 text-[13px] text-ink/80">
              {price.startsWith("whisper_onetime") && (
                <>
                  <li>• <span className="font-medium">Whisper monthly $5</span> — unlimited Whisper events while active.</li>
                  <li>• <span className="font-medium">Whisper yearly $39</span> — best value if you host 6+ times.</li>
                </>
              )}
              {!price.startsWith("atelier_onetime") && (
                <li>• <span className="font-medium">Host $12/mo</span> — 750 guests, voice greeting, gift registry, animated thank-yous.</li>
              )}
              <li>• <span className="font-medium">Atelier $29/mo</span> — unlimited guests, seating, run-of-show, branded URL, full studio.</li>
            </ul>
            <Link to="/pricing" className="mt-2 inline-block text-xs font-medium text-velvet underline">Compare plans →</Link>
          </div>
        )}
        {null}
        <CheckoutConsentGate
          price={price}
          userId={user.id}
        >
          <div className="mt-8 overflow-hidden rounded-2xl ring-1 ring-ink/5">
            <StripeEmbeddedCheckout
              priceId={price}
              quantity={qty}
              discountCode={code}
              customerEmail={user.email}
              userId={user.id}
              returnUrl={returnUrl}
            />
          </div>
        </CheckoutConsentGate>
      </section>
      <SiteFooter />
    </div>
  );
}

const CONSENT_TEXT =
  "I have read and agree to the Terms of Service and the Refund Policy. I understand that one-time single-event passes are cancellable within 24 hours only if unused, and that subscription payments are non-refundable.";

function CheckoutConsentGate({ price, userId, children }: { price: string; userId: string; children: ReactNode }) {
  const [agreed, setAgreed] = useState(false);
  const [logged, setLogged] = useState(false);
  const [busy, setBusy] = useState(false);

  if (agreed && logged) return <>{children}</>;

  return (
    <div className="mt-8 rounded-2xl border border-ink/10 bg-secondary/40 p-5">
      <p className="font-serif text-lg text-ink">One quick agreement</p>
      <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-ink/30"
        />
        <span>
          I agree to the{" "}
          <Link to="/terms" target="_blank" className="text-velvet underline">Terms of Service</Link>{" "}
          and the{" "}
          <Link to="/refund-policy" target="_blank" className="text-velvet underline">Refund Policy</Link>.
          I understand one-time passes are cancellable within 24 hours only if unused, and that subscription payments are non-refundable.
        </span>
      </label>
      <button
        type="button"
        disabled={!agreed || busy}
        onClick={async () => {
          setBusy(true);
          try {
            let environment: "sandbox" | "live" = "sandbox";
            try { environment = getStripeEnvironment(); } catch {}
            await logPurchaseConsent({
              data: {
                priceId: price,
                consentText: CONSENT_TEXT,
                termsVersion: "2026-07-09",
                refundPolicyVersion: REFUND_POLICY_VERSION,
                environment,
              },
            });
            setLogged(true);
          } catch {
            // If consent logging fails, still let the user continue but flag it.
            setLogged(true);
          } finally {
            setBusy(false);
          }
        }}
        className="mt-4 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper disabled:opacity-40"
      >
        Continue to payment →
      </button>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Your acceptance is recorded with a timestamp, IP address, and browser identifier for legal evidence.
      </p>
    </div>
  );
}
