import { toUserMessage } from "@/lib/user-error";
import { useSignInRedirect } from "@/hooks/use-signin-redirect";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SkeletonPanel } from "@/components/skeletons";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { AiPackagesPanel } from "@/components/ai-packages-panel";
import { DesignStudio } from "@/components/design-studio";
import { supabase } from "@/integrations/supabase/client";
import { hasAiPackagesAccess, claimAiPackagesTrial } from "@/lib/ai-packages.functions";
import { Sparkles, Clock, Lock, CheckCircle2, Wand2, Palette } from "lucide-react";

type Tab = "compose" | "design";

export const Route = createFileRoute("/studio")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: Tab; t?: string; pg?: string } => ({
    tab: search.tab === "design" ? "design" : search.tab === "compose" ? "compose" : undefined,
    // Design Studio view state (template + page) so a refresh restores it.
    t: typeof search.t === "string" ? search.t : undefined,
    pg: typeof search.pg === "string" ? search.pg : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Atelier Studio — Compose & Design — The Kenroe Collective" },
      {
        name: "description",
        content:
          "Atelier Studio: AI composes the menu, package, or merchandise list — the Studio lays it out and exports it. Print, share, or send to a vendor.",
      },
      { property: "og:title", content: "Atelier Studio — The Kenroe Collective" },
      {
        property: "og:description",
        content:
          "One workspace to compose and design — menus, service bundles, merchandise, signage, and favors. PDF, PNG, and shareable links.",
      },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/studio" }],
  }),
  component: StudioPage,
});

function StudioPage() {
  const navigate = useNavigate();
  const { tab: tabParam } = Route.useSearch();
  const checkAccess = useServerFn(hasAiPackagesAccess);
  const claimTrial = useServerFn(claimAiPackagesTrial);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [claiming, setClaiming] = useState(false);

  // Tab is derived straight from the URL: refreshing on the Design tab keeps
  // you on Design. (The old sessionStorage seed also mismatched on hydration.)
  const tab: Tab = tabParam === "design" ? "design" : "compose";

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data.session) { setAuthed(false); return; }
      setAuthed(true);
      try {
        const a = await checkAccess({ data: {} });
        if (!alive) return;
        setHasAccess(!!a.hasAccess);
      } catch {
        if (alive) setHasAccess(false);
      }
    })();
    return () => { alive = false; };
  }, [checkAccess]);

  function switchTab(next: Tab) {
    navigate({ to: "/studio", search: (prev) => ({ ...prev, tab: next }), replace: true });
  }

  async function onStartTrial() {
    setClaiming(true);
    try {
      const r = await claimTrial({});
      if ("error" in r) { toast.error(r.error); return; }
      if (r.alreadyUsed) {
        toast.error("Your 1-day trial has already been used.");
      } else {
        toast.success("Trial started! 24 hours of full Atelier Studio access.");
        const refreshed = await checkAccess({ data: {} });
        setHasAccess(!!refreshed.hasAccess);
      }
    } catch (err) {
      toast.error(toUserMessage(err, "Could not start trial"));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <SiteNav />
      <section className="mx-auto max-w-7xl px-6 py-12">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-velvet/5 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-velvet">
            <Sparkles className="h-3 w-3" /> Atelier Studio
          </div>
          <h1 className="mt-4 font-serif text-4xl text-velvet sm:text-5xl">Compose &amp; Design</h1>
          <p className="mt-3 max-w-[60ch] font-serif text-lg text-ink/80">
            AI composes the menu, package, or merchandise list. The Studio lays it out and exports it — print, share, or
            send to a vendor. One workspace, one price, included on Atelier.
          </p>
        </header>

        {authed === false ? (
          <SignInPrompt />
        ) : authed === null || hasAccess === null ? (
          <SkeletonPanel />
        ) : hasAccess ? (
          <>
            <div className="mb-6 inline-flex items-center gap-1 rounded-full bg-secondary p-1 ring-1 ring-ink/10">
              <button
                type="button"
                onClick={() => switchTab("compose")}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  tab === "compose" ? "bg-paper text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
                }`}
              >
                <Wand2 className="h-3.5 w-3.5" /> Compose
              </button>
              <button
                type="button"
                onClick={() => switchTab("design")}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                  tab === "design" ? "bg-paper text-ink shadow-sm" : "text-muted-foreground hover:text-ink"
                }`}
              >
                <Palette className="h-3.5 w-3.5" /> Design
              </button>
            </div>

            {tab === "compose" ? <AiPackagesPanel /> : <DesignStudio />}
          </>
        ) : (
          <UpsellPanel claiming={claiming} onStartTrial={onStartTrial} onUpgrade={() => navigate({ to: "/pricing" })} />
        )}
      </section>
      <SiteFooter />
    </div>
  );
}

function SignInPrompt() {
  const signInSearch = useSignInRedirect();
  return (
    <div className="rounded-2xl bg-secondary/40 p-8 ring-1 ring-ink/5">
      <h2 className="font-serif text-2xl text-ink">Sign in to open Atelier Studio</h2>
      <p className="mt-2 text-sm text-ink/70">
        Compose &amp; Design are tied to your account so drafts, designs, and shares persist across events and devices.
      </p>
      <Link
        to="/auth"
        search={signInSearch as any}
        className="mt-5 inline-flex items-center rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Sign in or create account
      </Link>
    </div>
  );
}

function UpsellPanel({
  claiming,
  onStartTrial,
  onUpgrade,
}: {
  claiming: boolean;
  onStartTrial: () => void;
  onUpgrade: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-ink p-8 text-paper ring-1 ring-ink/10">
        <div className="flex items-start gap-3">
          <Lock className="mt-1 h-5 w-5 text-gold" />
          <div>
            <h2 className="font-serif text-2xl">Unlock Atelier Studio</h2>
            <p className="mt-2 max-w-[60ch] text-sm text-paper/70">
              One bundle — Compose (AI menus, service bundles, merchandise packs) <span className="text-paper">and</span>{" "}
              Design (templates, brand kits, print-ready PDF, PNG, and shareable links). Included on Atelier, with a
              25% members' discount on monthly/yearly and 20% off the one-time unlock. Postcard, Whisper and Host pay
              the standard add-on price.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <button
          type="button"
          onClick={onStartTrial}
          disabled={claiming}
          className="group rounded-2xl bg-secondary p-6 text-left ring-1 ring-velvet/30 transition hover:ring-velvet disabled:opacity-50"
        >
          <div className="inline-flex items-center gap-1 rounded-full bg-velvet/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-velvet">
            <Clock className="h-3 w-3" /> Free
          </div>
          <h3 className="mt-3 font-serif text-xl text-ink">1-day trial</h3>
          <p className="mt-2 text-xs text-ink/70">
            Full Compose + Design access for 24 hours. No card. One trial per account, ever.
          </p>
          <p className="mt-3 inline-flex items-center text-sm font-medium text-velvet">
            {claiming ? "Starting…" : "Start trial →"}
          </p>
        </button>

        <Link
          to="/events"
          className="group rounded-2xl bg-secondary p-6 text-left ring-1 ring-ink/10 transition hover:ring-velvet"
        >
          <div className="text-[10px] font-medium uppercase tracking-widest text-ink/60">One event</div>
          <h3 className="mt-3 font-serif text-xl text-ink">
            $14<span className="text-xs font-normal text-ink/60"> / event</span>
          </h3>
          <p className="mt-2 text-xs text-ink/70">
            Unlocks Compose + Design on one event with no time limit. Atelier members pay $11.20.
          </p>
          <p className="mt-3 inline-flex items-center text-sm font-medium text-velvet">Open events →</p>
        </Link>

        <Link
          to="/events"
          className="group rounded-2xl bg-secondary p-6 text-left ring-1 ring-ink/10 transition hover:ring-velvet"
        >
          <div className="text-[10px] font-medium uppercase tracking-widest text-ink/60">Monthly add-on</div>
          <h3 className="mt-3 font-serif text-xl text-ink">
            $9<span className="text-xs font-normal text-ink/60"> /mo</span>
          </h3>
          <p className="mt-2 text-xs text-ink/70">
            Standard for Postcard, Whisper and Host. Atelier members save 25% ($6.75/mo).
          </p>
          <p className="mt-3 inline-flex items-center text-sm font-medium text-velvet">Add monthly →</p>
        </Link>

        <button
          type="button"
          onClick={onUpgrade}
          className="group rounded-2xl bg-velvet p-6 text-left text-paper ring-1 ring-velvet transition hover:opacity-90"
        >
          <div className="text-[10px] font-medium uppercase tracking-widest text-gold">Best value</div>
          <h3 className="mt-3 font-serif text-xl text-paper">
            $79<span className="text-xs font-normal text-paper/70"> /yr</span>
          </h3>
          <p className="mt-2 text-xs text-paper/80">
            Atelier members save 25% ($59.25/yr) plus Studio integration.
          </p>
          <p className="mt-3 inline-flex items-center text-sm font-medium text-gold">Compare plans →</p>
        </button>
      </div>

      <div className="rounded-2xl bg-paper p-6 ring-1 ring-ink/10">
        <h3 className="font-serif text-lg text-ink">What's in the bundle</h3>
        <ul className="mt-3 grid gap-2 text-sm text-ink/80 sm:grid-cols-2">
          {[
            "AI-composed menus with dietary preferences & allergies",
            "Bronze, Silver & Gold service tiers (good / better / best inclusion levels — staffing, courses, bar)",
            "Merchandise & favor packs (t-shirts, totes, photo packs)",
            "Per-guest cost estimates",
            "Designer-grade menu, package, apparel & signage templates",
            "Brand kits — palette, fonts, logo, reusable across designs",
            "Print-ready PDF with bleed + crop marks; high-res PNG",
            "Shareable links + send-to-vendor RFQ",
          ].map((f) => (
            <li key={f} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-velvet" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
