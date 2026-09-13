import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { confirmCheckoutSession } from "@/lib/payments.functions";

const NEXT_KEY = "kenroes:checkout-next";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string; next?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Welcome — The Kenroe Collective" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutReturn,
});

function readSavedNext(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(NEXT_KEY);
  } catch {
    return null;
  }
}

async function celebrateAndContinue(nextPath: string, navigateTo: (href: string) => void) {
  try {
    const { default: confetti } = await import("canvas-confetti");
    const colors = ["#5C1D1D", "#D4B483", "#F5EFE6", "#A38560", "#F7E7B8"];
    const fire = (x: number, angle: number, ratio: number) =>
      confetti({
        particleCount: Math.floor(260 * ratio),
        angle,
        spread: 80,
        startVelocity: 60,
        ticks: 280,
        origin: { x, y: 0.35 },
        colors,
      });
    fire(0.15, 60, 0.3);
    fire(0.85, 120, 0.3);
    fire(0.5, 90, 0.45);
    setTimeout(() => fire(0.5, 90, 0.25), 350);
    setTimeout(() => { fire(0.2, 60, 0.2); fire(0.8, 120, 0.2); }, 700);
  } catch { /* confetti optional */ }
  try { window.sessionStorage.removeItem(NEXT_KEY); } catch {}
  setTimeout(() => {
    const safePath = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/events";
    const sep = safePath.includes("?") ? "&" : "?";
    navigateTo(`${safePath}${sep}resumed=1`);
  }, 1400);
}

function CheckoutReturn() {
  const router = useRouter();
  const { session_id, next: nextFromQuery } = Route.useSearch();
  const [status, setStatus] = useState<"syncing" | "active" | "timeout" | "no-session">(
    session_id ? "syncing" : "no-session",
  );

  const nextPath = nextFromQuery || readSavedNext() || "/events";

  useEffect(() => {
    if (!session_id) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20; // ~40s

    async function poll() {
      let env: ReturnType<typeof getStripeEnvironment>;
      try {
        env = getStripeEnvironment();
      } catch {
        if (!cancelled) setStatus("timeout");
        return;
      }
      while (!cancelled && attempts < maxAttempts) {
        attempts++;
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (userId) {
          const confirmation = await confirmCheckoutSession({ data: { sessionId: session_id, environment: env } });
          if (!("error" in confirmation) && confirmation.status === "active") {
            if (!cancelled) {
              setStatus("active");
              await celebrateAndContinue(nextPath, (path) => void router.navigate({ to: path as any, replace: true }));
            }
            return;
          }

          const { data } = await (supabase as any)
            .from("subscriptions")
            .select("status,current_period_end")
            .eq("user_id", userId)
            .eq("environment", env)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data && ["active", "trialing", "past_due"].includes(data.status)) {
            if (!cancelled) {
              setStatus("active");
              await celebrateAndContinue(nextPath, (path) => void router.navigate({ to: path as any, replace: true }));
            }
            return;
          }

        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) setStatus("timeout");
    }
    poll();
    return () => {
      cancelled = true;
    };
  }, [session_id, nextPath, router]);

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto max-w-2xl px-6 py-24 text-center">
        <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">
          {status === "active" ? "You're in" : status === "no-session" ? "Hello again" : "Almost there"}
        </span>
        <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">
          {status === "active" && "Thank you for your purchase 🥂"}
          {status === "syncing" && "Activating your plan…"}
          {status === "timeout" && "Your payment is processing."}
          {status === "no-session" && "Thanks for stopping by."}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {status === "active" &&
            "Welcome to the collective — we're so glad you're here. Your plan is active and a receipt is on its way. Taking you back to where you left off…"}

          {status === "syncing" &&
            "We're confirming your payment with our payments provider. This usually takes a few seconds."}
          {status === "timeout" &&
            "Payments confirmation is taking a bit longer than usual. Your receipt is on its way — you can continue and your plan will appear shortly."}
          {status === "no-session" &&
            "We couldn't confirm a checkout session, but you can head back to pricing any time."}
        </p>
        {status === "syncing" && (
          <div className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-velvet" /> Syncing…
          </div>
        )}
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <Link
            to={nextPath as any}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-7 py-3 text-base font-medium text-paper hover:opacity-90"
          >
            Take me back to where I was
          </Link>
          <Link
            to="/events"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-ink/20 px-7 py-3 text-base font-medium text-ink hover:border-velvet/50 hover:text-velvet"
          >
            Back to my events
          </Link>
          <Link
            to="/pricing"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-secondary px-7 py-3 text-base font-medium text-ink hover:bg-secondary/70"
          >
            View plans
          </Link>
        </div>

      </section>
      <SiteFooter />
    </div>
  );
}
