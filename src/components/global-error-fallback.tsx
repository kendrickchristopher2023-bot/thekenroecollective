import { Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

/**
 * Plain-language error fallback used by TanStack route error boundaries.
 * Offers "Try again", "Go home", and "Get help" (opens the concierge widget).
 */
export function GlobalErrorFallback({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
    reportLovableError(error, { boundary: "global_error_fallback" });
  }, [error]);

  const openHelp = () => {
    try {
      window.dispatchEvent(new CustomEvent("kc:open-concierge"));
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-[60vh] items-center justify-center bg-background px-4 py-16"
    >
      <div className="max-w-md text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-3xl"
        >
          ⚠️
        </div>
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Something went wrong
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          This page didn't load properly. It's not your fault — try again, or reach
          out and we'll help.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-velvet px-6 py-3 text-base font-medium text-white transition-transform hover:-translate-y-0.5"
          >
            Try again
          </button>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-input bg-background px-6 py-3 text-base font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Go home
          </Link>
          <button
            type="button"
            onClick={openHelp}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-input bg-background px-6 py-3 text-base font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Get help
          </button>
        </div>
      </div>
    </div>
  );
}
