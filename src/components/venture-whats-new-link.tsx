import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

/**
 * Subtle "What's New" link for a venture area. Purely presentational: the dot
 * is a local hint that the changelog has not been opened from this browser yet,
 * stored per venture so eCards and Projects are tracked separately.
 */
export function VentureWhatsNewLink({
  tone,
  storageKey,
  label = "What's New",
  className = "",
}: {
  tone: "walnut" | "cyprus";
  storageKey: string;
  label?: string;
  className?: string;
}) {
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    try {
      setUnseen(!window.localStorage.getItem(storageKey));
    } catch {
      setUnseen(false);
    }
  }, [storageKey]);

  const accent =
    tone === "cyprus"
      ? "text-cyprus-deep ring-cyprus/30 hover:bg-cyprus/10"
      : "text-velvet ring-velvet/25 hover:bg-velvet/5";
  const dot = tone === "cyprus" ? "bg-cyprus" : "bg-velvet";

  return (
    <Link
      to="/whats-new"
      onClick={() => {
        try {
          window.localStorage.setItem(storageKey, new Date().toISOString());
        } catch {
          /* ignore */
        }
        setUnseen(false);
      }}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 transition-colors ${accent} ${className}`}
    >
      <Sparkles className="h-4 w-4" aria-hidden="true" />
      {label}
      {unseen && (
        <>
          <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
          <span className="sr-only">New updates available</span>
        </>
      )}
    </Link>
  );
}
