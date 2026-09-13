import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared skeleton building blocks.
 *
 * The base `Skeleton` from shadcn/ui uses `animate-pulse` on `bg-primary/10`.
 * A subtle warm cream tint is provided via the `bg-ink/[0.06]` override so
 * these placeholders sit naturally on the paper backgrounds used across
 * the site.
 */

function Bar({ className }: { className?: string }) {
  return <Skeleton className={`bg-ink/[0.06] ${className ?? ""}`} />;
}

export function EventCardSkeleton() {
  return (
    <div className="rounded-2xl border border-ink/5 bg-card p-5 shadow-sm">
      <Bar className="h-40 w-full rounded-lg" />
      <Bar className="mt-4 h-5 w-2/3" />
      <Bar className="mt-2 h-4 w-1/2" />
      <div className="mt-4 flex gap-2">
        <Bar className="h-8 w-20 rounded-full" />
        <Bar className="h-8 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function EventCardsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading events"
    >
      {Array.from({ length: count }).map((_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function EventHeaderSkeleton() {
  return (
    <div
      className="rounded-2xl border border-ink/5 bg-card p-6"
      role="status"
      aria-label="Loading event"
    >
      <Bar className="h-8 w-2/3" />
      <div className="mt-3 flex flex-wrap gap-3">
        <Bar className="h-4 w-40" />
        <Bar className="h-4 w-56" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Bar className="h-16 rounded-lg" />
        <Bar className="h-16 rounded-lg" />
        <Bar className="h-16 rounded-lg" />
        <Bar className="h-16 rounded-lg" />
      </div>
    </div>
  );
}

export function TabContentSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      <Bar className="h-6 w-1/3" />
      <Bar className="h-4 w-full" />
      <Bar className="h-4 w-11/12" />
      <Bar className="h-4 w-4/5" />
      <Bar className="mt-4 h-24 w-full rounded-lg" />
    </div>
  );
}

export function GuestListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading guest list">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-ink/5 bg-card p-3"
        >
          <Bar className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Bar className="h-4 w-1/3" />
            <Bar className="h-3 w-1/2" />
          </div>
          <Bar className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SeatingChartSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading seating chart">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Bar className="h-16 rounded-lg" />
        <Bar className="h-16 rounded-lg" />
        <Bar className="h-16 rounded-lg" />
        <Bar className="h-16 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Bar key={i} className="aspect-square rounded-full" />
        ))}
      </div>
    </div>
  );
}

export function TierCardSkeleton() {
  return (
    <div className="rounded-2xl border border-ink/5 bg-card p-6">
      <Bar className="h-6 w-24" />
      <Bar className="mt-3 h-10 w-32" />
      <div className="mt-6 space-y-2">
        <Bar className="h-4 w-full" />
        <Bar className="h-4 w-11/12" />
        <Bar className="h-4 w-4/5" />
        <Bar className="h-4 w-3/4" />
      </div>
      <Bar className="mt-6 h-10 w-full rounded-lg" />
    </div>
  );
}

export function TierCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      role="status"
      aria-label="Loading pricing"
    >
      {Array.from({ length: count }).map((_, i) => (
        <TierCardSkeleton key={i} />
      ))}
    </div>
  );
}

// ---- Legacy generic skeletons preserved for existing call sites ----

export function SkeletonBlock({ className }: { className?: string }) {
  return <Bar className={className} />;
}

export function SkeletonCardGrid({
  cards = 6,
  aspect = "aspect-[4/3]",
}: {
  cards?: number;
  aspect?: string;
}) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-ink/5 bg-card p-4">
          <Bar className={`${aspect} w-full rounded-lg`} />
          <Bar className="mt-3 h-4 w-2/3" />
          <Bar className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTileGrid({ tiles = 8 }: { tiles?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: tiles }).map((_, i) => (
        <Bar key={i} className="aspect-square w-full rounded-lg" />
      ))}
    </div>
  );
}

export function SkeletonPanel() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      <Bar className="h-6 w-1/3" />
      <Bar className="h-4 w-full" />
      <Bar className="h-4 w-11/12" />
      <Bar className="h-40 w-full rounded-lg" />
    </div>
  );
}
