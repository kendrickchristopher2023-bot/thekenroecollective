// Always-visible environment indicator.
//
// DEMO: shown to everyone whenever demo mode is on for this browser.
// LIVE: shown to owner accounts only, so Christopher can tell at a glance that
// he is looking at real customer data. Regular hosts never see the LIVE chip.
import { useEffect, useState } from "react";
import { isDemoRuntime } from "@/lib/demo-mode";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { meEntitlements } from "@/lib/pricing.functions";

export function EnvironmentChip() {
  const { ready, user } = useAuthReady();
  const [demo, setDemo] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // Resolved in an effect: SSR has no window and no session.
  useEffect(() => {
    setDemo(isDemoRuntime());
  }, []);

  useEffect(() => {
    if (!ready || !user) {
      setIsOwner(false);
      return;
    }
    let alive = true;
    meEntitlements()
      .then((r) => {
        if (alive) setIsOwner(r.isOwner === true);
      })
      .catch(() => {
        if (alive) setIsOwner(false);
      });
    return () => {
      alive = false;
    };
  }, [ready, user]);

  if (!demo && !isOwner) return null;

  return (
    <div
      aria-label={demo ? "Demo environment" : "Live environment"}
      className={
        "pointer-events-none fixed right-2 top-2 z-[160] rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest shadow-sm ring-1 " +
        (demo
          ? "bg-amber-400 text-amber-950 ring-amber-700/40"
          : "bg-emerald-600 text-white ring-emerald-900/30")
      }
    >
      {demo ? "Demo" : "Live"}
    </div>
  );
}
