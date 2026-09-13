// Owner AI analyst, Tier 2: the approval endpoints.
//
// Every call here re-verifies the owner allowlist, the owner/super_admin role
// and MFA at aal2 against the request's own bearer token, then re-reads the
// draft row from the database. Client state is never trusted, and approval is
// idempotent because the claim is a single atomic UPDATE.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DraftedAction } from "@/lib/owner-ai-actions";

async function gate(supabase: unknown, userId: string): Promise<string | null> {
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  const { assertOwnerReportAllowlist } = await import("@/lib/owner-report-access");
  await assertOwnerReportAllowlist(supabase as never);
  await assertOwnerAccess(supabase as never, userId);
  const { data } = await (supabase as any).auth.getUser();
  return data?.user?.email ?? null;
}

export const listOwnerActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z.object({ threadId: z.string().uuid().nullable().optional() }), input ?? {}, "owner-ai-actions.functions.ts:24"),
  )
  .handler(async ({ data, context }): Promise<{ actions: DraftedAction[] }> => {
    await gate(context.supabase, context.userId);
    const { listDrafts } = await import("@/lib/owner-ai-actions.server");
    return { actions: await listDrafts({ threadId: data.threadId ?? null }) };
  });

export const approveOwnerAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z
      .object({
        actionId: z.string().uuid(),
        confirmAmountCents: z.number().int().positive().nullable().optional(),
      }), input, "owner-ai-actions.functions.ts:40"),
  )
  .handler(async ({ data, context }): Promise<{ action: DraftedAction }> => {
    const email = await gate(context.supabase, context.userId);
    const { approveDraft } = await import("@/lib/owner-ai-actions.server");
    return {
      action: await approveDraft({
        actionId: data.actionId,
        ownerUserId: context.userId,
        ownerEmail: email,
        confirmAmountCents: data.confirmAmountCents ?? null,
      }),
    };
  });

export const rejectOwnerAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z
      .object({ actionId: z.string().uuid(), reason: z.string().max(400).nullable().optional() }), input, "owner-ai-actions.functions.ts:60"),
  )
  .handler(async ({ data, context }): Promise<{ action: DraftedAction }> => {
    const email = await gate(context.supabase, context.userId);
    const { rejectDraft } = await import("@/lib/owner-ai-actions.server");
    return {
      action: await rejectDraft({
        actionId: data.actionId,
        ownerUserId: context.userId,
        ownerEmail: email,
        reason: data.reason ?? null,
      }),
    };
  });
