import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Heart, Users, Cake, Gift, Briefcase, Flower2, Check } from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { ArchesMotif, ColorAura, ConfettiBurst, FlourishDivider, GoldenDots } from "@/components/decor";
import flutesAsset from "@/assets/champagne-flutes.png.asset.json";

export const Route = createFileRoute("/gatherings")({
  head: () => ({
    meta: [
      { title: "Events & Gatherings — The Kenroe Collective" },
      {
        name: "description",
        content:
          "Digital invitations, RSVP tracking, seating charts, vendors, and AI-curated menus — the editorial event platform from The Kenroe Collective.",
      },
      { property: "og:title", content: "Events & Gatherings — The Kenroe Collective" },
      { property: "og:description", content: "Digital invitations, RSVP tracking, seating charts, vendors, and AI-curated menus — the editorial event platform from The Kenroe Collective." },
      { property: "og:url", content: "https://thekenroecollective.com/gatherings" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/gatherings" }],

  }),
  component: Hub,
});

type SubBrand = {
  name: string;
  blurb: string;
  href?: "/projects" | "/vendors" | "/studio";
  status?: "open" | "trial";
  badge?: string;
};

const subBrands: SubBrand[] = [
  {
    name: "Marketplace",
    blurb: "Curated stationery, party favors, and artisanal vendor goods.",
  },
  {
    name: "Project Management",
    blurb: "Kanban boards, lists, notes, files, and event-linked production work.",
    href: "/projects" as const,
    status: "open",
  },
  {
    name: "Vendors & Registry",
    blurb: "Trusted venues, caterers, photographers, planners and registries curated by the collective.",
    href: "/vendors" as const,
    status: "open",
  },
  {
    name: "Atelier Studio",
    blurb:
      "Compose & Design in one workspace. AI curates bespoke menus, service suites, and merchandise — then designer-grade templates lay it out for print-ready PDF, high-res PNG, and shareable links. Flawlessly executed, effortlessly exported.",
    href: "/studio" as const,
    status: "trial",
    badge: "1-day trial · Included on Atelier",
  },
];

const useCases: { icon: typeof Heart; name: string; blurb: string; to: "/events/new" | "/faq" | "/studio" }[] = [
  { icon: Heart, name: "Weddings", blurb: "Elegant invitations, RSVP tracking, and seating charts.", to: "/events/new" },
  { icon: Users, name: "Family Reunions", blurb: "Bring everyone together with shared photo walls.", to: "/events/new" },
  { icon: Cake, name: "Birthday Parties", blurb: "From milestone celebrations to intimate dinners.", to: "/events/new" },
  { icon: Gift, name: "Baby & Bridal Showers", blurb: "Registries, games, and gift coordination.", to: "/studio" },
  { icon: Briefcase, name: "Corporate Events", blurb: "Professional invitations and project management.", to: "/events/new" },
  { icon: Flower2, name: "Memorials & Celebrations of Life", blurb: "Gather, remember, and share with grace.", to: "/faq" },
];

function Hub() {
  // Celebrate returning users with a confetti burst when they just signed in.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("justSignedIn") !== "1") return;
    sessionStorage.removeItem("justSignedIn");
    let cancelled = false;
    import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const colors = ["#5C1D1D", "#D4B483", "#F5EFE6", "#A38560"];
      const fire = (origin: { x: number; y: number }, particleRatio: number, opts: Record<string, unknown>) =>
        confetti({
          origin,
          particleCount: Math.floor(240 * particleRatio),
          spread: 70,
          startVelocity: 55,
          ticks: 240,
          colors,
          ...opts,
        });
      fire({ x: 0.2, y: 0.3 }, 0.25, { angle: 60 });
      fire({ x: 0.8, y: 0.3 }, 0.25, { angle: 120 });
      fire({ x: 0.5, y: 0.2 }, 0.35, { spread: 110, scalar: 1.1 });
      setTimeout(() => fire({ x: 0.5, y: 0.25 }, 0.25, { spread: 130, decay: 0.92 }), 280);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-paper font-sans text-ink selection:bg-velvet/10">
      <SiteNav />

      <section className="relative overflow-hidden pt-16 pb-10">
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                className="text-velvet leading-[0.95]"
                style={{
                  fontFamily: "'Great Vibes', 'Allura', cursive",
                  fontSize: "clamp(3.75rem, 8vw, 7rem)",
                }}
                data-notranslate
              >
                The Kenroe Collective<sup aria-hidden="true" className="ml-1 align-super text-[0.28em] font-sans not-italic tracking-normal text-velvet/70">™</sup>
              </p>
                <img
                  src={flutesAsset.url}
                  alt="Clinking champagne flutes"
                  className="h-28 w-auto object-contain sm:h-36"
                  loading="lazy"
                />
            </div>
            <h1 className="max-w-[22ch] text-balance font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              The art of <span className="italic text-velvet">gathering</span> refined.
            </h1>
            <p className="max-w-[42ch] text-balance font-serif text-2xl font-medium leading-tight tracking-tight text-ink sm:text-3xl">
              The Kenroe Collective brings <span className="italic text-velvet">editorial</span> precision to life's most significant milestones.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/events/new"
                className="inline-flex items-center rounded-full bg-velvet px-6 py-3 text-sm font-medium text-white ring-offset-2 ring-velvet transition-transform hover:-translate-y-0.5 focus:ring-2"
              >
                Create New Event
              </Link>
              <Link
                to="/events"
                className="inline-flex items-center rounded-full bg-transparent px-6 py-3 text-sm font-medium ring-1 ring-ink/10 transition-colors hover:bg-secondary"
              >
                Open Dashboard
              </Link>
              <Link
                to="/faq"
                className="inline-flex items-center rounded-full bg-transparent px-6 py-3 text-sm font-medium text-velvet ring-1 ring-velvet/20 transition-colors hover:bg-velvet/5"
              >
                How it works
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Free to start · No credit card required
            </p>
          </div>
        </div>
      </section>

      {/* Decorative gradient band — sits between hero actions and Featured Product */}
      <section className="relative overflow-hidden py-20">
        <ColorAura />
        <GoldenDots className="absolute -left-16 top-4 h-56 w-56 opacity-60" />
        <ArchesMotif className="absolute -right-10 top-6 h-56 w-[28rem] opacity-80" />
        <ConfettiBurst className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2" />
        <div className="relative mx-auto max-w-7xl px-6">
          <FlourishDivider className="mx-auto h-6 w-48" />
        </div>
      </section>

      {/* How it works — 3-step strip */}
      <section className="relative pb-16">
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="mb-10 max-w-2xl">
            <p className="text-[10px] font-medium uppercase tracking-widest text-velvet">How it works</p>
            <h2 className="mt-3 font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              Three steps to a <span className="italic text-velvet">refined</span> gathering.
            </h2>
          </div>
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { n: "01", title: "Create", blurb: "Set the details — date, guests, and the story of your event." },
              { n: "02", title: "Design", blurb: "Editorial templates, AI-curated menus, and cohesive stationery." },
              { n: "03", title: "Share", blurb: "Send invitations, track RSVPs, and celebrate the moment." },
            ].map((step) => (
              <li key={step.n} className="rounded-2xl bg-secondary p-5 ring-1 ring-ink/5">
                <div className="font-serif text-2xl italic text-velvet">{step.n}</div>
                <h3 className="mt-2 font-serif text-lg font-medium">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.blurb}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>


      <section className="relative pb-16">
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="mb-10 max-w-2xl">
            <p className="text-[10px] font-medium uppercase tracking-widest text-velvet">Occasions</p>
            <h2 className="mt-3 font-serif text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              Made for every <span className="italic text-velvet">occasion</span>.
            </h2>
            <p className="mt-3 max-w-[52ch] text-sm text-muted-foreground">
              From black-tie weddings to quiet remembrances — one refined toolkit for the moments that matter most.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((u) => {
              const Icon = u.icon;
              return (
                <Link
                  key={u.name}
                  to={u.to}
                  className="group block rounded-2xl bg-secondary p-5 ring-1 ring-ink/5 transition-colors hover:bg-paper focus:outline-none focus:ring-2 focus:ring-velvet"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-velvet/10">
                      <Icon className="h-4 w-4 text-velvet" strokeWidth={1.5} aria-hidden />
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-medium text-velvet">
                      <Check className="h-3 w-3" aria-hidden />
                      Supported
                    </div>
                  </div>
                  <h3 className="mt-3 font-serif text-lg font-medium">{u.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{u.blurb}</p>
                  <p className="mt-3 text-xs font-medium text-velvet opacity-0 transition-opacity group-hover:opacity-100">
                    Get started →
                  </p>
                </Link>
              );
            })}
          </div>
          <div className="mt-10 flex justify-center">
            <Link
              to="/events/new"
              className="inline-flex items-center rounded-full bg-velvet px-6 py-3 text-sm font-medium text-white ring-offset-2 ring-velvet transition-transform hover:-translate-y-0.5 focus:ring-2"
            >
              Create your first event →
            </Link>
          </div>
        </div>
      </section>





      <section className="relative pb-24">
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="group relative col-span-1 flex flex-col justify-between overflow-hidden rounded-2xl bg-ink p-8 text-white sm:col-span-2 min-h-[280px]">
              <div className="relative z-10">
                <span className="text-[10px] font-medium uppercase tracking-widest text-gold">
                  Featured Product
                </span>
                <h2 className="mt-4 font-serif text-4xl font-medium">Events</h2>
                <p className="mt-2 max-w-[40ch] text-zinc-400">
                  The flagship orchestration tool for hosts who demand tactile perfection in digital
                  invitations and RSVP tracking.
                </p>
              </div>
              <div className="mt-12 flex items-center gap-4">
                <Link
                  to="/events"
                  className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium ring-1 ring-white/20 backdrop-blur-md transition-colors hover:bg-white hover:text-black"
                >
                  Launch Dashboard
                </Link>
              </div>
              <div
                aria-hidden
                className="absolute -right-12 top-0 h-full w-2/3 opacity-30"
                style={{
                  background:
                    "radial-gradient(circle at 30% 50%, rgba(212,180,131,0.35), transparent 60%)",
                }}
              />
            </div>

            {subBrands.map((b) => {
              const statusLabel =
                b.status === "open" ? "Open now" : b.status === "trial" ? (b.badge ?? "Try free") : "Coming soon";
              const body = (
                <>
                  <h2 className="font-serif text-2xl font-medium">{b.name}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{b.blurb}</p>
                  <p className="mt-6 text-[10px] font-medium uppercase tracking-widest text-velvet/70">
                    {statusLabel}
                  </p>
                </>
              );
              return b.href ? (
                <Link
                  key={b.name}
                  to={b.href}
                  className="rounded-2xl bg-secondary p-8 ring-1 ring-ink/5 transition-colors hover:bg-paper"
                >
                  {body}
                </Link>
              ) : (
                <div
                  key={b.name}
                  className="rounded-2xl bg-secondary p-8 ring-1 ring-ink/5 transition-colors hover:bg-paper"
                >
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
