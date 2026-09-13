import { toUserMessage } from "@/lib/user-error";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createCheckoutSession } from "@/lib/payments.functions";

interface Props {
  priceId: string;
  quantity?: number;
  discountCode?: string;
  customerEmail?: string;
  userId?: string;
  eventId?: string;
  projectId?: string;
  returnUrl?: string;
}

export function StripeEmbeddedCheckout({ priceId, quantity, discountCode, customerEmail, userId, eventId, projectId, returnUrl }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  const sessionKey = `${priceId}|${quantity ?? 1}|${discountCode ?? ""}|${userId ?? ""}|${eventId ?? ""}|${projectId ?? ""}`;
  const latest = useRef({ customerEmail, userId, eventId, projectId, returnUrl });
  latest.current = { customerEmail, userId, eventId, projectId, returnUrl };

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setClientSecret(null);

    createCheckoutSession({
      data: {
        priceId,
        quantity,
        discountCode,
        customerEmail: latest.current.customerEmail,
        userId: latest.current.userId,
        eventId: latest.current.eventId,
        projectId: latest.current.projectId,
        returnUrl: latest.current.returnUrl || window.location.href,
        environment: getStripeEnvironment(),
      },
    })
      .then((result) => {
        if (cancelled) return;
        if ("error" in result) throw new Error(result.error);
        if (!result.clientSecret) throw new Error("Stripe did not return a client secret");
        setClientSecret(result.clientSecret);
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(toUserMessage(error, "Checkout could not be started."));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const options = useMemo(() => ({ clientSecret }), [clientSecret]);

  if (status === "loading") {
    return <div className="px-6 py-10 text-sm text-muted-foreground">Preparing secure checkout…</div>;
  }

  if (status === "error") {
    return <div className="px-6 py-10 text-sm text-muted-foreground">{message}</div>;
  }

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider key={clientSecret} stripe={getStripe()} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

