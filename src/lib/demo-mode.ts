/**
 * Demo mode — isomorphic detection.
 *
 * The demo environment is NOT a separate deployment. It is this same app,
 * served on a `demo.` hostname (e.g. demo.thekenroecollective.com). When the
 * request/browser hostname matches, the app switches into demo mode:
 *   - Stripe is forced to sandbox; a live publishable token disables checkout.
 *   - SMS sends are inert (nothing is queued, Twilio is never called).
 *   - A persistent "Demo environment" banner is shown.
 *   - Destructive / cross-tenant admin actions are hard-blocked server-side.
 *   - A nightly cron job resets the demo host account's data.
 *
 * Keep this file free of server-only imports: it is imported by both the
 * browser bundle and server functions.
 */

/** Exact hostnames that are always treated as demo, in addition to any `demo.` subdomain. */
const EXPLICIT_DEMO_HOSTS = new Set<string>([
  "demo.thekenroecollective.com",
  "demo.kenroecollective.com",
]);

/** The shared demo host account. Pre-seeded with fake events, guests and vendors. */
export const DEMO_ACCOUNT_EMAIL = "demo@thekenroecollective.com";

/** Message surfaced whenever a blocked action is attempted in the demo. */
export const DEMO_BLOCKED_MESSAGE =
  "This action is disabled in the demo environment.";

/**
 * Cookie that opts a single browser into demo mode.
 *
 * Needed because Lovable's hosting edge 302s every non-primary connected
 * domain (including demo.thekenroecollective.com) to the primary domain before
 * the request ever reaches this app, so hostname detection alone can never
 * fire there. Visiting /demo sets this cookie; /demo?off=1 clears it.
 */
export const DEMO_COOKIE = "kenroe_demo";

/** True when `hostname` (with or without a port) is a demo host. */
export function isDemoHostname(hostname?: string | null): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase().trim().split(":")[0];
  if (!host) return false;
  return host.startsWith("demo.") || EXPLICIT_DEMO_HOSTS.has(host);
}

/**
 * Browser-side demo check. Returns false during SSR — components that render
 * differently in demo mode must resolve this in an effect to avoid hydration
 * mismatches (see DemoBanner).
 */
export function isDemoRuntime(): boolean {
  if (import.meta.env["VITE_DEMO_MODE"] === "true") return true;
  if (typeof document !== "undefined" &&
      new RegExp(`(?:^|;\\s*)${DEMO_COOKIE}=1(?:;|$)`).test(document.cookie)) {
    return true;
  }
  if (typeof window === "undefined") return false;
  // `?demo=1` on any URL counts immediately, so a bookmarked link lands in demo
  // mode on the very first render instead of only after the cookie round-trip.
  if (new URLSearchParams(window.location.search).get("demo") === "1") return true;
  return isDemoHostname(window.location.hostname);
}

/** Turn demo mode on/off for this browser (client-only). */
export function setDemoCookie(on: boolean): void {
  if (typeof document === "undefined") return;
  document.cookie = on
    ? `${DEMO_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`
    : `${DEMO_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Honour `?demo=1` / `?demo=0` on any URL by persisting it to the cookie.
 * Returns true when the cookie was changed. Safe to call on every page load.
 */
export function syncDemoFromQuery(): boolean {
  if (typeof window === "undefined") return false;
  const value = new URLSearchParams(window.location.search).get("demo");
  if (value !== "1" && value !== "0") return false;
  const wanted = value === "1";
  const hasCookie = new RegExp(`(?:^|;\\s*)${DEMO_COOKIE}=1(?:;|$)`).test(document.cookie);
  if (hasCookie === wanted) return false;
  setDemoCookie(wanted);
  return true;
}

/** Enter demo mode and reload so every demo-aware component re-evaluates. */
export function enterDemo(): void {
  setDemoCookie(true);
  if (typeof window !== "undefined") window.location.replace("/");
}

/**
 * Leave demo mode and return to the live app.
 *
 * If this browser is signed in as the shared demo account (which happens when
 * an owner enters the demo from the console and the banner signs them in), the
 * demo account is signed out first, so nobody keeps browsing the live app as
 * "demo". Any other account, an owner's own included, is left signed in.
 */
export async function exitDemo(): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getUser();
      if (isDemoAccountEmail(data.user?.email)) await supabase.auth.signOut();
    } catch {
      // Leaving the demo must never get stuck on the sign-out step.
    }
  }
  setDemoCookie(false);
  if (typeof window !== "undefined") window.location.replace("/");
}

/** True only for the shared demo account itself. */
export function isDemoAccountEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === DEMO_ACCOUNT_EMAIL;
}


