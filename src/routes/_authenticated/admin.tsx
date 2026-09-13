import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { claimFirstAdmin, meIsAdmin, meIsOwner, getPublicTiers, type PricingTier } from "@/lib/pricing.functions";
import { AnnouncementsPanel } from "@/components/admin/announcements-panel";
import { RecentUpdatesReport } from "@/components/admin/recent-updates-report";
import { PaymentReconciliationPanel } from "@/components/admin/payment-reconciliation-panel";
import { GuestNeedsPanel } from "@/components/admin/guest-needs-panel";
import { SkeletonBlock } from "@/components/skeletons";
import { toast } from "sonner";
import { OwnerMfaGate } from "@/components/owner-mfa-gate";


export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — The Kenroe Collective" }] }),
  // Owner/super_admin accounts must satisfy mandatory TOTP MFA before any
  // owner-gated server function runs; otherwise those calls throw
  // MFA_ENROLL_REQUIRED and blank the page. Plain admins pass straight through.
  component: () => (
    <OwnerMfaGate>
      <AdminPage />
    </OwnerMfaGate>
  ),
});


function AdminPage() {
  const checkAdmin = useServerFn(meIsAdmin);
  const checkOwner = useServerFn(meIsOwner);
  const claim = useServerFn(claimFirstAdmin);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    checkAdmin().then((r) => setIsAdmin(r.isAdmin));
    checkOwner().then((r) => setIsOwner(r.isOwner)).catch(() => setIsOwner(false));
  }, [checkAdmin, checkOwner]);

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="font-serif text-3xl">Admin access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You're signed in but not an admin yet. If you're the first user, you can claim admin.
          </p>
          <button
            onClick={async () => {
              const r = await claim();
              if (r.claimed) {
                toast.success("You are now admin.");
                setIsAdmin(true);
              } else toast.error("An admin already exists. Ask them to grant you access.");
            }}
            className="mt-6 rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Claim admin
          </button>
          <p className="mt-6 text-xs">
            <Link to="/gatherings" className="text-muted-foreground hover:underline">Back home</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-4xl">
              Admin dashboard
              {isOwner && <span className="ml-3 align-middle rounded-full bg-velvet/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-velvet">Owner</span>}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Day-to-day operations. Site settings, pricing, and support inbox live in the Owner console.</p>
          </div>
          <div className="flex flex-wrap gap-2">
          <Link
            to="/reports"
            search={{ event: undefined, open: undefined }}
            className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-paper hover:bg-velvet"
          >
            Reports hub →
          </Link>
          {isOwner && (
            <Link to="/owner" search={{ tab: undefined }} className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white hover:opacity-90">
              Open Owner console →
            </Link>
          )}
          </div>
        </div>
        <TierPreviewPanel />
        <GuestNeedsPanel />
        <PaymentReconciliationPanel />
        <RecentUpdatesReport limit={5} />
        <AnnouncementsPanel />
      </div>
      <SiteFooter />
    </div>
  );
}

function TierPreviewPanel() {
  const fetchTiers = useServerFn(getPublicTiers);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    fetchTiers().then((rows) => {
      setTiers(rows);
      if (rows[0]) setActiveId((curr) => curr ?? rows[0].id);
    });
  }, [fetchTiers]);

  const active = tiers.find((t) => t.id === activeId) ?? null;

  return (
    <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-serif text-2xl">Tier preview</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Toggle between live pricing tiers to verify what each plan includes. Reflects exactly what customers see on /pricing.
          </p>
        </div>
        <Link to="/pricing" className="text-xs text-velvet hover:underline">View public pricing →</Link>
      </div>

      {tiers.length === 0 ? (
        <div className="mt-5">
          <div className="inline-flex gap-1 rounded-full bg-secondary p-1 ring-1 ring-ink/10">
            <SkeletonBlock className="h-7 w-20 rounded-full" />
            <SkeletonBlock className="h-7 w-20 rounded-full" />
            <SkeletonBlock className="h-7 w-20 rounded-full" />
          </div>
          <SkeletonBlock className="mt-4 h-40 w-full" />
        </div>
      ) : (
        <>
          <div className="mt-5 inline-flex flex-wrap gap-1 rounded-full bg-secondary p-1 ring-1 ring-ink/10">
            {tiers.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  activeId === t.id ? "bg-paper text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
                }`}
              >
                {t.name}
                <span className="ml-1.5 text-[10px] text-velvet">${t.price_monthly}</span>
              </button>
            ))}
          </div>

          {active && (
            <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_2fr]">
              <div className="rounded-2xl bg-secondary/40 p-5 ring-1 ring-ink/5">
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">{active.popular ? "Most loved" : active.id === "atelier" ? "Prestigious" : "Tier"}</div>
                <h3 className="mt-2 font-serif text-2xl">{active.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{active.blurb}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-serif text-4xl">${active.price_monthly}</span>
                  <span className="text-xs text-muted-foreground">{active.id === "free" ? "one-time" : "/mo"}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                  <dt className="text-muted-foreground">ID</dt><dd className="font-mono">{active.id}</dd>
                  <dt className="text-muted-foreground">Sort</dt><dd>{active.sort_order}</dd>
                  <dt className="text-muted-foreground">Active</dt><dd>{active.active ? "Yes" : "No"}</dd>
                  <dt className="text-muted-foreground">Popular</dt><dd>{active.popular ? "Yes" : "No"}</dd>
                  <dt className="text-muted-foreground">Features</dt><dd>{active.features.length}</dd>
                </dl>
              </div>
              <div className="rounded-2xl bg-paper p-5 ring-1 ring-ink/5">
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">What's included</div>
                {active.features.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">No features listed for this tier.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {active.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-velvet">✓</span>
                        <span className="text-ink/85">{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
