/**
 * /cart-checkout — embedded Stripe checkout for the current open Selections.
 *
 * Creates one Stripe session from all cart_items and mounts the same
 * EmbeddedCheckout the single-item flow uses. On completion, the route
 * runs `completeCart` to mark the cart done and clear items, then relies
 * on the existing `confirmCheckoutSession` fan-out (called from the return
 * URL search params) to actually unlock the addons.
 */
import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import {
  createCartCheckoutSession,
  completeCart,
  getCart,
  type CartSnapshot,
} from "@/lib/cart.functions";
import { confirmCheckoutSession } from "@/lib/payments.functions";
import { formatMoney } from "@/lib/cart-catalog";

export const Route = createFileRoute("/cart-checkout")({
  head: () => ({
    meta: [
      { title: "Review & pay — The Kenroe Collective" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartCheckoutRoute,
});

function CartCheckoutRoute() {
  const [snap, setSnap] = useState<CartSnapshot | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "empty">("loading");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const env = getStripeEnvironment();
        const s = await getCart({ data: { environment: env } });
        if (cancelled) return;
        setSnap(s);
        if (s.items.length === 0) {
          setStatus("empty");
          return;
        }
        const result = await createCartCheckoutSession({
          data: {
            returnUrl: `${window.location.origin}/cart-checkout?session_id={CHECKOUT_SESSION_ID}`,
            environment: env,
          },
        });
        if (cancelled) return;
        if ("error" in result) {
          setError(result.error);
          setStatus("error");
          return;
        }
        setClientSecret(result.clientSecret);
        setSessionId(result.sessionId);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(toUserMessage(e, "Could not start checkout."));
        setStatus("error");
      }
    }

    // If we just returned from Stripe, session_id is in the URL — finalize.
    const params = new URLSearchParams(window.location.search);
    const returnedSession = params.get("session_id");
    if (returnedSession) {
      (async () => {
        try {
          const env = getStripeEnvironment();
          await completeCart({ data: { sessionId: returnedSession, environment: env } });
          const conf = await confirmCheckoutSession({
            data: { sessionId: returnedSession, environment: env },
          });
          if ("error" in conf) toast.error(conf.error);
          else toast.success("Selections unlocked. Thank you.");
          navigate({ to: "/profile", search: { tab: undefined } });
        } catch (e) {
          toast.error(toUserMessage(e, "Could not finalize your order."));
          navigate({ to: "/profile", search: { tab: undefined } });
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    start();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const options = useMemo(() => ({ clientSecret }), [clientSecret]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Review & pay</h1>
        <p className="mt-2 text-sm text-ink/60">
          One secure payment for everything in your Selections.
        </p>
      </header>

      {status === "loading" && (
        <div className="rounded-2xl border border-ink/5 bg-paper p-8 text-sm text-ink/60">
          Preparing secure checkout…
        </div>
      )}

      {status === "empty" && (
        <div className="rounded-2xl border border-ink/5 bg-paper p-8 text-center">
          <p className="text-sm text-ink/60">Your Selections is empty.</p>
          <button
            type="button"
            onClick={() => navigate({ to: "/pricing" })}
            className="mt-4 rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            Browse add-ons
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
          {error ?? "Could not start checkout."}
        </div>
      )}

      {status === "ready" && snap && (
        <div className="grid gap-6 md:grid-cols-[1fr_360px]">
          <div id="checkout" className="rounded-2xl border border-ink/5 bg-paper p-2">
            <EmbeddedCheckoutProvider key={clientSecret} stripe={getStripe()} options={options}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </div>
          <aside className="rounded-2xl border border-ink/5 bg-paper p-5">
            <h2 className="text-sm font-semibold text-ink">Summary</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {snap.items.map((it) => (
                <li key={it.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-ink">{it.catalog?.name ?? it.sku}</p>
                    <p className="text-[11px] text-ink/40">
                      Qty {it.quantity}
                      {it.event_id ? " · per-event" : ""}
                    </p>
                  </div>
                  <span className="tabular-nums text-ink">
                    {formatMoney((it.unit_amount_cents ?? 0) * it.quantity, it.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t border-ink/5 pt-3">
              <span className="text-sm text-ink/60">Subtotal</span>
              <span className="text-lg font-semibold text-ink">
                {formatMoney(snap.subtotal_cents)}
              </span>
            </div>
            <p className="mt-3 text-[11px] text-ink/40">
              Taxes and any promo codes apply on the payment form.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
