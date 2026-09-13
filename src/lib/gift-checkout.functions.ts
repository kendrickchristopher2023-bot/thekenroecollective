import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
  getProcessingFeeLineItem,
} from "@/lib/stripe.server";

type Result = { clientSecret: string } | { error: string };

type StatusResult =
  | { paid: true; amount: number; name: string; message?: string }
  | { paid: false };

const StatusInput = z.object({
  sessionId: z.string().min(1),
  environment: z.enum(["sandbox", "live"]),
});

// Server-side confirmation that a gift checkout session actually completed —
// the client must never assume payment succeeded just because it was redirected back.
export const getGiftContributionStatus = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => parseInput(StatusInput, data, "gift-checkout.functions.ts:24"))
  .handler(async ({ data }): Promise<StatusResult> => {
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      if (session.payment_status !== "paid" && session.status !== "complete") {
        return { paid: false };
      }
      // The gift amount, not the checkout total — amount_total now includes
      // the processing fee line item, which isn't part of what the host's
      // gift fund actually received. giftAmountCents is the true figure,
      // stashed in metadata at session creation; amount_total is only a
      // fallback for sessions created before this existed.
      const giftAmountCents = Number(session.metadata?.giftAmountCents);
      const amount = (Number.isFinite(giftAmountCents) && giftAmountCents > 0
        ? giftAmountCents
        : session.amount_total ?? 0) / 100;
      return {
        paid: true,
        amount,
        name: (session.metadata?.contributorName as string | undefined) || "Anonymous",
        message: (session.metadata?.giftMessage as string | undefined) || undefined,
      };
    } catch (error) {
      console.error("getGiftContributionStatus failed", error);
      return { paid: false };
    }
  });

const Input = z.object({
  eventId: z.string().min(1).max(64),
  eventTitle: z.string().min(1).max(200),
  fundLabel: z.string().min(1).max(120),
  amountInCents: z.number().int().min(500).max(2_000_000),
  contributorName: z.string().min(1).max(120),
  contributorEmail: z.string().email().optional(),
  message: z.string().max(500).optional(),
  returnUrl: z.string().url(),
  environment: z.enum(["sandbox", "live"]),
});

export const createGiftContributionCheckout = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => parseInput(Input, data, "gift-checkout.functions.ts:66"))
  .handler(async ({ data }): Promise<Result> => {
    try {
      const stripe = createStripeClient(data.environment as StripeEnv);
      const lineItems: Array<Record<string, unknown>> = [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${data.fundLabel} — ${data.eventTitle}`,
              description: data.message?.slice(0, 200) || undefined,
            },
            unit_amount: data.amountInCents,
          },
          quantity: 1,
        },
      ];
      // Flat processing fee, on top of the gift — kept as its own line item
      // (not folded into unit_amount) so the guest sees it itemized and the
      // gift-fund record can still recover the true gift amount below.
      const feeLineItem = await getProcessingFeeLineItem(stripe);
      if (feeLineItem) lineItems.push(feeLineItem);

      const session = await stripe.checkout.sessions.create({
        line_items: lineItems as any,
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        payment_intent_data: {
          description: `${data.fundLabel} — ${data.eventTitle}`,
          metadata: {
            kind: "gift_fund",
            eventId: data.eventId,
            contributorName: data.contributorName,
            ...(data.contributorEmail && { contributorEmail: data.contributorEmail }),
            ...(data.message && { giftMessage: data.message.slice(0, 200) }),
          },
        },
        metadata: {
          kind: "gift_fund",
          eventId: data.eventId,
          contributorName: data.contributorName,
          // The actual gift amount, separate from amount_total (which now
          // includes the processing fee) — see getGiftContributionStatus and
          // the webhook's recordGiftContribution, which both read this back.
          giftAmountCents: String(data.amountInCents),
          ...(data.message && { giftMessage: data.message.slice(0, 200) }),
        },
        ...(data.contributorEmail && { customer_email: data.contributorEmail }),
      });
      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
