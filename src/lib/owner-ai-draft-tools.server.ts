// Owner AI analyst, Tier 2: the DRAFT-ONLY tool registry.
//
// Nothing in this file moves money, changes a plan, or sends anything. Every
// tool writes one `pending` row to owner_ai_actions and returns its id. The
// only code that can execute a row is approveOwnerAction, which requires a
// human owner to click Approve and re-verifies allowlist + role + MFA first.
import { tool } from "ai";
import { z } from "zod";
import { formatMoney, needsAmountConfirmation } from "@/lib/owner-ai-actions";

export type DraftContext = {
  ownerUserId: string;
  ownerEmail: string | null;
  threadId: string | null;
};

const drafted: Array<{ id: string; kind: string; summary: string }> = [];

/** Drafts created while answering the current question. */
export function takeDrafts() {
  const out = drafted.slice();
  drafted.length = 0;
  return out;
}

async function create(
  ctx: DraftContext,
  args: {
    kind: "refund" | "tier_change" | "customer_email" | "customer_sms" | "ticket_reply";
    summary: string;
    payload: Record<string, unknown>;
    amountCents?: number | null;
    targetUserId?: string | null;
    targetLabel?: string | null;
  },
) {
  const { createDraft } = await import("@/lib/owner-ai-actions.server");
  const draft = await createDraft({ ...args, ...ctx });
  drafted.push({ id: draft.id, kind: draft.kind, summary: draft.summary });
  return {
    draftId: draft.id,
    status: "pending_owner_approval",
    summary: draft.summary,
    expiresAt: draft.expiresAt,
    requiresTypedAmountConfirmation: draft.requiresAmountConfirmation,
    note: "Nothing has happened yet. This is a draft waiting for the owner to click Approve. It expires in 24 hours.",
  };
}

export function buildOwnerDraftTools(ctx: DraftContext) {
  return {
    draft_refund: tool({
      description:
        "Draft a refund for review. Does NOT refund anything. Requires the Stripe payment intent id, the customer's user id, and the amount in cents. Look these up first with the read tools. Refunds over $100 will require the owner to type the amount to confirm.",
      inputSchema: z.object({
        userId: z.string().uuid().describe("The customer's account id."),
        paymentIntentId: z.string().describe("Stripe payment intent id, starts with pi_."),
        amountCents: z.number().int().positive().describe("Amount to refund, in cents."),
        environment: z.enum(["live", "sandbox"]),
        reason: z.string().describe("Why this refund is being proposed."),
        passId: z.string().uuid().nullable().optional(),
        customerLabel: z.string().describe("The customer's email, for the owner to read."),
      }),
      execute: async (input) =>
        create(ctx, {
          kind: "refund",
          summary: `Refund ${formatMoney(input.amountCents)} to ${input.customerLabel} (${input.environment}). Reason: ${input.reason}.${
            needsAmountConfirmation(input.amountCents)
              ? " Over $100, so the owner must type the amount to confirm."
              : ""
          }`,
          payload: {
            userId: input.userId,
            paymentIntentId: input.paymentIntentId,
            amountCents: input.amountCents,
            environment: input.environment,
            reason: input.reason,
            passId: input.passId ?? null,
          },
          amountCents: input.amountCents,
          targetUserId: input.userId,
          targetLabel: input.customerLabel,
        }),
    }),

    draft_tier_change: tool({
      description:
        "Draft a plan change for one account for review. Does NOT change anything. Use find_account first to get the account id and current plan.",
      inputSchema: z.object({
        userId: z.string().uuid(),
        tier: z.enum(["postcard", "whisper", "host", "atelier"]),
        reason: z.string(),
        customerLabel: z.string().describe("The customer's email, for the owner to read."),
      }),
      execute: async (input) =>
        create(ctx, {
          kind: "tier_change",
          summary: `Move ${input.customerLabel} to the ${input.tier} plan. Reason: ${input.reason}.`,
          payload: { userId: input.userId, tier: input.tier, reason: input.reason },
          targetUserId: input.userId,
          targetLabel: input.customerLabel,
        }),
    }),

    draft_customer_email: tool({
      description:
        "Draft an email to one customer for review. Does NOT send anything. Write the full subject and body in plain, warm business English.",
      inputSchema: z.object({
        recipientEmail: z.string().email(),
        subject: z.string(),
        body: z.string().describe("The full message. Plain text, line breaks allowed."),
      }),
      execute: async (input) =>
        create(ctx, {
          kind: "customer_email",
          summary: `Email ${input.recipientEmail}, subject "${input.subject}".`,
          payload: input,
          targetLabel: input.recipientEmail,
        }),
    }),

    draft_customer_sms: tool({
      description:
        "Draft a text message to one customer for review. Does NOT send anything. Keep it under 300 characters. Needs the customer's account id and mobile number.",
      inputSchema: z.object({
        userId: z.string().uuid(),
        toPhone: z.string(),
        body: z.string(),
        customerLabel: z.string(),
      }),
      execute: async (input) =>
        create(ctx, {
          kind: "customer_sms",
          summary: `Text ${input.customerLabel} at ${input.toPhone}: "${input.body}"`,
          payload: { userId: input.userId, toPhone: input.toPhone, body: input.body },
          targetUserId: input.userId,
          targetLabel: input.customerLabel,
        }),
    }),

    draft_ticket_reply: tool({
      description:
        "Draft a reply to a support ticket for review. Does NOT send anything and does NOT change the ticket. Use get_support_tickets first to get the ticket id and the contact email.",
      inputSchema: z.object({
        ticketId: z.string().uuid(),
        recipientEmail: z.string().email(),
        subject: z.string(),
        body: z.string(),
        closeTicket: z.boolean().optional().describe("Close the ticket once the reply is sent."),
      }),
      execute: async (input) =>
        create(ctx, {
          kind: "ticket_reply",
          summary: `Reply to ${input.recipientEmail} on support ticket, subject "${input.subject}"${
            input.closeTicket ? ", and close the ticket" : ""
          }.`,
          payload: input,
          targetLabel: input.recipientEmail,
        }),
    }),
  };
}
