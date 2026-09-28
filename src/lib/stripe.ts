import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { isDemoRuntime } from "@/lib/demo-mode";

type StripeEnv = "sandbox" | "live";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

function paymentsEnvironment(): StripeEnv {
  // Demo environment: sandbox only, never the live token. If this build ships
  // a live publishable key, checkout is disabled in the demo rather than
  // silently charging a real card.
  if (isDemoRuntime()) {
    if (clientToken?.startsWith("pk_test_")) return "sandbox";
    throw new Error(
      "Checkout is disabled in the demo environment. Live payments are never enabled here.",
    );
  }
  if (clientToken?.startsWith("pk_test_")) return "sandbox";
  if (clientToken?.startsWith("pk_live_")) return "live";
  throw new Error(
    "Payments are not configured for this build. Complete go-live in your Lovable project to enable production checkout.",
  );
}


let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    paymentsEnvironment();
    stripePromise = loadStripe(clientToken as string);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return paymentsEnvironment();
}

export function isPaymentsConfigured(): boolean {
  return Boolean(clientToken);
}
