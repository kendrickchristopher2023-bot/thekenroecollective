// Owner Command Center, Phase 3: issue list plus safe actions, server gated.
//
// Every function below runs the same gate as the Owner Report itself:
// allowlisted owner email, owner role, and a satisfied 2FA challenge (aal2).
// Nothing here can delete, refund, reveal, or edit customer content.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ActionableIssue } from "@/lib/owner-issues-actions.server";

export type { ActionableIssue } from "@/lib/owner-issues-actions.server";

const Range = z.object({
  since: z.string(),
  until: z.string(),
  venture: z.enum(["all", "events", "ecards", "projects", "resume"]).optional(),
});


/** Allowlist, then role, then MFA. Returns the verified actor for the audit row. */
async function gate(
  supabase: any,
  userId: string,
): Promise<{ userId: string; email: string | null }> {
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  const { assertOwnerReportAllowlist } = await import("@/lib/owner-report-access");
  await assertOwnerReportAllowlist(supabase);
  await assertOwnerAccess(supabase, userId);
  const { data } = await supabase.auth.getUser();
  return { userId, email: data?.user?.email ?? null };
}

export const listOwnerIssues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(Range, input, "owner-issues.functions.ts:35"))
  .handler(async ({ data, context }): Promise<{ issues: ActionableIssue[] }> => {
    await gate(context.supabase, context.userId);
    const { loadActionableIssues } = await import("@/lib/owner-issues-actions.server");
    return { issues: await loadActionableIssues(data.since, data.until, data.venture ?? "all") };
  });


export const resolveIssueError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z.object({ fingerprint: z.string().min(1).max(200) }), input, "owner-issues.functions.ts:46"),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; updated: number }> => {
    const actor = await gate(context.supabase, context.userId);
    const { markErrorGroupResolved } = await import("@/lib/owner-issues-actions.server");
    return markErrorGroupResolved(actor, data.fingerprint);
  });

export const suppressBouncingEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z.object({ email: z.string().email().max(320) }), input, "owner-issues.functions.ts:57"),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; alreadySuppressed: boolean }> => {
    const actor = await gate(context.supabase, context.userId);
    const { suppressEmailAddress } = await import("@/lib/owner-issues-actions.server");
    return suppressEmailAddress(actor, data.email);
  });

export const retryIssueSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(z.object({ id: z.string().uuid() }), input, "owner-issues.functions.ts:67"))
  .handler(async ({ data, context }): Promise<{ ok: boolean; reason?: string }> => {
    const actor = await gate(context.supabase, context.userId);
    const { retryFailedSms } = await import("@/lib/owner-issues-actions.server");
    return retryFailedSms(actor, data.id);
  });

export const remindStuckEcard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(z.object({ ecardId: z.string().uuid() }), input, "owner-issues.functions.ts:76"))
  .handler(async ({ data, context }): Promise<{ ok: boolean; reason?: string }> => {
    const actor = await gate(context.supabase, context.userId);
    const { remindStuckEcardOrganizer } = await import("@/lib/owner-issues-actions.server");
    return remindStuckEcardOrganizer(actor, data.ecardId);
  });
