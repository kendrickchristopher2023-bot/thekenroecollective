import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { fetchPublicEvent, giftFundTotal, useEvent, type KEvent } from "@/lib/events-store";
import { useEventRealtime } from "@/hooks/use-event-realtime";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import {
  createGiftContributionCheckout,
  getGiftContributionStatus,
} from "@/lib/gift-checkout.functions";

export const Route = createFileRoute("/gift/$eventId")({
  validateSearch: (s: Record<string, unknown>) => ({
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: "Contribute a gift — The Kenroe Collective" },
      { name: "description", content: "Send a gift contribution toward this celebration." },
      { property: "og:title", content: "Contribute a gift" },
      { property: "og:url", content: `https://thekenroecollective.com/gift/${params.eventId}` },
    ],
    links: [{ rel: "canonical", href: `https://thekenroecollective.com/gift/${params.eventId}` }],
  }),
  component: GiftPage,
});

function GiftPage() {
  const { eventId } = Route.useParams();
  const { session_id } = Route.useSearch();
  const localEvent = useEvent(eventId);
  const [remoteEvent, setRemoteEvent] = useState<KEvent | null | undefined>(undefined);
  useEffect(() => {
    if (localEvent) return;
    let cancelled = false;
    fetchPublicEvent(eventId).then((ev) => {
      if (!cancelled) setRemoteEvent(ev ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, localEvent]);
  const onRealtime = useCallback((next: KEvent | null) => setRemoteEvent(next), []);
  useEventRealtime(eventId, onRealtime);
  const event = localEvent ?? (remoteEvent || undefined);

  const [amount, setAmount] = useState<number>(50);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState<"form" | "pay">("form");

  // The contribution itself is recorded server-side by the Stripe webhook
  // (the source of truth for amount/name/payment status) — this only checks
  // whether the redirect actually corresponds to a completed payment.
  const [confirmation, setConfirmation] = useState<
    | { status: "checking" }
    | { status: "paid"; amount: number; name: string; message?: string }
    | { status: "unpaid" }
  >({ status: "checking" });
  useEffect(() => {
    if (!session_id) return;
    let cancelled = false;
    getGiftContributionStatus({
      data: { sessionId: session_id, environment: getStripeEnvironment() },
    }).then((res) => {
      if (cancelled) return;
      setConfirmation(
        res.paid
          ? { status: "paid", amount: res.amount, name: res.name, message: res.message }
          : { status: "unpaid" },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [session_id]);

  const fund = event?.giftFund;

  const fetchClientSecret = useMemo(() => {
    if (!event || !fund) return null;
    return async (): Promise<string> => {
      const res = await createGiftContributionCheckout({
        data: {
          eventId,
          eventTitle: event.title,
          fundLabel: fund.label,
          amountInCents: Math.round(amount * 100),
          contributorName: name || "Anonymous",
          contributorEmail: email || undefined,
          message: message || undefined,
          returnUrl: `${window.location.origin}/gift/${eventId}?session_id={CHECKOUT_SESSION_ID}`,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in res) throw new Error(res.error);
      return res.clientSecret;
    };
  }, [event, fund, eventId, amount, name, email, message]);

  if (!event) {
    if (remoteEvent === undefined) {
      return (
        <Shell>
          <p className="text-center text-sm text-muted-foreground">Loading…</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <h1 className="font-serif text-3xl">We couldn't find this celebration</h1>
        <p className="mt-2 text-base text-muted-foreground">
          The link may be incomplete, or the host may have closed the page. Ask whoever invited you
          to resend it.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm text-velvet underline">
          Go to the home page
        </Link>
      </Shell>
    );
  }

  if (!fund?.enabled) {
    return (
      <Shell>
        <h1 className="font-serif text-3xl">No gift fund yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The host hasn't opened a contribution fund for this celebration.
        </p>
        <Link to="/invite/$eventId" params={{ eventId }} className="mt-6 inline-block text-sm text-velvet underline">
          ← Back to invite
        </Link>
      </Shell>
    );
  }

  // Post-checkout state — only ever shows a confirmation once payment is
  // verified server-side; a failed or cancelled checkout never fakes success.
  if (session_id) {
    if (confirmation.status === "checking") {
      return (
        <Shell>
          <p className="text-center text-sm text-muted-foreground">Confirming your gift…</p>
        </Shell>
      );
    }
    if (confirmation.status === "unpaid") {
      return (
        <Shell>
          <h1 className="font-serif text-3xl">Payment not completed</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We couldn't confirm this payment went through, so nothing has been recorded. If you were
            charged, please reach out to the hosts — otherwise, feel free to try again.
          </p>
          <Link
            to="/gift/$eventId"
            params={{ eventId }}
            search={{ session_id: undefined }}
            className="mt-8 inline-block rounded-full bg-ink px-5 py-2 text-sm font-medium text-white hover:bg-velvet"
          >
            Try again
          </Link>
        </Shell>
      );
    }
    return (
      <Shell>
        <p className="text-[10px] uppercase tracking-widest text-velvet">Thank you</p>
        <h1 className="mt-2 font-serif text-4xl">{fund.thankYouNote || "Your gift means the world."}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your ${confirmation.amount} contribution is confirmed and a receipt is on its way to your inbox.
          The hosts will see it right away.
        </p>
        <Link to="/invite/$eventId" params={{ eventId }} className="mt-8 inline-block rounded-full bg-ink px-5 py-2 text-sm font-medium text-white hover:bg-velvet">
          ← Back to invite
        </Link>
      </Shell>
    );
  }

  const total = giftFundTotal(event);
  const pct = fund.goal && fund.goal > 0 ? Math.min(100, Math.round((total / fund.goal) * 100)) : 0;

  return (
    <Shell>
      <p className="text-[10px] uppercase tracking-widest text-velvet">{event.title}</p>
      <h1 className="mt-1 font-serif text-4xl">{fund.label}</h1>
      {fund.description && <p className="mt-3 text-sm text-muted-foreground">{fund.description}</p>}

      {fund.goal ? (
        <div className="mt-6">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>${total.toLocaleString()} raised</span>
            <span>Goal ${fund.goal.toLocaleString()}</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-velvet transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      {stage === "form" ? (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || amount < 5) return;
            setStage("pay");
          }}
        >
          <div>
            <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Choose an amount
            </label>
            <div className="flex flex-wrap gap-2">
              {(fund.presetAmounts ?? [25, 50, 100, 250]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAmount(a)}
                  className={`rounded-full px-4 py-1.5 text-sm ring-1 transition ${
                    amount === a
                      ? "bg-velvet text-white ring-velvet"
                      : "bg-card text-ink ring-ink/10 hover:bg-secondary"
                  }`}
                >
                  ${a}
                </button>
              ))}
              <input
                type="number"
                min={5}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="w-28 rounded-full bg-secondary px-4 py-1.5 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
                placeholder="Custom"
              />
            </div>
          </div>
          <Input label="Your name" value={name} onChange={setName} required />
          <Input label="Email (for receipt)" value={email} onChange={setEmail} type="email" />
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              A note for the hosts (optional)
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
            />
          </div>
          <button
            type="submit"
            disabled={!name.trim() || amount < 5}
            className="w-full rounded-full bg-velvet px-5 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Continue to secure checkout · ${amount}
          </button>
        </form>
      ) : (
        <div className="mt-8">
          <button
            onClick={() => setStage("form")}
            className="mb-4 text-xs text-muted-foreground hover:text-ink"
          >
            ← Change amount
          </button>
          {fetchClientSecret && (
            <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>
      )}
    </Shell>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-velvet/30"
      />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto max-w-xl px-6 py-16">{children}</section>
      <SiteFooter />
    </div>
  );
}
