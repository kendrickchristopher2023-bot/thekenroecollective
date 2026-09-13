import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import { venturesQueryOptions } from "@/lib/ventures-query";
import { groupVentures } from "@/lib/ventures.functions";
import { FlourishDivider, GoldenDots } from "@/components/decor";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/kenroes-logo.png";
import { GlobalErrorFallback } from "@/components/global-error-fallback";
import { FilmPlayer, type FilmDoorwayTarget, type FilmPlayerHandle } from "@/components/film-player";
import { filmForCategory, hasSeenFilm, markFilmSeen, type SiteFilm } from "@/lib/site-films";


export const Route = createFileRoute("/")({
  // Awaited and caught on purpose. A floating promise here turned a transient
  // ventures fetch failure into an unhandled rejection on "/" (logged as
  // "Seroval Error (step: 3)"). If the prefetch fails the component's
  // suspense query retries on the client instead.
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData(venturesQueryOptions);
    } catch {
      /* non-fatal: rendered from the client-side query instead */
    }
  },

  head: () => ({
    meta: [
      { title: "The Kenroe Collective — A collective of ventures" },
      {
        name: "description",
        content:
          "The Kenroe Collective is a holding company for refined, useful ventures, including Events & Gatherings, Group eCards, The Workroom, and Application Kit.",
      },
      { property: "og:title", content: "The Kenroe Collective — A collective of ventures" },
      {
        property: "og:description",
        content:
          "A holding company for refined, useful ventures, including Events & Gatherings, Group eCards, The Workroom, and Application Kit.",
      },
      { property: "og:url", content: "https://thekenroecollective.com/" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/" }],
  }),
  errorComponent: GlobalErrorFallback,
  notFoundComponent: () => (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16 text-center">
      <div className="max-w-md">
        <h1 className="font-serif text-3xl text-ink">We couldn't find this page</h1>
        <p className="mt-3 text-base text-muted-foreground">
          The link may be incomplete or out of date. Ask whoever sent it to share it again.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-full border border-ink/15 px-6 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
        >
          Go to the home page
        </a>
      </div>
    </div>
  ),
  component: VenturesHub,
});

/**
 * Flash timing: hold near peak brightness, then a slow ease down.
 * Reveals are offset by REVEAL_OFFSET_MS so the flash plays alone first.
 */
const FLASH_MS = 2000;
const REVEAL_OFFSET_MS = 1700;

/**
 * Extra delay added to every Reveal. `null` means "not decided yet": reveals
 * stay held (hidden, no animation) until we know whether a flash will play,
 * so content never starts animating underneath the flash.
 */
const RevealOffsetContext = createContext<number | null>(null);

/** Staggered entrance reveal. Disabled entirely under prefers-reduced-motion. */
function Reveal({
  delay,
  children,
  className = "",
}: {
  delay: number;
  children: React.ReactNode;
  className?: string;
}) {
  const offset = useContext(RevealOffsetContext);
  if (offset === null) {
    return <div className={`kc-reveal kc-hold ${className}`}>{children}</div>;
  }
  return (
    <div
      className={`kc-reveal ${className}`}
      style={{ animationDelay: `${delay + offset}ms` }}
    >
      {children}
    </div>
  );
}

/**
 * Warm gold/cream entrance flash. Fires once per full page load only:
 * the module-level flag survives client-side navigation, so returning to `/`
 * from elsewhere in the app never replays it. Purely decorative —
 * pointer-events-none always, and unmounted once the animation ends.
 */
let flashConsumed = false;

function useEntranceFlash() {
  const [state, setState] = useState<{ show: boolean; offset: number | null }>({
    show: false,
    offset: null,
  });

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (flashConsumed || reduced) {
      setState({ show: false, offset: 0 });
      return;
    }
    flashConsumed = true;
    setState({ show: true, offset: REVEAL_OFFSET_MS });
    const t = window.setTimeout(
      () => setState({ show: false, offset: REVEAL_OFFSET_MS }),
      FLASH_MS + 60,
    );
    return () => window.clearTimeout(t);
  }, []);

  return state;
}

/**
 * Per-venture accent styling. The `ventures.accent` column is the source of
 * truth; every tile used to hardcode velvet, so Venture 03 rendered identical
 * to Venture 01. Unknown values fall back to velvet.
 */
const ACCENTS: Record<string, { eyebrow: string; solid: string; ghost: string; focus: string; rail: string }> = {
  velvet: {
    eyebrow: "text-velvet/70",
    solid: "bg-velvet text-white",
    ghost: "text-velvet ring-velvet/25 group-hover:bg-velvet/5",
    focus: "focus:ring-velvet",
    rail: "before:bg-velvet/70",
  },
  gold: {
    eyebrow: "text-gold",
    solid: "bg-gold text-ink",
    ghost: "text-gold ring-gold/40 group-hover:bg-gold/10",
    focus: "focus:ring-gold",
    rail: "before:bg-gold/80",
  },
  cyprus: {
    eyebrow: "text-cyprus",
    solid: "bg-cyprus text-white",
    ghost: "text-cyprus ring-cyprus/30 group-hover:bg-cyprus/5",
    focus: "focus:ring-cyprus",
    rail: "before:bg-cyprus/80",
  },
  blossom: {
    eyebrow: "text-blossom",
    solid: "bg-blossom text-white",
    ghost: "text-blossom ring-blossom/30 group-hover:bg-blossom/5",
    focus: "focus:ring-blossom",
    rail: "before:bg-blossom/80",
  },
  walnut: {
    eyebrow: "text-walnut",
    solid: "bg-walnut text-paper",
    ghost: "text-walnut ring-walnut/30 group-hover:bg-walnut/5",
    focus: "focus:ring-walnut",
    rail: "before:bg-walnut/80",
  },
};



function statusChip(status: string) {
  if (status === "invite_only") return "By invitation";
  if (status === "coming_soon") return "Coming soon";
  return "Open now";
}

/**
 * Small account control for the splash. Signed out: a subtle sign-in link.
 * Signed in: the current account email plus a clear sign out, so people with
 * more than one account can always see and change which one they are in.
 */
function HubAccountControl() {
  const { ready, user } = useAuthReady();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!ready) return null;

  if (!user) {
    return (
      <Link
        to="/auth"
        search={{ redirect: undefined }}
        className="rounded-full px-3 py-1.5 text-xs font-medium tracking-wide text-muted-foreground underline decoration-velvet/30 underline-offset-4 transition-colors hover:text-velvet"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-[16rem] truncate text-xs text-muted-foreground sm:inline">
        {user.email}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await supabase.auth.signOut();
            navigate({ to: "/", replace: true });
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-full px-3 py-1.5 text-xs font-medium text-velvet ring-1 ring-velvet/25 transition-colors hover:bg-velvet/5 disabled:opacity-60"
      >
        {busy ? "Signing out" : "Sign out"}
      </button>
    </div>
  );
}



function VenturesHub() {
  const { data: ventures } = useSuspenseQuery(venturesQueryOptions);
  const groups = groupVentures(ventures);
  // Venture numbers follow the grouped display order, top to bottom.
  const flat = groups.flatMap((g) => g.ventures);
  const numberOf = (v: { id: string }) => flat.findIndex((x) => x.id === v.id);
  const { show: flashing, offset } = useEntranceFlash();
  const playerRef = useRef<FilmPlayerHandle>(null);
  const { ready: authReady, user } = useAuthReady();

  /**
   * First-click doorway: a signed-out visitor's first plain click on a venture
   * card plays that collection's film once per device, then carries on to the
   * venture. Every other case falls through to the link's normal behaviour.
   */
  const maybeDoorway = (
    e: React.MouseEvent<HTMLAnchorElement>,
    film: SiteFilm | undefined,
    venture: FilmDoorwayTarget,
  ) => {
    if (!film || e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!authReady || user) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (hasSeenFilm(film) !== false) return;
    e.preventDefault();
    markFilmSeen(film);
    playerRef.current?.open({ film, mode: "doorway", venture, opener: e.currentTarget });
  };



  return (
    <RevealOffsetContext.Provider value={offset}>
    <div className="relative min-h-screen overflow-hidden bg-paper font-sans text-ink selection:bg-velvet/10">
      <style>{`
        @keyframes kc-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes kc-draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        @keyframes kc-flash-out {
          0%   { opacity: 1; }
          38%  { opacity: 0.97; }
          58%  { opacity: 0.82; }
          78%  { opacity: 0.44; }
          100% { opacity: 0; }
        }
        .kc-reveal { opacity: 0; animation: kc-rise 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        .kc-rule { transform-origin: left center; animation: kc-draw 1100ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .kc-hold { animation: none !important; opacity: 0 !important; }
        .kc-flash {
          background:
            radial-gradient(circle at 50% 42%, rgba(255,250,240,0.96), rgba(212,180,131,0.55) 45%, rgba(245,239,230,0.28) 75%, rgba(245,239,230,0) 100%);
          animation: kc-flash-out ${FLASH_MS}ms cubic-bezier(0.36, 0, 0.2, 1) forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .kc-reveal, .kc-rule { animation: none !important; opacity: 1 !important; transform: none !important; }
          .kc-flash { display: none !important; }
        }
      `}</style>

      {flashing ? (
        <div aria-hidden className="kc-flash pointer-events-none fixed inset-0 z-50" />
      ) : null}

      <div className="absolute right-4 top-4 z-20 sm:right-8 sm:top-6">
        <HubAccountControl />
      </div>



      <GoldenDots className="pointer-events-none absolute -left-20 top-10 h-64 w-64 opacity-40" />
      <GoldenDots className="pointer-events-none absolute -right-24 bottom-16 h-72 w-72 opacity-30" />


      <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20">
        <Reveal delay={0}>
          <img src={logo} alt="" width={240} height={96} className="h-16 w-auto sm:h-20" />
        </Reveal>

        <Reveal delay={220} className="mt-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-velvet">
            Introducing
          </p>
        </Reveal>

        <h1
          className="mt-4 leading-[0.95] text-velvet"
          style={{ fontFamily: "'Great Vibes', 'Allura', cursive", fontSize: "clamp(3rem, 9vw, 7rem)" }}
          data-notranslate
        >
          <Reveal delay={420}>
            <span>
              The Kenroe Collective
              <sup
                aria-hidden="true"
                className="ml-1 align-super font-sans text-[0.24em] not-italic tracking-normal text-velvet/70"
              >
                ™
              </sup>
            </span>
          </Reveal>
        </h1>

        <div
          className={`mt-6 h-px w-40 bg-velvet/40 kc-rule${offset === null ? " kc-hold" : ""}`}
          style={offset === null ? undefined : { animationDelay: `${620 + offset}ms` }}
        />

        <Reveal delay={760} className="mt-8">
          <p className="max-w-[46ch] text-balance font-serif text-2xl font-medium leading-snug tracking-tight sm:text-3xl">
            <span className="text-ink">Where Moments Are </span>
            <span className="italic text-velvet">Orchestrated</span>
          </p>
        </Reveal>

        <Reveal delay={900} className="mt-4">
          <p className="max-w-[58ch] text-sm text-muted-foreground">
            Choose a venture to begin.
          </p>
        </Reveal>

        <div className="mt-14 flex flex-col gap-14">
          {groups.map((group, gi) => {
          const film = filmForCategory(group.category);
          return (
          <section key={group.category} aria-label={group.category}>
            <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-ink/40">
              Collection {String(gi + 1).padStart(2, "0")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="font-serif text-2xl font-medium leading-tight tracking-tight text-velvet sm:text-3xl">
                <span className="italic">{group.category}</span>
              </h2>
              {film ? (
                <button
                  type="button"
                  aria-label={`Watch ${film.title} film, ${film.durationSeconds} seconds`}
                  onClick={(e) => {
                    markFilmSeen(film);
                    playerRef.current?.open({ film, mode: "watch", opener: e.currentTarget });
                  }}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-velvet ring-1 ring-velvet/25 transition-colors hover:bg-velvet/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-velvet"
                >
                  <Play className="h-3 w-3 fill-current" aria-hidden />
                  Watch the film
                  <span className="text-velvet/60" data-notranslate>{film.durationLabel}</span>
                </button>
              ) : null}
            </div>
            <span aria-hidden className="mt-4 block h-px w-full bg-ink/10" />
            <div
              className={`mt-6 grid grid-cols-1 gap-5 ${group.ventures.length > 1 ? "md:grid-cols-2" : ""}`}
            >


          {group.ventures.map((v) => {
            const i = numberOf(v);
            const a = ACCENTS[v.accent ?? ""] ?? ACCENTS["velvet"]!;
            const body = (
              <>
                <div className="flex items-start justify-end gap-3">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {statusChip(v.status)}
                  </p>
                </div>
                <h2 className="mt-5 font-serif text-2xl font-medium leading-tight sm:text-3xl">
                  {v.name}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{v.tagline}</p>
                <span
                  className={
                    v.is_external
                      ? `mt-8 inline-flex items-center gap-1.5 self-start rounded-full px-5 py-2.5 text-xs font-medium ring-1 transition-colors ${a.ghost}`
                      : `mt-8 inline-flex items-center gap-1.5 self-start rounded-full px-5 py-2.5 text-xs font-medium transition-transform group-hover:-translate-y-0.5 ${a.solid}`
                  }
                >
                  {v.cta_label}
                  {v.is_external ? (
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <span aria-hidden>→</span>
                  )}
                </span>
              </>
            );

            const cardCls =
              `group relative flex h-full flex-col overflow-hidden rounded-3xl bg-secondary p-8 ring-1 ring-ink/5 transition-colors hover:bg-paper focus:outline-none focus:ring-2 ${a.focus} before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:content-[''] ${a.rail}`;

            const onCardClick = (e: React.MouseEvent<HTMLAnchorElement>) =>
              maybeDoorway(e, film, { name: v.name, href: v.href, is_external: v.is_external });

            return (
              <Reveal key={v.id} delay={1040 + i * 160} className="h-full">
                {v.is_external ? (
                  <a
                    href={v.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cardCls}
                    onClick={onCardClick}
                  >
                    {body}
                  </a>
                ) : (
                  <Link to={v.href as string} className={cardCls} onClick={onCardClick}>
                    {body}
                  </Link>
                )}
              </Reveal>
            );
          })}
            </div>
          </section>
          );
          })}
        </div>

        <FilmPlayer ref={playerRef} />


        <Reveal delay={1400} className="mt-16">
          <FlourishDivider className="h-6 w-40 opacity-70" />
        </Reveal>

        <Reveal delay={1500} className="mt-8">
          <div className="flex flex-col gap-4 border-t border-ink/5 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground" data-notranslate>
              © {new Date().getFullYear()} The Kenroe Collective
              <sup aria-hidden="true" className="ml-0.5 text-[0.7em]">™</sup>. All rights reserved.
            </p>
            <div className="flex flex-wrap gap-6">
              <Link to="/contact" className="text-xs font-medium text-muted-foreground hover:text-velvet">
                Contact
              </Link>
              <Link to="/privacy" className="text-xs font-medium text-muted-foreground hover:text-velvet">
                Privacy
              </Link>
              <Link to="/terms" className="text-xs font-medium text-muted-foreground hover:text-velvet">
                Terms
              </Link>
              <Link to="/accessibility" className="text-xs font-medium text-muted-foreground hover:text-velvet">
                Accessibility
              </Link>
            </div>
          </div>
        </Reveal>
      </main>
    </div>
    </RevealOffsetContext.Provider>
  );
}
