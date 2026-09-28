import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { Tier } from "@/lib/entitlements-client";

const TIER_LABEL: Record<Tier, string> = {
  postcard: "Postcard",
  whisper: "Whisper",
  host: "Host",
  atelier: "Atelier",
};

/**
 * Wrap a panel/step that is locked behind a higher tier or add-on. Renders
 * editorial copy + an explicit Upgrade button. Never use <a href> here — use
 * TanStack Link so we don't trigger a full page refresh.
 */
export function LockedStep({
  requiredTier,
  feature,
  children,
  addonName,
  addonHref,
}: {
  requiredTier: Tier;
  feature: string;
  children?: ReactNode;
  addonName?: string;
  addonHref?: string;
}) {
  const tierLabel = TIER_LABEL[requiredTier];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-velvet/20 bg-gradient-to-br from-velvet/5 to-champagne/10 p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-velvet/10 text-velvet">
        <Lock className="h-5 w-5" aria-hidden />
      </div>
      <p className="font-serif text-xl text-ink">
        Reserved for {tierLabel}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink/70">
        Elevate your plan to unlock {feature}. {addonName ? `Or add ${addonName} à la carte.` : ""}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/pricing"
          className="rounded-full bg-velvet px-5 py-2 text-xs font-medium uppercase tracking-wider text-white hover:bg-velvet/90"
        >
          Upgrade to {tierLabel}
        </Link>
        {addonName && addonHref && (
          <Link
            to={addonHref}
            className="rounded-full border border-velvet/30 px-5 py-2 text-xs font-medium uppercase tracking-wider text-velvet hover:bg-velvet/5"
          >
            Add {addonName}
          </Link>
        )}
      </div>
      {children && <div className="mt-6 opacity-60 pointer-events-none select-none">{children}</div>}
    </div>
  );
}
