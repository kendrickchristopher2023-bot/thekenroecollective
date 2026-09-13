// Owner AI analyst, Tier 2: the shared rules for drafted actions.
//
// Pure logic only, no database and no network, so both the server executor and
// the panel agree on the same invariants and so the rules are unit testable:
//   - a draft is only ever a draft, a human must approve it
//   - refunds over $100 need the amount typed to confirm
//   - drafts expire 24 hours after they are created and can never be approved
//     after that
import { z } from "zod";

export const ACTION_KINDS = [
  "refund",
  "tier_change",
  "customer_email",
  "customer_sms",
  "ticket_reply",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

/** Plain, serializable JSON, so drafts can cross the server boundary. */
export type Json = { [key: string]: string | number | boolean | null | Json | Json[] };

export type ActionStatus =
  | "pending"
  | "executing"
  | "executed"
  | "failed"
  | "rejected"
  | "expired";

/** Drafts stop being approvable exactly 24 hours after they were created. */
export const ACTION_TTL_MS = 24 * 60 * 60 * 1000;

/** At or under this amount a refund is one click. Above it, type the amount. */
export const REFUND_ONE_CLICK_MAX_CENTS = 10_000;

export function needsAmountConfirmation(amountCents: number | null | undefined): boolean {
  return (amountCents ?? 0) > REFUND_ONE_CLICK_MAX_CENTS;
}

export function formatMoney(cents: number | null | undefined): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

export const KIND_LABELS: Record<ActionKind, string> = {
  refund: "Refund",
  tier_change: "Plan change",
  customer_email: "Customer email",
  customer_sms: "Customer text",
  ticket_reply: "Support reply",
};

/** What the panel receives. Never includes anything the owner cannot see anyway. */
export type DraftedAction = {
  id: string;
  kind: ActionKind;
  status: ActionStatus;
  summary: string;
  payload: Json;
  amountCents: number | null;
  requiresAmountConfirmation: boolean;
  targetLabel: string | null;
  expiresAt: string;
  createdAt: string;
  createdByEmail: string | null;
  approvedByEmail: string | null;
  approvedAt: string | null;
  rejectedByEmail: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  executedAt: string | null;
  error: string | null;
  executionResult: Json | null;
};

export function isExpired(
  row: { status: ActionStatus; expires_at: string },
  now: Date = new Date(),
): boolean {
  return row.status === "pending" && new Date(row.expires_at).getTime() <= now.getTime();
}

/** Status as the owner should see it, so a stale pending row reads as expired. */
export function displayStatus(
  row: { status: ActionStatus; expires_at: string },
  now: Date = new Date(),
): ActionStatus {
  return isExpired(row, now) ? "expired" : row.status;
}

/**
 * Client-side and server-side pre-check for an approval. The server still
 * re-checks everything against the freshly read row, this only avoids pointless
 * round trips and keeps both sides honest about the same rules.
 */
export function checkApproval(
  row: {
    status: ActionStatus;
    expires_at: string;
    amount_cents: number | null;
    requires_amount_confirmation: boolean;
  },
  opts: { confirmAmountCents?: number | null; now?: Date } = {},
): { ok: true } | { ok: false; reason: string } {
  const now = opts.now ?? new Date();
  if (row.status !== "pending") {
    return {
      ok: false,
      reason:
        row.status === "executed"
          ? "That draft has already been carried out."
          : row.status === "executing"
            ? "That draft is being carried out right now."
            : row.status === "rejected"
              ? "That draft was rejected and cannot be approved."
              : "That draft is no longer pending.",
    };
  }
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: "That draft expired after 24 hours. Ask for a fresh draft." };
  }
  if (row.requires_amount_confirmation || needsAmountConfirmation(row.amount_cents)) {
    if (opts.confirmAmountCents == null) {
      return {
        ok: false,
        reason: `Refunds over ${formatMoney(REFUND_ONE_CLICK_MAX_CENTS)} need the amount typed to confirm.`,
      };
    }
    if (opts.confirmAmountCents !== (row.amount_cents ?? -1)) {
      return {
        ok: false,
        reason: `The amount you typed does not match ${formatMoney(row.amount_cents)}.`,
      };
    }
  }
  return { ok: true };
}

/** Parses a typed confirmation such as "$1,250.00" or "1250" into cents. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/* ----------------------------- payload shapes ----------------------------- */

export const RefundPayload = z.object({
  userId: z.string().uuid(),
  paymentIntentId: z.string().min(6).max(120),
  amountCents: z.number().int().positive().max(500_000),
  environment: z.enum(["live", "sandbox"]),
  reason: z.string().min(3).max(300),
  passId: z.string().uuid().nullable().optional(),
});

export const TierChangePayload = z.object({
  userId: z.string().uuid(),
  tier: z.enum(["postcard", "whisper", "host", "atelier"]),
  reason: z.string().min(3).max(300),
});

export const CustomerEmailPayload = z.object({
  recipientEmail: z.string().email().max(320),
  subject: z.string().min(3).max(160),
  body: z.string().min(10).max(4000),
});

export const CustomerSmsPayload = z.object({
  toPhone: z.string().min(7).max(24),
  body: z.string().min(5).max(320),
  userId: z.string().uuid(),
});

export const TicketReplyPayload = z.object({
  ticketId: z.string().uuid(),
  recipientEmail: z.string().email().max(320),
  subject: z.string().min(3).max(160),
  body: z.string().min(10).max(4000),
  closeTicket: z.boolean().optional(),
});

export const PAYLOAD_SCHEMAS = {
  refund: RefundPayload,
  tier_change: TierChangePayload,
  customer_email: CustomerEmailPayload,
  customer_sms: CustomerSmsPayload,
  ticket_reply: TicketReplyPayload,
} as const;
