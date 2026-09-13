import { Link } from "@tanstack/react-router";
import { RefreshCw, WifiOff } from "lucide-react";

/**
 * Shown when something we tried to fetch did not arrive.
 *
 * Deliberately different from an empty state: an empty state says "nothing is
 * here yet, here is what to do", this one says "we could not load it, here is
 * how to get it". It always resolves to a message and an action, so nothing
 * spins forever and nobody is left guessing.
 */
export function LoadErrorState({
  title = "We couldn't load this just now",
  description = "The connection may have dropped. Check your internet and try again.",
  onRetry,
  back,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  back?: { label: string; to: string };
  className?: string;
}) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`mx-auto flex max-w-xl flex-col items-center rounded-3xl border border-dashed border-ink/20 bg-card/70 px-6 py-10 text-center ${className ?? ""}`}
    >
      <div
        aria-hidden="true"
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink/5 text-ink/70"
      >
        <WifiOff className="h-5 w-5" />
      </div>
      <h3 className="font-serif text-xl text-ink">{title}</h3>
      <p className="mt-2 max-w-md text-base text-muted-foreground">{description}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
          </button>
        )}
        {back && (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <Link
            to={back.to as any}
            className="inline-flex min-h-11 items-center rounded-full border border-ink/15 px-6 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
          >
            {back.label}
          </Link>
        )}
      </div>
    </div>
  );
}
