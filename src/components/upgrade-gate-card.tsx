// Consistent inline upgrade card used to replace Postcard-locked feature
// surfaces (photo wall, seating, check-in, RFQ, exports, etc.). Prefer this
// over ad-hoc disabled banners so the tone stays aspirational.
import { Link } from "@tanstack/react-router";
import type { FeatureKey } from "@/lib/postcard-gates";
import { POSTCARD_UPGRADE_COPY } from "@/lib/postcard-gates";

const TIER_LABEL: Record<"whisper" | "host" | "atelier", string> = {
  whisper: "Whisper",
  host: "Host",
  atelier: "Atelier",
};

export function UpgradeGateCard({
  feature,
  title,
  description,
  compact,
}: {
  feature: FeatureKey;
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const copy = POSTCARD_UPGRADE_COPY[feature];
  const tierName = TIER_LABEL[copy.target];
  return (
    <div
      className={`rounded-2xl border border-velvet/20 bg-velvet/5 ${
        compact ? "p-4" : "p-6"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-velvet">
        Unlock with {tierName}
      </p>
      <h3 className={`mt-1 font-serif ${compact ? "text-lg" : "text-xl"} text-ink`}>
        {title ?? copy.title}
      </h3>
      <p className="mt-1 text-sm text-ink/70">{description ?? copy.description}</p>
      <Link
        to={"/pricing?category=events&billing=monthly" as any}
        className="mt-3 inline-flex items-center justify-center rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:opacity-90"
      >
        Upgrade to {tierName} →
      </Link>
    </div>
  );
}
