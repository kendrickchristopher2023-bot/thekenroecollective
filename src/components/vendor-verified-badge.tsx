import { BadgeCheck } from "lucide-react";

export function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Verified by The Kenroe Collective team"
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400 ${className}`}
    >
      <BadgeCheck className="h-3 w-3" aria-hidden="true" />
      Verified
    </span>
  );
}
