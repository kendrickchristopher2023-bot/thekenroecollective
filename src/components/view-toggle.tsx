import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Segmented control that lets a host flip between the Admin view (manage),
 * Guest view (what recipients see), and — for the site owner — the Owner
 * dashboard. Renders as a floating pill.
 */
export function ViewToggle({
  mode,
  eventId,
}: {
  mode: "admin" | "guest" | "owner";
  eventId: string;
}) {
  const base =
    "px-4 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap";
  const active = "bg-velvet text-white shadow-sm";
  const inactive = "text-ink/60 hover:text-ink";
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      if (!data.session) return; // not signed in — skip owner check
      const { meIsOwner } = await import("@/lib/pricing.functions");
      try {
        const r = await meIsOwner();
        if (alive) setIsOwner(r.isOwner === true);
      } catch {
        /* not owner */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 print:hidden">
      <div className="flex items-center gap-1 rounded-full border border-ink/10 bg-paper/95 p-1 shadow-lg backdrop-blur-md">
        <span className="px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          View as
        </span>
        <Link
          to="/events/$eventId"
          params={{ eventId }}
          className={`${base} ${mode === "admin" ? active : inactive}`}
        >
          🛠 Admin
        </Link>
        <Link
          to="/invite/$eventId"
          params={{ eventId }}
          className={`${base} ${mode === "guest" ? active : inactive}`}
        >
          👋 Guest
        </Link>
        {isOwner && (
          <Link
            to="/owner"
            search={{ tab: undefined }}
            className={`${base} ${mode === "owner" ? active : inactive}`}
          >
            👑 Owner
          </Link>
        )}
      </div>
    </div>
  );
}
