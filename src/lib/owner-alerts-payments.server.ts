import type { StripeEnv } from "@/lib/stripe.server";
import { OWNER_ALERT_DASHBOARD_URL } from "@/lib/owner-alerts.config";

/**
 * Owner alert for a confirmed Stripe payment, fired from the verified webhook
 * so it is reliable and not dependent on the browser returning.
 *
 * Sends an SMS plus an email to the owner. Idempotent per checkout session via
 * the dedupe key. Never throws: a broken alert must not fail the webhook.
 */

const VENTURE_BY_PREFIX: Array<{ match: (key: string) => boolean; venture: string; link: string }> = [
  { match: (k) => k.startsWith("ecard"), venture: "Group eCards", link: "/ecards" },
  { match: (k) => k.startsWith("pm_") || k.startsWith("projects"), venture: "The Workroom", link: "/workroom" },
  { match: (k) => k.startsWith("ad_"), venture: "Vendor hub ads", link: "/vendors" },
  { match: (k) => k.startsWith("vendor"), venture: "Vendor hub", link: "/vendors" },
];

function ventureFor(lookupKeys: string[], kind?: string): { venture: string; link: string } {
  if (kind === "gift_fund") return { venture: "Events gift fund", link: "/events" };
  for (const key of lookupKeys) {
    const hit = VENTURE_BY_PREFIX.find((v) => v.match(key));
    if (hit) return { venture: hit.venture, link: hit.link };
  }
  return { venture: "Events", link: "/events" };
}

function formatUsd(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return `$${value.toFixed(2)}`;
}

export async function alertOwnerOfCheckout(session: any, env: StripeEnv): Promise<void> {
  try {
    // Delayed-notification methods settle later. Only alert on money confirmed
    // (paid) or final zero-total sessions.
    if (session?.payment_status === "unpaid") return;

    let lookupKeys: string[] = [];
    let itemDescriptions: string[] = [];
    try {
      const { createStripeClient } = await import("@/lib/stripe.server");
      const stripe = createStripeClient(env);
      const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
      lookupKeys = items.data
        .map((li) => li.price?.lookup_key)
        .filter((k): k is string => !!k);
      itemDescriptions = items.data.map(
        (li) => `${li.quantity ?? 1} x ${li.description ?? li.price?.lookup_key ?? "item"}`,
      );
    } catch (e) {
      console.error("[owner-alerts] line item lookup failed", e);
    }

    const kind = session?.metadata?.kind as string | undefined;
    const { venture, link } = ventureFor(lookupKeys, kind);
    const amount = formatUsd(session?.amount_total);
    const purchased = itemDescriptions.length
      ? itemDescriptions.join(", ")
      : lookupKeys.join(", ") || (kind ?? "purchase");
    const buyer =
      session?.customer_details?.email || session?.customer_email || "unknown email";
    const envTag = env === "live" ? "" : " (sandbox)";

    const { sendOwnerAlert } = await import("@/lib/owner-alerts.server");
    await sendOwnerAlert({
      kind: "payment_received",
      dedupeKey: `payment:${env}:${session.id}`,
      title: `Payment received: ${amount}${envTag}`,
      lines: [
        `Venture: ${venture}`,
        `Purchased: ${purchased}`,
        `Amount: ${amount}`,
        `Buyer: ${buyer}`,
        session?.metadata?.eventId ? `Event: ${session.metadata.eventId}` : "",
        session?.metadata?.ecardId ? `Card: ${session.metadata.ecardId}` : "",
      ].filter(Boolean),
      link: `${OWNER_ALERT_DASHBOARD_URL.replace("/owner", "")}${link}`,
      sms: `payment received ${amount}${envTag}. ${venture}: ${purchased}. ${buyer}`,
    });
  } catch (e) {
    console.error("[owner-alerts] alertOwnerOfCheckout failed", e);
  }
}
