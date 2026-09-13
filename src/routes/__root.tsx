import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import logo from "../assets/kenroes-logo.png";

import { Toaster } from "sonner";
import { CookieNotice } from "@/components/cookie-notice";
import { SupportWidget } from "@/components/support-widget";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { DemoBanner } from "@/components/demo-banner";
import { EnvironmentChip } from "@/components/environment-chip";
import { OwnerTierPreview } from "@/components/owner-tier-preview";
import { CmdPalette } from "@/components/cmd-palette";

import { ExplainPageButton } from "@/components/explain-page-button";
import { KeyboardShortcutsHelp } from "@/components/keyboard-shortcuts-help";
import { AutoTranslate } from "@/components/auto-translate";
import { FloatingBackUndo } from "@/components/floating-back-undo";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { MobileMenuDrawer } from "@/components/mobile-menu-drawer";
import { FirstRunWelcome } from "@/components/first-run-welcome";
import { ProductFeedbackPrompt } from "@/components/product-feedback-prompt";
import { GlobalErrorFallback } from "@/components/global-error-fallback";
import { MobileActionDock } from "@/components/mobile-action-dock";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import { SiteNav, SiteFooter } from "@/components/site-nav";
import { initSentry } from "@/lib/sentry";
import { useDarkMode } from "@/components/dark-mode-toggle";
import { useAccessibilityPrefs } from "@/components/accessibility-menu";
import { viewerTimeZone } from "@/lib/datetime";



function NotFoundComponent() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Page Not Found — The Kenroe Collective";
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => {
      document.title = prevTitle;
      meta.remove();
    };
  }, []);
  return (
    <>
      <SiteNav />
      <main className="flex min-h-[60vh] items-center justify-center bg-background px-4 py-20">
        <div className="max-w-lg rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
          <img src={logo} alt="The Kenroe Collective" className="mx-auto h-12 w-auto" />
          <h1 className="mt-6 font-serif text-3xl font-medium text-foreground">
            Page not found
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Go home
            </Link>
            <Link
              to="/events"
              className="inline-flex items-center justify-center rounded-md border border-border bg-transparent px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Browse events
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  return <GlobalErrorFallback error={error} reset={reset} />;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // iPhone Safari rewrites text that looks like a phone number, date or
      // address into its own links before React finishes taking over the page.
      // That rewriting is what produced the recurring iPhone-only render
      // complaint on the gatherings page, so the rewriting is turned off.
      {
        name: "format-detection",
        content: "telephone=no,date=no,address=no,email=no",
      },
      { title: "The Kenroe Collective — A collective of ventures" },
      { name: "description", content: "A holding company for refined, useful ventures, including Events & Gatherings, Group eCards, The Workroom, and Application Kit." },
      { property: "og:site_name", content: "The Kenroe Collective" },
      { property: "og:title", content: "The Kenroe Collective — A collective of ventures" },
      { property: "og:description", content: "A holding company for refined, useful ventures, including Events & Gatherings, Group eCards, The Workroom, and Application Kit." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://thekenroecollective.com" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "The Kenroe Collective — A collective of ventures" },
      { name: "twitter:description", content: "A holding company for refined, useful ventures, including Events & Gatherings, Group eCards, The Workroom, and Application Kit." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/c3oDp46bbYQdmeEYaFb58Q1HarG2/social-images/social-1783546918142-the-kenroe-collective-logo_(2).webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/c3oDp46bbYQdmeEYaFb58Q1HarG2/social-images/social-1783546918142-the-kenroe-collective-logo_(2).webp" },
      { name: "theme-color", content: "#1A1A1A" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", href: logo },
      { rel: "apple-touch-icon", href: logo },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Geist:wght@400;500;600&family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=Great+Vibes&family=Dancing+Script:wght@500;700&family=Pinyon+Script&family=Tangerine:wght@400;700&family=Parisienne&family=Allura&family=Italianno&family=Cinzel:wght@500;700&family=Libre+Bodoni:ital,wght@0,500;0,700;1,500&family=DM+Serif+Display:ital@0;1&family=Marcellus&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "The Kenroe Collective",
          url: "https://thekenroecollective.com",
          description: "Editorial event planning, invitations, RSVPs, and orchestration.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "The Kenroe Collective",
          url: "https://thekenroecollective.com",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

async function computeDeviceHash(): Promise<string> {
  try {
    const parts = [
      navigator.userAgent || "",
      navigator.language || "",
      String(screen.width) + "x" + String(screen.height),
      String(screen.colorDepth || ""),
      viewerTimeZone(),
      String((navigator as any).hardwareConcurrency || ""),
    ].join("|");
    const buf = new TextEncoder().encode(parts);
    const hashBuf = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    initSentry();
    void import("@/lib/error-capture-client").then((m) => m.installGlobalErrorCapture());
    // A tab left open across a deploy points at asset hashes that no longer
    // exist, so any lazy-loaded feature (PDF export, editors) fails with
    // "Failed to fetch dynamically imported module". Reload once to recover.
    void import("@/lib/lazy-chunk").then((m) => m.installChunkErrorRecovery());
  }, []);



  // Applying these here (rather than only where SiteNav/DisplaySettingsMenu
  // mount) makes saved dark-mode/text-size/contrast prefs reapply on every
  // route, including guest-facing pages (invite, wall, checkin, run-of-show,
  // qr-cards) that don't render SiteNav at all.
  useDarkMode();
  useAccessibilityPrefs();

  useEffect(() => {
    // After OAuth (Google/Apple) returns to the origin, redirect to the saved next path.
    // Only run when this load actually looks like an OAuth callback — otherwise a
    // stale `postAuthNext` value would force a reload on every normal page navigation.
    let next: string | null = null;
    try { next = sessionStorage.getItem("postAuthNext"); } catch { /* ignore */ }
    if (!next) return;

    const search = window.location.search || "";
    const hash = window.location.hash || "";
    const isOAuthCallback =
      /[?&](code|state|error|error_description)=/.test(search) ||
      /[#&](access_token|refresh_token|provider_token|error|error_description)=/.test(hash);

    if (!isOAuthCallback) {
      // Not an OAuth return — clear the stale marker so it can't strand future navigations.
      try { sessionStorage.removeItem("postAuthNext"); } catch { /* ignore */ }
      return;
    }

    let done = false;
    let unsubscribe: (() => void) | undefined;
    const go = (target: string) => {
      if (done) return;
      done = true;
      try { sessionStorage.removeItem("postAuthNext"); } catch { /* ignore */ }
      if (window.location.pathname + window.location.search !== target) {
        void router.navigate({ to: target, replace: true });
      }
    };
    import("@/integrations/supabase/client").then(({ supabase }) => {
      if (done) return;
      // Shared helper consumes PKCE `?code=`, legacy hash tokens, or
      // `?token_hash=` links — whichever shape this redirect used.
      import("@/lib/auth-redirect").then(({ resolveAuthRedirect }) => {
        if (done) return;
        void resolveAuthRedirect().then((res) => {
          if (res.session) go(next!);
        });
      });
      const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session) go(next!);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    });

    return () => {
      done = true;
      unsubscribe?.();
    };
  }, [router]);

  // Record sign-in device fingerprints and send a security email on new devices.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const record = async () => {
        try {
          const deviceHash = await computeDeviceHash();
          if (!deviceHash) return;
          const seenKey = `kenroe.device.recorded.${deviceHash.slice(0, 24)}`;
          if (sessionStorage.getItem(seenKey)) return;
          sessionStorage.setItem(seenKey, "1");
          const { recordSignInDevice } = await import("@/lib/security.functions");
          await recordSignInDevice({
            data: { deviceHash, userAgent: navigator.userAgent },
          });
        } catch { /* silent */ }
      };
      // Fire once on initial mount if a session already exists.
      supabase.auth.getSession().then(({ data }) => {
        if (!cancelled && data.session) void record();
      });
      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN") void record();
      });
      unsub = () => sub.subscription.unsubscribe();
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);


  return (
    <QueryClientProvider client={queryClient}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-velvet focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>
      <DemoBanner />
      <EnvironmentChip />
      <AnnouncementBanner />

      {/* Bottom padding on mobile so neither the fixed MobileTabBar nor the
          floating chat / action buttons above it can cover page content. */}
      <main id="main-content" className="pb-32 sm:pb-0" tabIndex={-1}>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </main>
      <SupportWidget />
      {/* Desktop-only floating helpers; mobile users get MobileActionDock. */}
      <div className="hidden sm:contents">
        <FloatingBackUndo />
        <ExplainPageButton />
        <OwnerTierPreview />
      </div>
      <CmdPalette />
      <AutoTranslate />
      <KeyboardShortcutsHelp />
      <MobileTabBar />
      <MobileMenuDrawer />
      <MobileActionDock />
      <FirstRunWelcome />
      <ProductFeedbackPrompt />
      <Toaster position="top-center" richColors />
      <SyncStatusIndicator />
      <CookieNotice />


    </QueryClientProvider>
  );
}
