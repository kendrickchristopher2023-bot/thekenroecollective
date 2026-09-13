import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isDemoRuntime, setDemoCookie, syncDemoFromQuery } from "@/lib/demo-mode";

/**
 * Persistent demo banner + one-time auto sign-in into the shared demo host
 * account. Rendered from __root so it appears on every route, including
 * guest-facing pages.
 *
 * Demo detection runs in an effect (not during render) because SSR has no
 * window — resolving it during render would cause a hydration mismatch.
 */
export function DemoBanner() {
  const [demo, setDemo] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // `?demo=1` / `?demo=0` on any URL is a valid entry point; persist it first.
    syncDemoFromQuery();
    setDemo(isDemoRuntime());
  }, []);

  useEffect(() => {
    if (!demo) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled || data.session) return;
        const { demoSignIn } = await import("@/lib/demo.functions");
        const result = (await demoSignIn()) as {
          accessToken?: string;
          refreshToken?: string;
          error?: string;
        };
        if (cancelled || !result?.accessToken || !result?.refreshToken) return;
        await supabase.auth.setSession({
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
        });
      } catch {
        // Auto sign-in is a convenience; the demo still works signed out.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [demo]);

  if (!demo) return null;

  // Leaving demo signs the shared demo host account out first, so nobody ends up
  // browsing the live app as demo@thekenroecollective.com.
  async function leaveDemo() {
    setLeaving(true);
    try {
      await supabase.auth.signOut();
    } catch {
      // Signing out is best-effort; still drop the cookie and reload.
    }
    setDemoCookie(false);
    window.location.replace("/");
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-[150] flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-400/60 bg-amber-100 py-2 pl-4 pr-16 text-center text-sm font-medium text-amber-900 sm:pr-20 dark:border-amber-500/40 dark:bg-amber-950 dark:text-amber-100"
    >
      <span>
        Demo environment — sample data. Nothing here is real, payments are in
        test mode, and everything resets nightly.
      </span>
      <button
        type="button"
        onClick={leaveDemo}
        disabled={leaving}
        className="rounded-full border border-amber-700/40 bg-white/70 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-white disabled:opacity-50 dark:bg-amber-900/60 dark:text-amber-50"
      >
        {leaving ? "Leaving…" : "Exit demo"}
      </button>
    </div>
  );
}
