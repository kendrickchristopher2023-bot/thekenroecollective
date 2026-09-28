import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setDemoCookie } from "@/lib/demo-mode";

/**
 * Demo mode entry point.
 *
 * /demo      → turns demo mode on for this browser, then goes home.
 * /demo?off=1 → turns it off.
 *
 * This exists because Lovable's hosting edge 302s demo.thekenroecollective.com
 * to the primary domain before the request reaches the app, so hostname-based
 * detection can never fire on that host.
 */
export const Route = createFileRoute("/demo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Demo Mode — The Kenroe Collective" },
      {
        name: "description",
        content:
          "Enter the sandboxed demo of The Kenroe Collective: sample events, test-mode payments, no real messages sent.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Demo Mode — The Kenroe Collective" },
      {
        property: "og:description",
        content:
          "Enter the sandboxed demo of The Kenroe Collective: sample events, test-mode payments, no real messages sent.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DemoSwitch,
});

function DemoSwitch() {
  const [mode, setMode] = useState<"on" | "off" | null>(null);

  useEffect(() => {
    const off = new URLSearchParams(window.location.search).get("off") === "1";
    setDemoCookie(!off);
    setMode(off ? "off" : "on");
    // Full document load (not a router navigation) so every demo-aware
    // component re-evaluates the flag from scratch on the next render.
    let cancelled = false;
    let timer: number | undefined;
    void (async () => {
      if (off) await supabase.auth.signOut();
      if (cancelled) return;
      timer = window.setTimeout(
        () => window.location.replace(off ? "/" : "/events"),
        1200,
      );
    })();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="font-serif text-2xl">
        {mode === "off" ? "Demo mode off" : mode === "on" ? "Demo mode on" : "Switching environment…"}
      </h1>

      <p className="text-sm text-muted-foreground">
        {mode === "off"
          ? "You are back in the live app with your real data."
          : "Sample data, test-mode payments, no real messages. Taking you in…"}
      </p>
    </div>
  );
}
