import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { TIERS, TIER_LIMITS, getEffectiveProjectSeats, type TierKey } from "@/lib/tier-config";
import { getEntitlements, type Entitlements, type Tier } from "@/lib/entitlements-client";
import { usePreviewTier } from "@/lib/preview-tier";
import { useSubscription } from "@/hooks/use-subscription";
import { sharedEventRole, useEvents } from "@/lib/events-store";
import { listMyPasses, type OneTimePass } from "@/lib/one-time-passes.functions";
import { createPortalSession, cancelSubscriptionAtPeriodEnd } from "@/lib/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { GRANTED_PLAN_NOTICE } from "@/lib/granted-plan";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Sparkles, X } from "lucide-react";
import { formatStampDate } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/settings/billing")({
  head: () => ({
    meta: [
      { title: "Billing & plan — The Kenroe Collective" },
      { name: "description", content: "Review your plan, usage, and manage billing for The Kenroe Collective." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BillingPage,
});

const TIER_KEYS: TierKey[] = ["postcard", "whisper", "host", "atelier"];
const TIER_RANK: Record<TierKey, number> = { postcard: 0, whisper: 1, host: 2, atelier: 3 };

const TIER_BADGE: Record<TierKey, string> = {
  postcard: "bg-secondary text-ink",
  whisper: "bg-blush text-ink",
  host: "bg-velvet text-white",
  atelier: "bg-ink text-gold",
};

type Cycle = "monthly" | "yearly" | "oneTime";

function fmtLimit(n: number): string {
  return Number.isFinite(n) ? String(n) : "Unlimited";
}

function BillingPage() {
  const [tier, setTier] = useState<Tier>("postcard");
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [entLoading, setEntLoading] = useState(true);
  const events = useEvents();
  const { subscription, isActive, isGranted, loading: subLoading } = useSubscription();
  const [passes, setPasses] = useState<OneTimePass[]>([]);
  const [passesLoading, setPassesLoading] = useState(true);
  const listPasses = useServerFn(listMyPasses);
  const portal = useServerFn(createPortalSession);
  const cancelAtPeriodEnd = useServerFn(cancelSubscriptionAtPeriodEnd);
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [downgradeTarget, setDowngradeTarget] = useState<TierKey | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const previewTier = usePreviewTier();

  useEffect(() => {
    let ok = true;
    getEntitlements()
      .then((e) => { if (ok) { setTier(e.tier); setEnt(e); } })
      .catch(() => {})
      .finally(() => { if (ok) setEntLoading(false); });
    return () => { ok = false; };
  }, [previewTier]);

  useEffect(() => {
    let ok = true;
    listPasses({})
      .then((rows) => { if (ok) setPasses(rows as OneTimePass[]); })
      .catch(() => {})
      .finally(() => { if (ok) setPassesLoading(false); });
    return () => { ok = false; };
  }, [listPasses]);

  const tierData = TIERS[tier];
  const limits = TIER_LIMITS[tier];

  // Live usage. Events shared WITH me are drawn from the host's allowance, not
  // mine, so they must never inflate my own meters.
  const ownedEvents = useMemo(() => events.filter((e) => !sharedEventRole(e.id)), [events]);
  const activeEventsCount = ownedEvents.length;
  const guestTotals = useMemo(() => {
    const perEvent = ownedEvents.map((e) => ({ id: e.id, title: e.title, count: e.guests?.length ?? 0 }));
    const overCap = perEvent.filter((e) => Number.isFinite(limits.guestsPerEvent) && e.count > limits.guestsPerEvent).length;
    return { perEvent, overCap };
  }, [ownedEvents, limits.guestsPerEvent]);

  const activePassAi = passes
    .filter((p) => !p.revoked_at && new Date(p.expires_at) > new Date())
    .reduce(
      (acc, p) => ({ used: acc.used + (p.ai_generations_used ?? 0), cap: acc.cap + (p.ai_generations_cap ?? 0) }),
      { used: 0, cap: 0 },
    );

  async function openPortal() {
    setPortalBusy(true);
    try {
      const env = getStripeEnvironment();
      const r = await portal({ data: { environment: env, returnUrl: window.location.href } });
      if ("error" in r) {
        setBanner(r.error);
        return;
      }
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setBanner((e as Error).message);
    } finally {
      setPortalBusy(false);
    }
  }

  async function confirmDowngrade(target: TierKey) {
    setDowngradeTarget(null);
    if (target === "postcard") {
      // Postcard is a $0 tier with no Stripe price object, so it can never
      // appear as a selectable plan in Stripe's portal — a host downgrading
      // to it landed in the portal with nothing to pick. "Downgrade to
      // Postcard" IS a cancellation; route it the same way the Cancel
      // subscription button does instead of sending them to a dead end.
      await performCancelAtPeriodEnd(
        "Your plan will remain active until the end of the current billing period, then move to Postcard.",
      );
      return;
    }
    // Downgrading to another paid tier (e.g. Host -> Whisper) is a real
    // plan switch Stripe's portal supports natively.
    await openPortal();
  }

  async function performCancelAtPeriodEnd(successMessage: string, opts?: { closeConfirmCancel?: boolean }) {
    setCancelBusy(true);
    try {
      const env = getStripeEnvironment();
      const r = await cancelAtPeriodEnd({ data: { environment: env } });
      if ("error" in r) setBanner(r.error ?? "Could not update your plan — please try again.");
      else setBanner(successMessage);
    } catch (e) {
      setBanner((e as Error).message);
    } finally {
      setCancelBusy(false);
      if (opts?.closeConfirmCancel) setConfirmCancel(false);
    }
  }

  async function onCancelSubscription() {
    await performCancelAtPeriodEnd("Your subscription will end at the end of the current billing period.", {
      closeConfirmCancel: true,
    });
  }

  const subStatusLabel = (() => {
    if (subLoading) return "Loading…";
    // Stripe keeps status "active"/"trialing" for the whole remaining period
    // after an at-period-end cancellation — check cancel_at_period_end first
    // or this branch never shows, leaving the badge stuck on "Active"/"Trial"
    // for the entire notice period.
    if (isActive && subscription?.cancel_at_period_end) return "Canceling — ends at period end";
    if (isActive && subscription?.status === "trialing") return "Trial";
    if (isActive && subscription?.status === "active") return "Active";
    if (isActive && subscription?.status === "past_due") return "Payment past due";
    if (subscription?.status === "canceled") return "Ends at period end";
    if (passes.some((p) => !p.revoked_at && new Date(p.expires_at) > new Date())) return "One-time pass";
    return "Free (Postcard)";
  })();

  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />

      <section className="border-b border-ink/5 py-10">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-[10px] uppercase tracking-widest text-velvet">Settings</p>
          <h1 className="mt-2 font-serif text-4xl">Billing &amp; plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Review your usage, compare plans, and manage payment details.
            <Link to="/profile" search={{ tab: undefined }} className="ml-2 underline">Back to profile</Link>
          </p>

          {/* Header card */}
          <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl bg-secondary p-5">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${TIER_BADGE[tier]}`}>
              {entLoading ? "…" : tierData.name}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">{subStatusLabel}</div>
              <div className="text-xs text-muted-foreground">
                {periodEnd
                  ? `${subscription?.cancel_at_period_end ? "Ends" : "Renews"} on ${formatStampDate(periodEnd)}`
                  : "No active subscription"}
              </div>
            </div>
            {isGranted ? (
              <span className="max-w-xs text-xs text-muted-foreground">
                Granted plan — nothing to pay and no billing to manage.
              </span>
            ) : subscription?.stripe_customer_id ? (
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={portalBusy}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
              >
                {portalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                Manage in Stripe
              </button>
            ) : null}
          </div>

          {banner && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-blush/40 p-3 text-sm text-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">{banner}</div>
              <button type="button" onClick={() => setBanner(null)} className="text-ink/60 hover:text-ink" aria-label="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Usage meters */}
      <section className="py-10">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="font-serif text-2xl">Usage this period</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Meter label="Active events" used={activeEventsCount} cap={limits.activeEvents} />
            <Meter
              label="Guests per event (max)"
              used={guestTotals.perEvent.reduce((m, e) => Math.max(m, e.count), 0)}
              cap={limits.guestsPerEvent}
              hint={guestTotals.overCap > 0 ? `${guestTotals.overCap} event${guestTotals.overCap === 1 ? "" : "s"} over the cap` : undefined}
            />
            <Meter label="SMS reminders / event" used={0} cap={limits.smsRemindersPerEvent} hint="Per event allowance" />
            <Meter
              label="AI generations (passes)"
              used={activePassAi.used}
              cap={tier === "atelier" ? Number.POSITIVE_INFINITY : activePassAi.cap || 0}
              hint={tier === "atelier" ? "Unlimited on Atelier" : undefined}
            />
            {(() => {
              const hasPmAddon = !!ent?.hasPmAddon;
              const isOwnerAcct = !!ent?.isOwner && !ent?.previewing;
              const cap = isOwnerAcct ? 20 : getEffectiveProjectSeats(tier as TierKey, hasPmAddon);
              const hasAccess = hasPmAddon || isOwnerAcct;
              return (
                <Meter
                  label="Project seats"
                  used={0}
                  cap={cap}
                  hint={
                    hasAccess
                      ? isOwnerAcct
                        ? "Owner access"
                        : "Included with your PM add-on"
                      : "0 — add Project Management"
                  }
                />
              );
            })()}
          </div>
        </div>
      </section>

      {/* Plan comparison */}
      <section className="border-t border-ink/5 py-10">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl">Compare plans</h2>
              <p className="text-sm text-muted-foreground">Every feature and price comes from a single source — updated centrally.</p>
            </div>
            <div className="inline-flex rounded-full bg-secondary p-1 text-xs">
              {(["monthly", "yearly", "oneTime"] as Cycle[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  className={`rounded-full px-4 py-1.5 font-medium capitalize transition ${
                    cycle === c ? "bg-paper text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
                  }`}
                >
                  {c === "oneTime" ? "One-time" : c}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            {TIER_KEYS.map((key) => {
              const t = TIERS[key];
              const isCurrent = key === tier;
              const isHigher = TIER_RANK[key] > TIER_RANK[tier as TierKey];
              const isLower = TIER_RANK[key] < TIER_RANK[tier as TierKey];
              const priceLabel = (() => {
                if (cycle === "monthly") return t.monthlyPrice === 0 ? "Free" : `$${t.monthlyPrice}/mo`;
                if (cycle === "yearly") return t.yearlyPrice === 0 ? "Free" : `$${t.yearlyPrice}/yr`;
                return t.oneTimePrice ? `$${t.oneTimePrice}` : "—";
              })();
              const yearlySavings = t.monthlyPrice > 0 && cycle === "yearly"
                ? Math.round((1 - t.yearlyPrice / (t.monthlyPrice * 12)) * 100)
                : 0;
              return (
                <div
                  key={key}
                  className={`relative rounded-2xl border p-5 ${
                    isCurrent ? "border-velvet bg-velvet/5" : "border-ink/10 bg-paper"
                  }`}
                >
                  {key === "host" && (
                    <span className="absolute -top-2 left-4 rounded-full bg-velvet px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Most popular</span>
                  )}
                  {key === "atelier" && (
                    <span className="absolute -top-2 left-4 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold">Best value</span>
                  )}
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TIER_BADGE[key]}`}>{t.name}</span>
                    {isCurrent && <span className="text-[10px] font-medium uppercase tracking-wider text-velvet">Current</span>}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-serif text-3xl">{priceLabel}</span>
                    {yearlySavings > 0 && (
                      <span className="rounded-full bg-blush px-1.5 py-0.5 text-[10px] font-medium text-ink">Save {yearlySavings}%</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{cycle === "oneTime" ? "Single event" : t.tagline}</p>

                  <ul className="mt-4 space-y-1.5 text-xs text-ink">
                    {t.features.slice(0, 8).map((f) => (
                      <li key={f} className="flex items-start gap-1.5">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-velvet" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5">
                    {isCurrent ? (
                      <button
                        type="button"
                        disabled
                        className="w-full rounded-full bg-secondary px-4 py-2 text-xs font-medium text-ink/60"
                      >
                        Your plan
                      </button>
                    ) : isHigher ? (
                      <Link
                        to="/pricing"
                        className="block w-full rounded-full bg-velvet px-4 py-2 text-center text-xs font-medium text-white hover:opacity-90"
                      >
                        Upgrade to {t.name}
                      </Link>
                    ) : isLower ? (
                      <button
                        type="button"
                        onClick={() => setDowngradeTarget(key)}
                        className="w-full rounded-full border border-ink/15 bg-paper px-4 py-2 text-xs font-medium text-ink hover:bg-secondary"
                      >
                        Downgrade to {t.name}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Owned account access */}
      {!entLoading && ent && (
        <section className="border-t border-ink/5 py-10">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="font-serif text-2xl">Your unlocked extras</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Account unlocks work across every event. Per-event extras apply only to the event where they were purchased.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ent.brandingRemovedByTier ? { name: "Branding removed", detail: "Included on every event with your plan", label: "Open my events", to: "/events", search: undefined } : null,
                ent.canImportGuests ? { name: "Bulk guest list import", detail: ent.guestImportPaid ? "One-time account unlock" : "Included with Atelier", label: "Choose an event to import", to: "/events", search: undefined } : null,
                ent.canUseThankYouStudio ? { name: "Thank-you cards studio", detail: ent.thankYouCardsPaid ? "One-time account unlock" : "Included with Atelier", label: "Choose an event", to: "/events", search: undefined } : null,
                ent.hasSmsReminders ? { name: "SMS reminders", detail: ent.smsPackPaid ? "One-time account unlock" : "Included with your plan", label: "Choose an event", to: "/events", search: undefined } : null,
                ent.hasConverter ? { name: "Media Converter", detail: ent.converterPaid ? "One-time account unlock" : "Included with Atelier", label: "Open Media Converter", to: "/tools/converter", search: undefined } : null,
              ].filter((item): item is NonNullable<typeof item> => item !== null).map((item) => (
                <div key={item.name} className="flex min-h-40 flex-col rounded-xl border border-ink/10 bg-paper p-4">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-velvet">Unlocked</span>
                  <h3 className="mt-1 text-sm font-medium text-ink">{item.name}</h3>
                  <p className="mt-1 flex-1 text-xs text-muted-foreground">{item.detail}</p>
                  <Link
                    to={item.to as never}
                    search={item.search as never}
                    className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90"
                  >
                    {item.label}
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              One-time account unlocks remain yours. Plan-included access ends with the plan, without deleting work you already made.
            </p>
          </div>
        </section>
      )}

      {/* Active passes */}
      {!passesLoading && passes.length > 0 && (
        <section className="border-t border-ink/5 py-10">
          <div className="mx-auto max-w-5xl px-6">
            <h2 className="font-serif text-2xl">One-time passes</h2>
            <div className="mt-4 space-y-3">
              {passes.map((p) => {
                const expired = new Date(p.expires_at) <= new Date();
                const remaining = (p.ai_generations_cap ?? 0) - (p.ai_generations_used ?? 0);
                const purchasedMs = new Date(p.purchased_at).getTime();
                const withinRefund = Date.now() - purchasedMs < 24 * 60 * 60 * 1000;
                const refundEligible = withinRefund && !p.first_material_use_at && !p.refunded_at;
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-ink/10 bg-paper p-4">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TIER_BADGE[p.tier as TierKey]}`}>
                      {TIERS[p.tier as TierKey].name} pass
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <div className="font-medium text-ink">
                        {p.event_id ? `Attached to event ${p.event_id.slice(0, 8)}…` : "Unattached — attach to an event"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {expired ? "Expired" : `Expires ${formatStampDate((p.expires_at))}`}
                        {p.ai_generations_cap != null && <> · AI credits: {Math.max(0, remaining)}/{p.ai_generations_cap}</>}
                      </div>
                    </div>
                    <div className="text-xs">
                      {p.refunded_at ? (
                        <span className="text-muted-foreground">Refunded</span>
                      ) : refundEligible ? (
                        <Link to="/contact" className="text-velvet underline">Refund eligible</Link>
                      ) : (
                        <span className="text-muted-foreground">Non-refundable</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Bottom links */}
      <section className="border-t border-ink/5 py-10">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="font-serif text-2xl">Manage</h2>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {isGranted ? (
              <p className="max-w-2xl text-sm text-muted-foreground">{GRANTED_PLAN_NOTICE}</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void openPortal()}
                  disabled={portalBusy || !subscription?.stripe_customer_id}
                  className="rounded-full border border-ink/15 bg-paper px-4 py-2 hover:bg-secondary disabled:opacity-40"
                >
                  Manage payment method
                </button>
                <button
                  type="button"
                  onClick={() => void openPortal()}
                  disabled={portalBusy || !subscription?.stripe_customer_id}
                  className="rounded-full border border-ink/15 bg-paper px-4 py-2 hover:bg-secondary disabled:opacity-40"
                >
                  View invoices
                </button>
              </>
            )}

            {isActive && !subscription?.cancel_at_period_end && (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="rounded-full px-4 py-2 text-xs text-ink/50 underline underline-offset-2 hover:text-ink"
              >
                Cancel subscription
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Need help? <Link to="/contact" className="underline">Contact support</Link> or ask the Concierge (bottom-right).
          </p>
        </div>
      </section>

      <SiteFooter />

      {/* Downgrade warning modal */}
      {downgradeTarget && (
        <DowngradeModal
          currentTier={tier as TierKey}
          targetTier={downgradeTarget}
          usage={{ activeEvents: activeEventsCount, maxGuests: guestTotals.perEvent.reduce((m, e) => Math.max(m, e.count), 0) }}
          onCancel={() => setDowngradeTarget(null)}
          onConfirm={() => void confirmDowngrade(downgradeTarget)}
        />
      )}

      {/* Cancel confirmation */}
      {confirmCancel && (
        <ConfirmDialog
          title="Cancel subscription?"
          body={
            periodEnd
              ? `Your plan will remain active until ${formatStampDate(periodEnd)}, then downgrade to Postcard.`
              : "Your plan will end at the close of the current billing period."
          }
          confirmLabel={cancelBusy ? "Cancelling…" : "Yes, cancel"}
          onConfirm={() => void onCancelSubscription()}
          onCancel={() => setConfirmCancel(false)}
          busy={cancelBusy}
        />
      )}
    </div>
  );
}

function Meter({ label, used, cap, hint }: { label: string; used: number; cap: number; hint?: string }) {
  const unlimited = !Number.isFinite(cap);
  const pct = unlimited || cap === 0 ? 0 : Math.min(100, Math.round((used / cap) * 100));
  const over = !unlimited && used > cap;
  return (
    <div className="rounded-xl border border-ink/10 bg-paper p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-sm font-medium ${over ? "text-velvet" : "text-ink"}`}>
          {used} / {unlimited ? "∞" : cap}
        </div>
      </div>
      {!unlimited && cap > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full ${over ? "bg-velvet" : pct >= 85 ? "bg-gold" : "bg-ink/70"}`}
            style={{ width: `${Math.min(100, over ? 100 : pct)}%` }}
          />
        </div>
      )}
      {hint && <div className="mt-1.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function DowngradeModal({
  currentTier,
  targetTier,
  usage,
  onCancel,
  onConfirm,
}: {
  currentTier: TierKey;
  targetTier: TierKey;
  usage: { activeEvents: number; maxGuests: number };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const target = TIERS[targetTier];
  const targetLimits = TIER_LIMITS[targetTier];
  const current = TIERS[currentTier];

  const impacts: string[] = [];
  if (Number.isFinite(targetLimits.activeEvents) && usage.activeEvents > targetLimits.activeEvents) {
    impacts.push(`You have ${usage.activeEvents} active events but ${target.name} allows ${targetLimits.activeEvents}. Extra events will become read-only.`);
  }
  if (Number.isFinite(targetLimits.guestsPerEvent) && usage.maxGuests > targetLimits.guestsPerEvent) {
    impacts.push(`Your largest event has ${usage.maxGuests} guests but ${target.name} allows ${targetLimits.guestsPerEvent} per event.`);
  }
  const targetFeatures = target.features as readonly string[];
  const featuresLost = (current.features as readonly string[]).filter((f) => !targetFeatures.includes(f));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4">
      <div className="max-w-lg w-full rounded-2xl bg-paper p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-velvet" />
          <div className="flex-1">
            <h3 className="font-serif text-xl">Downgrade to {target.name}?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Downgrades take effect at the end of your current billing period. You'll keep {current.name} features until then.
            </p>

            {impacts.length > 0 && (
              <div className="mt-4 rounded-lg bg-blush/40 p-3 text-sm">
                <div className="font-medium text-ink">Heads up — your current usage exceeds {target.name}'s limits:</div>
                <ul className="mt-1 list-disc pl-4 text-ink/80">
                  {impacts.map((i, idx) => <li key={idx}>{i}</li>)}
                </ul>
              </div>
            )}

            {featuresLost.length > 0 && (
              <div className="mt-3 text-xs">
                <div className="font-medium text-ink">You'll lose access to:</div>
                <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                  {featuresLost.slice(0, 6).map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              We'll open Stripe to schedule the change. You can cancel from there too.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-full border border-ink/15 bg-paper px-4 py-2 text-xs hover:bg-secondary">
            Keep {current.name}
          </button>
          <button type="button" onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:opacity-90">
            <Sparkles className="h-3.5 w-3.5" /> Continue in Stripe
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4">
      <div className="max-w-md w-full rounded-2xl bg-paper p-6 shadow-2xl">
        <h3 className="font-serif text-xl">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-full border border-ink/15 bg-paper px-4 py-2 text-xs hover:bg-secondary disabled:opacity-50">
            Never mind
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
