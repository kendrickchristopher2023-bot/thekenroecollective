// Owner AI analyst, Tier 2: storage, approval and execution of drafted actions.
//
// HARD INVARIANTS, enforced here and nowhere else:
//  1. The model can only ever write a `pending` row. It has no execution path.
//  2. Execution only happens inside approveOwnerAction, after the caller has
//     passed the owner allowlist + role + MFA gate in the calling server fn.
//  3. Approval claims the row through claim_owner_ai_action, a single atomic
//     UPDATE ... WHERE status = 'pending' AND expires_at > now(). One row, one
//     winner, so a double-click or a retry can never refund or send twice.
//  4. Everything re-reads the database. Client state is never trusted.
//  5. Every draft, approval and rejection is written to admin_audit_log with
//     the actor's identity and a timestamp.
import {
  PAYLOAD_SCHEMAS,
  checkApproval,
  displayStatus,
  formatMoney,
  type ActionKind,
  type ActionStatus,
  type DraftedAction,
  type Json,
} from "@/lib/owner-ai-actions";
import { logAdminAction } from "@/lib/admin-audit.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

type Row = {
  id: string;
  thread_id: string | null;
  kind: ActionKind;
  status: ActionStatus;
  summary: string;
  payload: Json;
  amount_cents: number | null;
  requires_amount_confirmation: boolean;
  target_user_id: string | null;
  target_label: string | null;
  expires_at: string;
  created_at: string;
  created_by_email: string | null;
  approved_by_email: string | null;
  approved_at: string | null;
  rejected_by_email: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  executed_at: string | null;
  execution_result: Json | null;
  error: string | null;
};

const SELECT =
  "id,thread_id,kind,status,summary,payload,amount_cents,requires_amount_confirmation,target_user_id,target_label,expires_at,created_at,created_by_email,approved_by_email,approved_at,rejected_by_email,rejected_at,reject_reason,executed_at,execution_result,error";

export function toDto(row: Row, now: Date = new Date()): DraftedAction {
  return {
    id: row.id,
    kind: row.kind,
    status: displayStatus(row, now),
    summary: row.summary,
    payload: (row.payload ?? {}) as Json,
    amountCents: row.amount_cents,
    requiresAmountConfirmation: row.requires_amount_confirmation,
    targetLabel: row.target_label,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    createdByEmail: row.created_by_email,
    approvedByEmail: row.approved_by_email,
    approvedAt: row.approved_at,
    rejectedByEmail: row.rejected_by_email,
    rejectedAt: row.rejected_at,
    rejectReason: row.reject_reason,
    executedAt: row.executed_at,
    error: row.error,
    executionResult: row.execution_result,
  };
}

/* -------------------------------- drafting -------------------------------- */

export async function createDraft(args: {
  ownerUserId: string;
  ownerEmail: string | null;
  threadId: string | null;
  kind: ActionKind;
  summary: string;
  payload: Record<string, unknown>;
  amountCents?: number | null;
  targetUserId?: string | null;
  targetLabel?: string | null;
}): Promise<DraftedAction> {
  // Validate the payload against the same schema the executor uses, so a draft
  // that could never execute is never stored in the first place.
  const parsed = PAYLOAD_SCHEMAS[args.kind].parse(args.payload);
  const requiresAmountConfirmation =
    args.kind === "refund" && (args.amountCents ?? 0) > 10_000;

  const sb = await admin();
  const { data, error } = await sb
    .from("owner_ai_actions")
    .insert({
      thread_id: args.threadId,
      created_by_user_id: args.ownerUserId,
      created_by_email: args.ownerEmail,
      kind: args.kind,
      summary: args.summary,
      payload: parsed as unknown as Json,
      amount_cents: args.amountCents ?? null,
      requires_amount_confirmation: requiresAmountConfirmation,
      target_user_id: args.targetUserId ?? null,
      target_label: args.targetLabel ?? null,
      status: "pending",
    })
    .select(SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "The draft could not be saved.");

  await logAdminAction({
    actorUserId: args.ownerUserId,
    action: `owner_ai_draft_${args.kind}`,
    targetUserId: args.targetUserId ?? null,
    details: {
      action_id: (data as Row).id,
      summary: args.summary,
      amount_cents: args.amountCents ?? null,
      target: args.targetLabel ?? null,
    },
  });

  return toDto(data as Row);
}

/* --------------------------------- reading -------------------------------- */

export async function listDrafts(opts: { limit?: number; threadId?: string | null } = {}) {
  const sb = await admin();
  let q = sb
    .from("owner_ai_actions")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(opts.limit ?? 40, 1), 200));
  if (opts.threadId) q = q.eq("thread_id", opts.threadId);
  const { data } = await q;
  const now = new Date();
  return (data ?? []).map((r: Row) => toDto(r, now));
}

export async function getDraft(id: string): Promise<DraftedAction | null> {
  const sb = await admin();
  const { data } = await sb.from("owner_ai_actions").select(SELECT).eq("id", id).maybeSingle();
  return data ? toDto(data as Row) : null;
}

/* -------------------------------- rejecting ------------------------------- */

export async function rejectDraft(args: {
  actionId: string;
  ownerUserId: string;
  ownerEmail: string | null;
  reason?: string | null;
}): Promise<DraftedAction> {
  const sb = await admin();
  const { data, error } = await sb
    .from("owner_ai_actions")
    .update({
      status: "rejected",
      rejected_by_user_id: args.ownerUserId,
      rejected_by_email: args.ownerEmail,
      rejected_at: new Date().toISOString(),
      reject_reason: args.reason ?? null,
    })
    .eq("id", args.actionId)
    .eq("status", "pending")
    .select(SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const current = await getDraft(args.actionId);
    throw new Error(
      current
        ? "That draft is no longer pending, so it cannot be rejected."
        : "That draft no longer exists.",
    );
  }
  await logAdminAction({
    actorUserId: args.ownerUserId,
    action: `owner_ai_reject_${(data as Row).kind}`,
    targetUserId: (data as Row).target_user_id,
    details: { action_id: args.actionId, reason: args.reason ?? null, summary: (data as Row).summary },
  });
  return toDto(data as Row);
}

/* -------------------------------- approving ------------------------------- */

export async function approveDraft(args: {
  actionId: string;
  ownerUserId: string;
  ownerEmail: string | null;
  confirmAmountCents?: number | null;
}): Promise<DraftedAction> {
  const sb = await admin();

  // Read the real row first so the amount-confirmation and expiry rules are
  // checked against the database, never against anything the client sent.
  const { data: fresh } = await sb
    .from("owner_ai_actions")
    .select(SELECT)
    .eq("id", args.actionId)
    .maybeSingle();
  if (!fresh) throw new Error("That draft no longer exists.");
  const pre = checkApproval(fresh as Row, { confirmAmountCents: args.confirmAmountCents ?? null });
  if (!pre.ok) throw new Error(pre.reason);

  // Atomic claim: exactly one caller can move a pending, unexpired row into
  // 'executing'. A second click gets zero rows back and stops here.
  const { data: claimedRows, error: claimError } = await sb.rpc("claim_owner_ai_action", {
    _action_id: args.actionId,
    _approver: args.ownerUserId,
    _approver_email: args.ownerEmail,
  });
  if (claimError) throw new Error(claimError.message);
  const claimed = (claimedRows ?? [])[0] as Row | undefined;
  if (!claimed) {
    const current = await getDraft(args.actionId);
    throw new Error(
      current?.status === "expired"
        ? "That draft expired after 24 hours. Ask for a fresh draft."
        : "That draft is already being carried out or is no longer pending.",
    );
  }

  await logAdminAction({
    actorUserId: args.ownerUserId,
    action: `owner_ai_approve_${claimed.kind}`,
    targetUserId: claimed.target_user_id,
    details: {
      action_id: claimed.id,
      summary: claimed.summary,
      amount_cents: claimed.amount_cents,
      typed_confirmation: claimed.requires_amount_confirmation,
    },
  });

  try {
    const result = await execute(claimed);
    const { data: done } = await sb
      .from("owner_ai_actions")
      .update({
        status: "executed",
        executed_at: new Date().toISOString(),
        execution_result: result,
        error: null,
      })
      .eq("id", claimed.id)
      .select(SELECT)
      .single();
    await logAdminAction({
      actorUserId: args.ownerUserId,
      action: `owner_ai_executed_${claimed.kind}`,
      targetUserId: claimed.target_user_id,
      details: { action_id: claimed.id, result },
    });
    return toDto(done as Row);
  } catch (e: any) {
    const message = e?.message ?? "The action could not be carried out.";
    const { data: failed } = await sb
      .from("owner_ai_actions")
      .update({ status: "failed", error: message })
      .eq("id", claimed.id)
      .select(SELECT)
      .single();
    await logAdminAction({
      actorUserId: args.ownerUserId,
      action: `owner_ai_failed_${claimed.kind}`,
      targetUserId: claimed.target_user_id,
      details: { action_id: claimed.id, error: message },
    });
    return toDto(failed as Row);
  }
}

/* -------------------------------- execution ------------------------------- */

async function execute(row: Row): Promise<Json> {
  const { assertNotDemo } = await import("@/lib/demo-mode.server");
  await assertNotDemo("carrying out drafted owner actions");

  switch (row.kind) {
    case "refund":
      return executeRefund(row);
    case "tier_change":
      return executeTierChange(row);
    case "customer_email":
      return executeCustomerEmail(row);
    case "customer_sms":
      return executeCustomerSms(row);
    case "ticket_reply":
      return executeTicketReply(row);
    default:
      throw new Error("Unknown action kind.");
  }
}

async function executeRefund(row: Row): Promise<Json> {
  const p = PAYLOAD_SCHEMAS.refund.parse(row.payload);
  const { createStripeClient, getStripeErrorMessage } = await import("@/lib/stripe.server");
  const sb = await admin();

  // Second belt: Stripe's own idempotency key is derived from this one draft, so
  // even a retry that somehow got past the row claim cannot double refund.
  try {
    const stripe = createStripeClient(p.environment);
    const refund = await stripe.refunds.create(
      {
        payment_intent: p.paymentIntentId,
        amount: p.amountCents,
        reason: "requested_by_customer",
        metadata: { ownerAiActionId: row.id, reason: p.reason },
      },
      { idempotencyKey: `owner-ai-refund-${row.id}` },
    );
    await sb.from("refund_log").insert({
      user_id: p.userId,
      pass_id: p.passId ?? null,
      stripe_refund_id: refund.id,
      stripe_payment_intent_id: p.paymentIntentId,
      amount_cents: refund.amount ?? p.amountCents,
      currency: refund.currency ?? "usd",
      reason: `owner_ai: ${p.reason}`,
      environment: p.environment,
    });
    if (p.passId) {
      await sb
        .from("one_time_passes")
        .update({
          refunded_at: new Date().toISOString(),
          revoked_at: new Date().toISOString(),
          refund_reason: `owner_ai: ${p.reason}`,
        })
        .eq("id", p.passId);
    }
    return { refundId: refund.id, amount: formatMoney(refund.amount ?? p.amountCents) };
  } catch (e) {
    throw new Error(getStripeErrorMessage(e));
  }
}

async function executeTierChange(row: Row): Promise<Json> {
  const p = PAYLOAD_SCHEMAS.tier_change.parse(row.payload);
  const { applyTier } = await import("@/lib/owner-tier.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const warnings = await applyTier(supabaseAdmin as any, p.userId, p.tier);
  return { tier: p.tier, warnings: warnings.join("; ") || "none" };
}

/**
 * Sends one email to a customer through the app's single server-side send path.
 * Delivery, retries and suppression are handled by the platform.
 */
async function sendOwnerEmail(args: {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData: Record<string, unknown>;
}): Promise<Json> {
  const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
  const res = await enqueueTransactionalEmailServer(args);
  if (!res.ok) {
    if (res.reason === "suppressed") {
      throw new Error("The email could not be sent: this recipient has opted out of emails.");
    }
    throw new Error("Email send failed");
  }
  return { sentTo: args.recipientEmail, messageId: null };
}

async function executeCustomerEmail(row: Row): Promise<Json> {
  const p = PAYLOAD_SCHEMAS.customer_email.parse(row.payload);
  return sendOwnerEmail({
    templateName: "contact-broadcast",
    recipientEmail: p.recipientEmail,
    // One draft, one idempotency key, so the queue rejects a duplicate send.
    idempotencyKey: `owner-ai-email-${row.id}`,
    templateData: {
      subject: p.subject,
      body: p.body,
      senderName: "The Kenroe Collective",
    },
  });
}

async function executeTicketReply(row: Row): Promise<Json> {
  const p = PAYLOAD_SCHEMAS.ticket_reply.parse(row.payload);
  const sent = await sendOwnerEmail({
    templateName: "contact-broadcast",
    recipientEmail: p.recipientEmail,
    idempotencyKey: `owner-ai-ticket-${row.id}`,
    templateData: {
      subject: p.subject,
      body: p.body,
      senderName: "The Kenroe Collective support",
    },
  });
  const sb = await admin();
  await sb
    .from("support_tickets")
    .update({
      final_reply: p.body,
      status: p.closeTicket ? "closed" : "answered",
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.ticketId);
  return { ...sent, ticketId: p.ticketId, ticketStatus: p.closeTicket ? "closed" : "answered" };
}

async function executeCustomerSms(row: Row): Promise<Json> {
  const p = PAYLOAD_SCHEMAS.customer_sms.parse(row.payload);
  const sb = await admin();

  // Respect opt-outs exactly like the guest SMS path does.
  const normalized = p.toPhone.replace(/[^\d+]/g, "");
  const { data: consent } = await sb
    .from("sms_consent_log")
    .select("opted_out")
    .eq("phone_number", normalized)
    .maybeSingle();
  if (consent?.opted_out) throw new Error("That number has opted out of texts.");

  const { error } = await sb.from("sms_outbox").insert({
    event_id: `owner-ai:${row.id}`,
    user_id: p.userId,
    to_phone: normalized,
    body: p.body,
    status: "pending",
  });
  if (error) throw new Error(error.message);
  return { queuedTo: normalized };
}
