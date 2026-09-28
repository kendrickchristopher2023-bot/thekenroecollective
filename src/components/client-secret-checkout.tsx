import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { getStripe } from "@/lib/stripe";
import { toUserMessage } from "@/lib/user-error";

/**
 * Embedded Stripe checkout that asks the server for a session exactly once per
 * mount, then hands Stripe a fixed client secret.
 *
 * Passing an inline `fetchClientSecret` to EmbeddedCheckoutProvider gave it a
 * new function on every render. On pages that refetch in the background (the
 * eCard dashboard polls every 30s) Stripe then tried to start a second
 * checkout and threw "You cannot have multiple Embedded Checkout objects",
 * leaving an empty panel and no way to pay. A failed session request was also
 * swallowed by Stripe, so the buyer saw nothing at all. Here the error is shown
 * with a retry button instead.
 */
export function ClientSecretCheckout({
  loadClientSecret,
  onComplete,
}: {
  /** Creates the Checkout Session. Return `{ error }` to show a sentence to the buyer. */
  loadClientSecret: () => Promise<{ clientSecret: string } | { error: string }>;
  onComplete?: () => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Read the latest callbacks without restarting the session on every render.
  const latest = useRef({ loadClientSecret, onComplete });
  latest.current = { loadClientSecret, onComplete };

  useEffect(() => {
    let cancelled = false;
    setClientSecret(null);
    setError(null);
    // Wrapped so a synchronous throw (payments not configured) is shown too.
    Promise.resolve()
      .then(() => latest.current.loadClientSecret())
      .then((res) => {
        if (cancelled) return;
        if ("error" in res) throw new Error(res.error);
        if (!res.clientSecret) throw new Error("Checkout could not be started. Please try again.");
        setClientSecret(res.clientSecret);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(toUserMessage(e, "Checkout could not be started. Please try again."));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // onComplete is only passed when asked for: Stripe rejects it on sessions
  // created with redirect_on_completion "always".
  const hasOnComplete = Boolean(onComplete);
  const options = useMemo(
    () =>
      hasOnComplete
        ? { clientSecret, onComplete: () => latest.current.onComplete?.() }
        : { clientSecret },
    [clientSecret, hasOnComplete],
  );

  if (error) {
    return (
      <div className="px-3 py-6 text-sm text-ink/80">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-3 inline-flex min-h-11 items-center rounded-full border border-ink/15 px-5 py-2 text-sm font-medium text-ink"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!clientSecret) {
    return <p className="px-3 py-6 text-sm text-muted-foreground">Preparing secure checkout…</p>;
  }
  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider key={clientSecret} stripe={getStripe()} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
