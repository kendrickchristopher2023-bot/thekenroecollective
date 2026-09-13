import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { getPublicTiers, validateDiscount, type PricingTier, type PricingCategory } from "@/lib/pricing.functions";
import { createPortalSession, cancelSubscriptionAtPeriodEnd, startAtelierTrial } from "@/lib/payments.functions";
import { useSubscription } from "@/hooks/use-subscription";
import { getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { getEntitlements, type Entitlements } from "@/lib/entitlements-client";
import { usePreviewTier } from "@/lib/preview-tier";
import { confirmDialog } from "@/lib/confirm-dialog";
import { COLLABORATOR_INVITE_TTL_DAYS, PM_ADDON_SEAT_LIMITS, TIER_LIMITS } from "@/lib/tier-limits";
import { TIERS } from "@/lib/tier-config";
import { ECARD_SEND_PRICE_LABEL } from "@/lib/ecards-pricing";
import { formatStampDate } from "@/lib/datetime";


function getTrialDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server";
  const key = "kc_trial_device_id";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return window.navigator.userAgent || "unknown-device";
  }
}

export const Route = createFileRoute("/pricing")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { next?: string; trial?: string; category?: PricingCategory; ref?: string; highlight?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
    // Deep link from a completion moment: focus one tier card instead of
    // dropping the host into a generic table.
    highlight:
      search.highlight === "whisper" || search.highlight === "host" || search.highlight === "atelier"
        ? search.highlight
        : undefined,
    trial: typeof search.trial === "string" ? search.trial : undefined,
    ref: typeof search.ref === "string" ? search.ref.slice(0, 60) : undefined,
    category:
      search.category === "events" ||
      search.category === "addons" ||
      search.category === "ecards" ||
      search.category === "projects"
        ? search.category
        : undefined,
  }),
  loader: () => getPublicTiers(),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  head: () => ({
    meta: [
      { title: "Pricing — The Kenroe Collective" },
      { name: "description", content: "Simple, beautiful pricing for editorial event planning, invitations, RSVPs, and orchestration." },
      { property: "og:title", content: "Pricing — The Kenroe Collective" },
      { property: "og:description", content: "Discover our simple, beautiful pricing tiers for editorial event management and orchestration." },
      { property: "og:url", content: "https://thekenroecollective.com/pricing" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/pricing" }],
  }),
  component: PricingPage,
  errorComponent: PricingErrorComponent,
  notFoundComponent: PricingNotFoundComponent,
});


type AddOn = {
  id: string;
  name: string;
  tag: string;
  price: string;
  blurb: string;
  /** Optional gate: returns CTA override based on user entitlements. */
  cta: {
    priceId?: string;
    label: string;
    /** When set, link to this route instead of /checkout. */
    href?: { to: string; search?: Record<string, string> };
  };
  /** Returns either null (use default cta) or an override. */
  resolve?: (e: Entitlements | null) => { label: string; disabled?: boolean; included?: boolean; upgradeTo?: string } | null;
  open?: { label: string; to: string; search?: Record<string, string> };
};

const ADDONS: AddOn[] = [
  // Projects (The Workroom) is NOT listed here — it is its own venture with a
  // standalone section on this page. See <ProjectsPlanSection />.

  // ── Per-event extras ───────────────────────────────────────────────────
  {
    id: "remove-branding",
    name: "Remove The Kenroe Collective watermark",
    tag: "Per-event extra",
    price: "$3 per event",
    blurb: "Hide the watermark and Powered-by footer on a single event. Host & Atelier plans include this on every event automatically.",
    cta: { label: "Buy for a specific event", href: { to: "/events" } },
    open: { label: "Open my events", to: "/events" },
    resolve: (e) => {
      if (!e) return { label: "Sign up to purchase — $3", disabled: false };
      if (e.brandingRemovedByTier) return { label: "Included on your plan", disabled: true, included: true };
      return { label: "Buy $3 — pick event", disabled: false };
    },
  },
  // Photo Wall per-event add-on removed 2026-08-01 — Photo Wall is now an
  // Atelier-exclusive feature with no purchase path for other tiers.
  // Co-host editor seat removed 2026-07-26 — purchasing a seat granted no
  // actual co-editing permission; there is no collaborator/seat system yet.

  // ── Account unlocks ────────────────────────────────────────────────────
  {
    id: "guest-import",
    name: "Bulk guest list import (Excel)",
    tag: "Account unlock",
    price: "$5 one-time",
    blurb: "Download a pre-formatted Excel template, fill in your guests, and re-upload to import them all at once. Included free with Atelier — Host can add it for $5; Postcard and Whisper need to upgrade to Host or above first.",
    cta: { priceId: "guest_import_addon", label: "Add — $5" },
    open: { label: "Import guests", to: "/events" },
    resolve: (e) => {
      if (!e) return null;
      if (e.tier === "atelier" || e.guestImportPaid) return { label: "Included", disabled: true, included: true };
      if (e.tier === "postcard" || e.tier === "whisper") return { label: "Add — $5 (requires Host)", upgradeTo: "host" };
      return null;
    },
  },
  {
    id: "thank-you-cards",
    name: "Thank-you cards studio",
    tag: "Account unlock",
    price: "$7 one-time",
    blurb: "Animated GIFs, scheduled sends, and free print-at-home cards and mailing labels. Included free with Atelier; Host can unlock it for $7, while Postcard and Whisper need Host or above first.",
    cta: { priceId: "thank_you_cards_addon", label: "Add — $7" },
    open: { label: "Open thank-you card studio", to: "/events" },
    resolve: (e) => {
      if (!e) return null;
      if (e.tier === "atelier" || e.thankYouCardsPaid) return { label: "Included", disabled: true, included: true };
      if (e.tier === "postcard" || e.tier === "whisper") return { label: "Upgrade to Host to add", upgradeTo: "host" };
      return null;
    },
  },
  {
    id: "sms-pack",
    name: "SMS reminders add-on",
    tag: "Account unlock",
    // TODO(credit-ledger): quantity ("250 messages") was previously advertised
    // but there is no per-message counter yet. Copy is intentionally quantity-free
    // until an sms_credit_ledger table + atomic decrement RPC ship.
    price: "$6 one-time",
    blurb: "Unlocks SMS reminders, RSVP nudges, and day-of updates for your account. Included free with Host and Atelier — Postcard and Whisper can add it without upgrading.",
    cta: { priceId: "sms_pack_addon", label: "Add — $6" },
    open: { label: "Open SMS reminders", to: "/events" },
    resolve: (e) => {
      if (!e) return null;
      if (e.tier === "host" || e.tier === "atelier" || e.smsPackPaid) return { label: "Included", disabled: true, included: true };
      return { label: "Add — $6", disabled: false };
    },
  },
  {
    id: "converter",
    name: "Media Converter unlock",
    tag: "Account unlock",
    price: "$5 one-time",
    blurb: "Convert images to WebP/AVIF/JPEG/PNG, resize, compress, and get shareable CDN URLs. Included free with Atelier.",
    cta: { priceId: "converter_addon", label: "Add — $5" },
    open: { label: "Open Media Converter", to: "/tools/converter" },
    resolve: (e) => {
      if (!e) return null;
      if (e.hasConverter) return { label: "Included", disabled: true, included: true };
      return null;
    },
  },
  // Branded subdomain ($4/mo) retired 2026-07-27 — the advertised deliverable
  // (your-event.thekenroecollective.com) doesn't exist yet (needs a wildcard DNS
  // record; the panel that would configure it was also unreachable behind an
  // Atelier-only gate, and Atelier users got the existing free path-based
  // /e/slug vanity URL without ever purchasing). Zero customers were ever
  // subscribed. Re-add once real subdomain routing ships.
  // AI invite art add-on removed 2026-07-26 — the free AI art generator in
  // an event's Vibe gallery is real and already unlocked for Whisper+ by
  // tier alone; this $15 addon's purchase flag was never checked by that
  // gate (Postcard buyers got nothing), so it was pure vaporware.

  // ── Built-in features (no purchase — discovery only) ───────────────────
  {
    id: "tip-jar",
    name: "Tip & Donation Jar",
    tag: "Built-in (Host & Atelier)",
    price: "Included",
    blurb: "Add Venmo, Cash App, Zelle, Apple Pay & Google Pay direct links inside invitations — a single tap opens the host's chosen payment app so guests can send a tip or contribution straight to the host. Toggle on/off per event.",
    cta: { label: "Open an event to enable", href: { to: "/events" } },
    resolve: (e) => {
      if (!e) return null;
      if (e.tier === "postcard" || e.tier === "whisper") return { label: "Requires Host or Atelier", upgradeTo: "host" };
      return { label: "Open an event", disabled: false, included: true };
    },
  },
  {
    id: "pdf-export",
    name: "Mailable invitation PDF",
    tag: "Built-in (all plans)",
    price: "Free",
    blurb: "Export a one-pager PDF in 5×7, US Letter, or postcard sizes so you can print and mail to guests yourself.",
    cta: { label: "Open an event", href: { to: "/events" } },
  },
  {
    id: "translation",
    name: "Invitation translation",
    tag: "Built-in (all plans)",
    price: "Free",
    blurb: "Translate invitations to your guests' preferred language so the whole list reads it in their own words.",
    cta: { label: "Open an event", href: { to: "/events" } },
  },
];



function PricingErrorComponent({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <h1 className="font-serif text-3xl font-medium text-ink">Pricing is taking a moment</h1>
        <p className="mt-3 text-sm text-muted-foreground">Please try again without refreshing the page.</p>
        <button
          type="button"
          onClick={() => {
            reset();
            router.invalidate();
          }}
          className="mt-6 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:opacity-90"
        >
          Try again
        </button>
      </section>
      <SiteFooter />
    </div>
  );
}

function PricingNotFoundComponent() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <h1 className="font-serif text-3xl font-medium text-ink">Pricing is taking a moment</h1>
        <p className="mt-3 text-sm text-muted-foreground">Please try again without refreshing the page.</p>
        <button
          type="button"
          onClick={() => router.invalidate()}
          className="mt-6 rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:opacity-90"
        >
          Try again
        </button>
      </section>
      <SiteFooter />
    </div>
  );
}


function PricingPage() {
  const checkCode = useServerFn(validateDiscount);
  const openPortal = useServerFn(createPortalSession);
  const cancelAtPeriodEnd = useServerFn(cancelSubscriptionAtPeriodEnd);
  const beginTrial = useServerFn(startAtelierTrial);
  const { subscription, isActive, isGranted } = useSubscription();
  const { next, trial, category: categoryParam, ref: refCode, highlight } = Route.useSearch();
  const highlightedRef = useRef(false);
  const navigate = useNavigate();
  const tiers = Route.useLoaderData() as PricingTier[];
  const [billing, setBilling] = useState<"onetime" | "monthly" | "yearly">(categoryParam === "addons" ? "onetime" : "monthly");
  const [category, setCategory] = useState<PricingCategory>(categoryParam ?? "events");

  const [promoInput, setPromoInput] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, { percent_off: number | null; amount_off: number | null } | { error: string }>>({});
  const [busy, setBusy] = useState(false);

  // Pre-fill promo input from ?ref=CODE (referral) on all paid tiers so a
  // friend's link auto-applies at checkout.
  useEffect(() => {
    if (!refCode) return;
    const trimmed = refCode.trim().toUpperCase();
    if (!trimmed) return;
    setPromoInput((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const t of tiers) if (!next[t.id]) next[t.id] = trimmed;
      return next;
    });
  }, [refCode, tiers]);

  // Drives the "save up to N%" tab label — computed from the same tier
  // data as the per-card savings copy below, so the two can't drift apart.
  const maxYearlySavingsPct = useMemo(() => {
    let max = 0;
    for (const t of tiers) {
      const monthlyTotal = Number(t.price_monthly) * 12;
      const yearlyTotal = Number(t.price_yearly);
      if (monthlyTotal <= 0) continue;
      const pct = Math.round(((monthlyTotal - yearlyTotal) / monthlyTotal) * 100);
      if (pct > max) max = pct;
    }
    return max;
  }, [tiers]);

  function savingsCopy(monthlyPrice: number, yearlyPrice: number, suffix: string): string {
    const monthlyTotal = Number(monthlyPrice) * 12;
    const yearlyTotal = Number(yearlyPrice);
    const exact = monthlyTotal > 0 ? ((monthlyTotal - yearlyTotal) / monthlyTotal) * 100 : 0;
    const pct = Math.round(exact);
    if (pct <= 0) return "";
    const qualifier = Number.isInteger(exact) ? "" : "roughly ";
    return `${qualifier}${pct}% ${suffix}`;
  }

  async function handleManageBilling() {
    setBusy(true);
    try {
      const r = await openPortal({
        data: { environment: getStripeEnvironment(), returnUrl: window.location.href },
      });
      if ("error" in r) {
        toast.error(r.error);
      } else {
        window.open(r.url, "_blank");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open billing portal");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!(await confirmDialog({ title: "Cancel your subscription at the end of the current billing period?" }))) return;
    setBusy(true);
    try {
      const r = await cancelAtPeriodEnd({ data: { environment: getStripeEnvironment() } });
      if ("error" in r) toast.error(r.error);
      else toast.success("Subscription will end at the period close.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartTrial() {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/auth", search: { redirect: `/pricing?trial=atelier${next ? `&next=${encodeURIComponent(next)}` : ""}` } as any });
        return;
      }
      let environment: "sandbox" | "live" | undefined;
      try { environment = getStripeEnvironment(); } catch { environment = undefined; }
      const r = await beginTrial({
        data: {
          ...(environment ? { environment } : {}),
          deviceFingerprint: getTrialDeviceFingerprint(),
        },
      });
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Your Atelier trial is active — 20 guests, 60 days. Upgrade any time for more.");
        navigate({ to: (next || "/events/new") as any });
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start trial");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (trial === "atelier" && !busy) void handleStartTrial();
    // Run once when returning from auth with the explicit trial flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trial]);


  function baseFor(t: PricingTier): number {
    if (billing === "onetime") return Number(t.price_onetime ?? 0);
    if (billing === "yearly") return Number(t.price_yearly ?? 0);
    return Number(t.price_monthly ?? 0);
  }

  function priceFor(t: PricingTier) {
    const base = baseFor(t);
    const a = applied[t.id];
    if (a && "percent_off" in a) {
      if (a.percent_off) return Math.max(0, +(base * (1 - a.percent_off / 100)).toFixed(2));
      if (a.amount_off) return Math.max(0, +(base - a.amount_off).toFixed(2));
    }
    return base;
  }

  function priceIdFor(t: PricingTier): string {
    const key = t.id === "free" ? "whisper" : t.id;
    const base = `${key}_${billing}`;
    // Re-priced to undercut competition; route to current Stripe price IDs.
    if (base === "whisper_onetime") return "whisper_onetime_v3";
    if (base === "whisper_monthly") return "whisper_monthly_v3";
    if (base === "whisper_yearly") return "whisper_yearly_v3";
    if (base === "host_monthly") return "host_monthly_v3";
    if (base === "host_yearly") return "host_yearly_v3";
    if (base === "atelier_monthly") return "atelier_monthly_v3";
    if (base === "atelier_yearly") return "atelier_yearly_v3";
    // One-time single-event passes (dedicated SKUs, not the old *_onetime).
    if (base === "host_onetime") return "host_single_event";
    if (base === "atelier_onetime") return "atelier_single_event_v2";
    return base;
  }

  function suffixFor(): string {
    if (billing === "onetime") return "one-time";
    if (billing === "yearly") return "/yr";
    return "/mo";
  }

  async function tryPromo(tierId: string) {
    const code = (promoInput[tierId] || "").trim();
    if (!code) return;
    const { data: userData } = await supabase.auth.getUser();
    const r = await checkCode({ data: { code, tier_id: tierId, user_id: userData.user?.id } });
    if (r.valid) setApplied({ ...applied, [tierId]: { percent_off: r.percent_off, amount_off: r.amount_off } });
    else setApplied({ ...applied, [tierId]: { error: r.reason } });
  }


  return (
    <div className="min-h-screen bg-paper">
      <PaymentTestModeBanner />
      <SiteNav />

      {refCode && (
        <div className="mx-auto mt-4 max-w-3xl rounded-2xl bg-gradient-to-r from-velvet/10 via-gold/10 to-velvet/10 px-5 py-3 text-center text-sm ring-1 ring-velvet/20">
          <span className="font-medium">A friend sent you 20% off</span>
          <span className="mx-2 text-ink/40">·</span>
          <span className="text-ink/70">code </span>
          <code className="font-mono font-semibold text-velvet">{refCode.toUpperCase()}</code>
          <span className="text-ink/70"> applied at checkout.</span>
        </div>
      )}


      {category !== "addons" && isActive && subscription && (
        <div className="mx-auto mt-6 max-w-3xl rounded-2xl bg-card px-6 py-4 ring-1 ring-ink/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-serif text-lg">
                You're on {subscription.price_id.replace("_", " — ")}
              </div>
              <div className="text-xs text-muted-foreground">
                {subscription.cancel_at_period_end
                  ? `Ends ${subscription.current_period_end ? formatStampDate((subscription.current_period_end)) : "soon"}`
                  : subscription.current_period_end
                    ? `Renews ${formatStampDate((subscription.current_period_end))}`
                    : "Active"}
              </div>
            </div>
            <div className="flex gap-2">
              {isGranted ? (
                <span className="max-w-sm text-xs text-muted-foreground">
                  This plan was given to you by us, so there's no billing to manage.
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleManageBilling}
                  disabled={busy}
                  className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
                >
                  Manage billing
                </button>
              )}
              {!subscription.cancel_at_period_end && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={busy}
                  className="rounded-full bg-secondary px-4 py-2 text-xs font-medium text-ink hover:bg-secondary/70 disabled:opacity-50"
                >
                  Cancel plan
                </button>
              )}
            </div>
          </div>
        </div>
      )}


      <header className={`relative overflow-hidden border-b border-ink/5 px-6 text-center ${category === "addons" ? "py-3" : "py-20"}`}>
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-velvet/10 blur-3xl" />
        <span className={`relative text-[10px] font-medium uppercase tracking-[0.25em] text-velvet ${category === "addons" ? "sr-only" : ""}`}>
          {category === "projects" ? "Projects pricing" : category === "ecards" ? "Group eCards pricing" : "Pricing"}
        </span>
        <h1 className={`relative font-serif font-medium tracking-tight ${category === "addons" ? "text-2xl" : "mt-2 text-4xl sm:text-5xl"}`}>
          {category === "addons"
            ? "Add-ons"
            : category === "projects"
              ? "Plan the work, not just the party."
              : category === "ecards"
                ? "One card, everyone signs it."
                : "Beautiful gatherings, gently priced."}
        </h1>
        {category !== "addons" && (
          <p className="relative mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
            {category === "projects"
              ? "The Workroom is its own venture — one flat price, no event plan required. Boards, tasks and collaborators from day one. Cancel any time."
              : category === "ecards"
                ? `Group eCards is priced per card, not per month. Create a card and collect messages for free, then pay ${ECARD_SEND_PRICE_LABEL} only when you send it.`
                : "Start small with Whisper. Upgrade when you fall in love. Cancel any time — no hard feelings."}
          </p>
        )}

        <div className={`relative inline-flex flex-wrap items-center justify-center gap-1 rounded-full bg-secondary p-1 ring-1 ring-ink/10 ${category === "addons" ? "mt-2" : "mt-8"}`}>
          {([
            { id: "events", label: "Events" },
            { id: "projects", label: "Projects" },
            { id: "ecards", label: "Group eCards" },
            { id: "addons", label: "Add-ons" },
          ] as const).map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => {
                setCategory(c.id);
                if (c.id === "addons") setBilling("onetime");
                else if (c.id !== "events" && billing === "onetime") setBilling("monthly");
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                category === c.id ? "bg-paper text-ink shadow-sm" : "text-muted-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>


        {category !== "addons" && category !== "ecards" && (
        <div className="relative mt-4 inline-flex items-center gap-1 rounded-full bg-secondary p-1 ring-1 ring-ink/10">
          {(["onetime", "monthly", "yearly"] as const).map((b) => {
            // Only Events plans have one-time per-event pricing
            if (b === "onetime" && category !== "events") return null;
            return (
              <button
                type="button"
                key={b}
                onClick={() => setBilling(b)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  billing === b ? "bg-paper text-ink shadow-sm" : "text-muted-foreground"
                }`}
              >
                {b === "onetime" ? "One-time" : b === "monthly" ? "Monthly" : "Yearly"}
                {b === "yearly" && maxYearlySavingsPct > 0 && (
                  <span className="ml-1.5 text-[10px] text-velvet">save up to {maxYearlySavingsPct}%</span>
                )}
                {b === "onetime" && <span className="ml-1.5 text-[10px] text-velvet">per event</span>}
              </button>
            );
          })}
        </div>
        )}

        {null}
      </header>

      <section className={`mx-auto px-6 ${category === "addons" ? "max-w-7xl py-4" : "max-w-6xl py-16"}`}>
        {category === "addons" && <AddOnsShowcase />}

        {category === "projects" && (
          <div className="mb-8">
            <ProjectsPlanSection />
          </div>
        )}

        {category === "ecards" && <EcardsPlanSection />}

        {category !== "addons" && category !== "ecards" && (
          <>
        {category === "events" && billing === "monthly" && (
          <div className="mb-8 rounded-3xl bg-card p-6 ring-1 ring-velvet/20">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">Atelier free trial · one-time offer</p>
                <h2 className="mt-2 font-serif text-2xl">Try Atelier for free — 20 guests, 60 days</h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  The full Atelier suite — projects, seating, check-in, gift fund, branded links, calendar sync, imports, and the thank-you studio. No payment method required. Limited to one free trial per person. Need more guests or more time? Upgrade to Atelier any time.
                </p>
              </div>
              <button
                type="button"
                onClick={handleStartTrial}
                disabled={busy}
                className="shrink-0 rounded-full bg-velvet px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Starting…" : "Start free trial"}
              </button>
            </div>
          </div>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tiers
            .filter((t) => (t.category ?? "events") === category)
            // Remove-branding lives in the curated Add-ons grid below — avoid a duplicate tier card.
            .filter((t) => t.id !== "remove_branding_addon")
            .map((t) => {
            // PM/bundle tiers are subscription-only; hide on the onetime tab.
            const isSubscriptionOnly = t.id === "pm_solo" || t.id === "pm_studio" || t.id === "studio_collective";
            if (billing === "onetime" && isSubscriptionOnly) return null;
            // Hide tiers with no one-time price on the onetime tab (except postcard, which is free).
            if (billing === "onetime" && Number(t.price_onetime ?? 0) <= 0 && t.id !== "postcard") return null;
            // Belt & suspenders: never surface a $0 card on monthly or yearly tabs.
            if (billing === "monthly" && Number(t.price_monthly ?? 0) <= 0 && t.id !== "postcard") return null;
            if (billing === "yearly" && Number(t.price_yearly ?? 0) <= 0 && t.id !== "postcard") return null;
            // Postcard is free single-event — show ONLY on the one-time tab.
            const isPostcard = t.id === "postcard";
            if (isPostcard && billing !== "onetime") return null;

            const base = baseFor(t);
            const final = priceFor(t);
            const discounted = final < base;
            const ap = applied[t.id];
            const style =
              t.name === "Atelier" || t.id === "studio_collective"
                ? "prestigious"
                : t.popular
                  ? "popular"
                  : "default";

            return (
              <div
                key={t.id}
                id={`tier-${t.id}`}
                ref={(el) => {
                  if (el && highlight && t.id === highlight && !highlightedRef.current) {
                    highlightedRef.current = true;
                    el.scrollIntoView({ block: "center", behavior: "smooth" });
                  }
                }}
                className={`relative rounded-3xl p-8 transition ${
                  highlight === t.id ? "ring-2 ring-velvet ring-offset-2 ring-offset-paper " : ""
                }${
                  style === "popular"
                    ? "bg-ink text-paper shadow-xl ring-2 ring-velvet"
                    : style === "prestigious"
                      ? "bg-platinum text-platinum-foreground shadow-xl ring-2 ring-gold"
                      : "bg-card ring-1 ring-ink/5 hover:shadow-md"
                }`}
              >
                {style === "popular" && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-velvet px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white">
                    Most loved
                  </span>
                )}
                {style === "prestigious" && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-ink">
                    {t.id === "studio_collective" ? "Best value · 15% off" : "Prestigious"}
                  </span>
                )}
                <h2 className="font-serif text-2xl">{t.name}</h2>
                <p className={`mt-1 text-xs ${style !== "default" ? (style === "popular" ? "text-paper/60" : "text-ink/60") : "text-muted-foreground"}`}>
                  {isPostcard
                    ? "Create a beautiful event page with RSVP tracking for up to 75 guests. Share your invite link anywhere. Free forever."
                    : t.blurb}
                </p>
                <div className="mt-6 flex items-baseline gap-2">
                  {discounted && (
                    <span className={`text-lg line-through ${style === "popular" ? "text-paper/40" : style === "prestigious" ? "text-ink/30" : "text-muted-foreground"}`}>${base}</span>
                  )}
                  <span className="font-serif text-5xl font-medium">${final}</span>
                  <span className={`text-sm ${style !== "default" ? (style === "popular" ? "text-paper/60" : "text-ink/60") : "text-muted-foreground"}`}>
                    {suffixFor()}
                  </span>
                </div>
                {billing === "yearly" && t.price_monthly > 0 && (() => {
                  const copy = savingsCopy(t.price_monthly, final, "less than paying monthly");
                  return (
                    <p className={`mt-1 text-[11px] ${style === "popular" ? "text-paper/60" : style === "prestigious" ? "text-ink/60" : "text-muted-foreground"}`}>
                      Billed ${final} once a year (≈ ${(final / 12).toFixed(2)}/mo){copy ? ` · ${copy}` : ""}
                    </p>
                  );
                })()}
                {billing === "monthly" && t.price_yearly > 0 && (() => {
                  const copy = savingsCopy(t.price_monthly, t.price_yearly, "off when billed annually");
                  if (!copy) return null;
                  return (
                    <p className={`mt-1 text-[11px] ${style === "popular" ? "text-paper/60" : style === "prestigious" ? "text-ink/60" : "text-muted-foreground"}`}>
                      Save {copy}
                    </p>
                  );
                })()}
                {billing === "onetime" && (
                  <div className={`mt-1 space-y-0.5 text-[11px] ${style === "popular" ? "text-paper/60" : style === "prestigious" ? "text-ink/60" : "text-muted-foreground"}`}>
                    <p>Single event · attaches to one event of your choice · no subscription</p>
                    <p>Access window: event date + 90 days, up to 12 months from purchase.</p>
                    {t.id === "atelier" && <p>Includes 150 AI generations per pass (fair-use cap).</p>}
                    {(t.id === "host" || t.id === "atelier") && (
                      <p className="italic">Hosting more than one event a year? A subscription is a better deal.</p>
                    )}
                  </div>
                )}
                <ul className="mt-6 space-y-3">
                  {(isPostcard
                    ? [
                        "1 event, up to 75 guests",
                        "Shareable invite link (copy & paste anywhere)",
                        "Email invitations included",
                        "RSVP tracking",
                        "Potluck \u201cwhat to bring\u201d sheet \u2014 free on every plan",
                        "Guest search & filters",
                        "Manual guest add",
                        "Basic event editing (title, date, location)",
                        "Powered by The Kenroe Collective (watermark)",
                      ]
                    : t.features
                  ).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <span className={style === "prestigious" ? "text-gold" : "text-velvet"}>✓</span>
                      <span className={style === "popular" ? "text-paper/85" : style === "prestigious" ? "text-ink/85" : "text-ink/80"}>{f}</span>
                    </li>
                  ))}
                </ul>


                {base > 0 && (
                  <div className="mt-6 space-y-1">
                    <div className="flex gap-2">
                      <input
                        value={promoInput[t.id] || ""}
                        onChange={(e) => setPromoInput({ ...promoInput, [t.id]: e.target.value })}
                        placeholder="Promo code"
                        className={`min-w-0 flex-1 rounded-full px-3 py-1.5 text-xs ${
                          style === "popular"
                            ? "bg-paper/10 text-paper placeholder:text-paper/40"
                            : style === "prestigious"
                              ? "bg-white/60 text-ink placeholder:text-ink/40"
                              : "bg-secondary text-ink"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => tryPromo(t.id)}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                          style === "popular"
                            ? "bg-paper text-ink"
                            : style === "prestigious"
                              ? "bg-ink text-paper"
                              : "bg-ink text-paper"
                        }`}
                      >
                        Apply
                      </button>
                    </div>
                    {ap && "error" in ap && <p className="text-[10px] text-red-400">{ap.error}</p>}
                    {ap && "percent_off" in ap && (
                      <p className={`text-[10px] ${style === "popular" ? "text-paper/70" : style === "prestigious" ? "text-ink/70" : "text-velvet"}`}>
                        Code applied {ap.percent_off ? `· ${ap.percent_off}% off` : ap.amount_off ? `· $${ap.amount_off} off` : ""}
                      </p>
                    )}
                  </div>
                )}

                {isPostcard ? (
                  <Link
                    to="/events/new"
                    className={`mt-6 block rounded-full py-3 text-center text-sm font-medium transition bg-velvet/10 text-velvet hover:bg-velvet/20`}
                  >
                    Start free
                  </Link>
                ) : (
                  <Link
                    to="/checkout"
                    search={{
                      price: priceIdFor(t),
                      ...(ap && "percent_off" in ap && promoInput[t.id]?.trim() ? { code: promoInput[t.id].trim().toUpperCase() } : {}),
                      ...(next ? { next } : {}),
                    }}
                    className={`mt-6 block rounded-full py-3 text-center text-sm font-medium transition ${
                      style === "popular"
                        ? "bg-velvet text-white hover:opacity-90"
                        : style === "prestigious"
                          ? "bg-ink text-paper hover:opacity-90"
                          : "bg-velvet/10 text-velvet hover:bg-velvet/20"
                    }`}
                  >
                    Choose {t.name}
                  </Link>
                )}
                {isPostcard ? (
                  <p className="mt-3 text-center text-[10px] text-muted-foreground">
                    No card required. Branded with The Kenroe Collective.
                  </p>
                ) : (
                  <>
                    <p className={`mt-3 text-center text-[10px] ${style === "popular" ? "text-paper/50" : style === "prestigious" ? "text-ink/50" : "text-muted-foreground"}`}>
                      A $1.50 processing fee applies at checkout.
                    </p>
                    <p className={`mt-1 text-center text-[10px] ${style === "popular" ? "text-paper/50" : style === "prestigious" ? "text-ink/50" : "text-muted-foreground"}`}>
                      {billing === "onetime"
                        ? "One-time payment — no subscription, all sales final."
                        : billing === "monthly"
                          ? "Billed monthly — cancel any time. All sales final, no refunds."
                          : "Billed once a year — cancel any time before renewal. All sales final, no refunds."}
                    </p>
                    {billing !== "onetime" && (
                      <Link
                        to="/contact"
                        className={`mt-2 block text-center text-xs font-medium transition hover:underline ${
                          style === "popular" ? "text-paper/60" : style === "prestigious" ? "text-ink/60" : "text-muted-foreground"
                        }`}
                      >
                        Contact support
                      </Link>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {category === "events" && <GuestManagementSection />}

        <div className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
          <span>Secure checkout via Stripe</span>
          <span>·</span>
          <span>No hidden fees</span>
          <span>·</span>
          <span>Branded receipt by email</span>
          <span>·</span>
          <span>{category === "projects" ? "Works with or without an event plan" : "Loved by editorial hosts"}</span>
        </div>

        <div className="mx-auto mt-6 max-w-xl text-center">
          <p className="text-xs text-muted-foreground">
            We believe in keeping things simple. Subscriptions can be cancelled at any time with no hassle. Because our services are delivered immediately upon purchase, all sales are final and we do not issue refunds. If you have questions, our support team is happy to help.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Have questions?{" "}
            <Link to="/faq" hash="pricing" className="font-medium text-velvet hover:underline">
              See our FAQ
            </Link>
            .
          </p>
        </div>
          </>
        )}
      </section>

      <SiteFooter />
    </div>
  );
}

/**
 * Guest management & day-of band. These features are all built and gated in
 * code (co-host seats: TIER_LIMITS.*.collaboratorSeats, shirt pricing and
 * payment tracking: Host+, walk-ins: Atelier day-of toolkit, potluck: free on
 * every plan) but were advertised nowhere. Keep the numbers reading from
 * TIER_LIMITS so a tier edit can never drift from the marketing copy.
 */
function GuestManagementSection() {
  const seats = [
    { name: TIERS.postcard.name, seats: TIER_LIMITS.postcard.collaboratorSeats },
    { name: TIERS.whisper.name, seats: TIER_LIMITS.whisper.collaboratorSeats },
    { name: TIERS.host.name, seats: TIER_LIMITS.host.collaboratorSeats },
    { name: TIERS.atelier.name, seats: TIER_LIMITS.atelier.collaboratorSeats },
  ];
  return (
    <div className="mt-14 rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
        Guest management & day-of
      </p>
      <h2 className="mt-1 font-serif text-2xl leading-tight sm:text-3xl">
        You don&rsquo;t have to host alone.
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Invite a co-host to edit the event with you, or a viewer who can watch the guest list
        without changing anything. Seats come from your plan, invitations expire after{" "}
        {COLLABORATOR_INVITE_TTL_DAYS} days, and you can swap who holds a seat any time.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {seats.map((t) => (
          <div key={t.name} className="rounded-2xl bg-secondary/50 px-4 py-3 ring-1 ring-ink/5">
            <p className="text-xs font-medium text-ink">{t.name}</p>
            <p className="mt-0.5 font-serif text-2xl">
              {t.seats === 0 ? "—" : t.seats}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t.seats === 0
                ? "Solo hosting"
                : `co-host or viewer seat${t.seats === 1 ? "" : "s"}`}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            title: "Potluck “what to bring” sheet",
            tag: "Free on every plan",
            body:
              "Post the dishes you need, guests claim a slot from their phone, and nobody brings a third potato salad. No plan required — it works on Postcard.",
          },
          {
            title: "T-shirt sizes, priced as a line item",
            tag: "Host & Atelier",
            body:
              "Collect a size for every guest and plus-one, charge per shirt, and let guests order spares. Totals roll straight into what each guest owes.",
          },
          {
            title: "Payment tracking & reconciliation",
            tag: "Host & Atelier",
            body:
              "See who has paid, who is short, and what is outstanding per guest, with a reconciliation report you can export.",
          },
          {
            title: "Walk-in check-in at the door",
            tag: "Atelier",
            body:
              "Scan guests in, add walk-ins who never RSVP’d, and watch live attendance climb as the room fills.",
          },
          {
            title: "Guest search & filters",
            tag: "Free on every plan",
            body:
              "Search by name or email and filter by RSVP status, dietary needs, missing shirt size, plus-ones, or payment status.",
          },
          {
            title: "Dietary & accessibility notes",
            tag: "Free on every plan",
            body:
              "Guests tell you what they need when they RSVP, and it shows up on the guest list and in every event report.",
          },
        ].map((c) => (
          <div key={c.title} className="rounded-2xl bg-secondary/40 p-4 ring-1 ring-ink/5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-velvet">{c.tag}</p>
            <h3 className="mt-1 text-sm font-medium text-ink">{c.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddOnsShowcase() {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const previewTier = usePreviewTier();

  useEffect(() => {
    let active = true;
    getEntitlements()
      .then((e) => { if (active) setEntitlements(e); })
      .catch(() => { /* silent — falls back to default CTA */ });
    return () => { active = false; };
  }, [previewTier]);

  return (
    <div className="rounded-3xl bg-card p-5 ring-1 ring-ink/5 sm:p-6">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">Add-ons</p>
          <h2 className="mt-1 font-serif text-2xl leading-tight sm:text-3xl">Choose only the extras your event needs.</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Add-ons are plan-aware, so checkout shows what is included, what Host can unlock, and what requires an upgrade. Every event has its own <span className="font-medium text-ink">Add-ons</span> section, so you'll never have to hunt. <Link to="/events" className="underline">Open my events</Link>.
          </p>
        </div>
        <div className="hidden rounded-2xl bg-secondary/50 px-4 py-3 text-xs text-muted-foreground ring-1 ring-ink/5 lg:block lg:max-w-xs">
          Checkout stays secure, plan-aware, and guided so customers see what is included, what can be added, and what requires an upgrade.
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {ADDONS.map((a) => (
          <AddOnCard key={a.id} addon={a} entitlements={entitlements} />
        ))}
      </div>
    </div>
  );
}

/**
 * Framing band above the Projects plan card. Projects (The Workroom) is its own
 * venture, not an event add-on, so this section carries the venture story and
 * the seat/contact path; purchasing stays on the plan card below.
 */
function ProjectsPlanSection() {
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const previewTier = usePreviewTier();

  useEffect(() => {
    let active = true;
    getEntitlements()
      .then((e) => { if (active) setEntitlements(e); })
      .catch(() => { /* silent — copy below is static */ });
    return () => { active = false; };
  }, [previewTier]);

  return (
    <div className="venture-projects rounded-3xl bg-card p-5 ring-1 ring-velvet/20 sm:p-6">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
        Venture 03 · Projects
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-3">
        <h2 className="font-serif text-2xl leading-tight sm:text-3xl">
          The Workroom — plan the work, not just the party.
        </h2>
        {entitlements?.hasPmAddon && (
          <span className="rounded-full bg-velvet/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-velvet">
            ✓ Active on your account
          </span>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        A full project workspace: boards, tasks, due dates, comments, attachments and
        collaborator roles. It stands on its own — no event plan required — and links to a
        gathering when you want it to.
      </p>
      <ul className="mt-3 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
        <li>Kanban board with drag-and-drop</li>
        <li>Comments, attachments and notes</li>
        <li>{PM_ADDON_SEAT_LIMITS.postcard} collaborator seats included</li>
        <li>{PM_ADDON_SEAT_LIMITS.atelier} seats on Atelier</li>
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        <Link to="/workroom" className="text-velvet underline underline-offset-2">
          See what Projects does
        </Link>
        {" · "}Bigger team?{" "}
        <Link to="/contact" className="underline underline-offset-2">Talk to us</Link> and
        we'll open up more seats — there's nothing extra to buy.
      </p>
    </div>
  );
}

/**
 * Group eCards (Venture 02) pricing. Deliberately NOT a tier or subscription:
 * cards are free to create and collect, and the single per-card fee is charged
 * at the send step through the existing Stripe checkout. The amount is read
 * from src/lib/ecards-pricing.ts so this panel, the eCards landing and the
 * Stripe lookup key can never drift apart.
 */
function EcardsPlanSection() {
  return (
    <div className="venture-ecards rounded-3xl bg-card p-5 ring-1 ring-velvet/20 sm:p-6">

      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
        Venture 02 · Group eCards
      </p>
      <div className="mt-1 flex flex-wrap items-baseline gap-3">
        <h2 className="font-serif text-2xl leading-tight sm:text-3xl">
          {ECARD_SEND_PRICE_LABEL} per card, unlimited contributors
        </h2>
        <span className="rounded-full bg-velvet/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-velvet">
          Free to start
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        No plan, no subscription. Create the card, share one link, and collect messages from as
        many people as you like for free. You only pay {ECARD_SEND_PRICE_LABEL} when you choose to
        send it to the recipient.
      </p>
      <ul className="mt-3 grid gap-1.5 text-xs text-muted-foreground sm:grid-cols-2">
        <li>Unlimited messages, GIFs, photos and video</li>
        <li>AI "help me write" for contributors</li>
        <li>Scheduled reveal-day delivery by email</li>
        <li>Organizer moderation before the reveal</li>
        <li>Permanent keepsake page</li>
        <li>Priced per card, never per month</li>
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          to="/ecards/new"
          className="rounded-full bg-velvet px-6 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Start a card free
        </Link>
        <Link to="/ecards" className="text-xs font-medium text-velvet underline underline-offset-2">
          See how Group eCards works
        </Link>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Payment happens at the send step, through the same secure Stripe checkout. No processing fee
        is added, so the total is exactly {ECARD_SEND_PRICE_LABEL}. All sales are final once you
        send, so there are no refunds after a card goes out.
      </p>
    </div>
  );
}

function AddOnCard({ addon, entitlements }: { addon: AddOn; entitlements: Entitlements | null }) {
  const navigate = useNavigate();

  const override = addon.resolve?.(entitlements) ?? null;
  const ownedDestination = override?.included ? addon.open : undefined;
  const label = ownedDestination?.label ?? override?.label ?? addon.cta.label;
  const disabled = override?.disabled && !ownedDestination;

  function handleClick() {
    if (ownedDestination) {
      navigate({ to: ownedDestination.to as never, search: ownedDestination.search as never });
      return;
    }
    if (override?.disabled) return;
    if (override?.upgradeTo) {
      navigate({ to: "/pricing", search: { category: "events" } as any });
      return;
    }
    if (addon.cta.href) {
      navigate({ to: addon.cta.href.to as any, search: addon.cta.href.search as any });
      return;
    }
    if (addon.cta.priceId) {
      navigate({ to: "/checkout", search: { price: addon.cta.priceId } as any });
    }
  }

  return (
    <div className="flex min-h-[14.5rem] flex-col rounded-2xl bg-secondary/40 p-4 ring-1 ring-ink/5 xl:min-h-[15.5rem]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-velvet">{addon.tag}</div>
          <div className="mt-1 font-serif text-base leading-tight">{addon.name}</div>
        </div>
        {override?.included && (
          <span className="shrink-0 rounded-full bg-velvet/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-velvet">✓ Included</span>
        )}
      </div>
      <div className="mt-1 text-sm font-medium text-velvet">{addon.price}</div>
      <p className="mt-2 flex-1 text-xs leading-snug text-muted-foreground">{addon.blurb}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-center text-xs font-medium text-paper hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {label}
      </button>
    </div>
  );
}

