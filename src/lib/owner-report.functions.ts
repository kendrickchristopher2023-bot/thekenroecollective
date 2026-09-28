// Owner Command Center, Phase 1: analytics + export only.
// Owner/super_admin enforced server-side (role check plus mandatory MFA).
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PeriodTotals } from "@/lib/owner-report.server";

const Input = z.object({
  since: z.string(),
  until: z.string(),
  prevSince: z.string(),
  prevUntil: z.string(),
  environment: z.enum(["live", "sandbox"]).optional(),
  venture: z.enum(["all", "events", "ecards", "projects", "resume"]).optional(),
});

export type OwnerReport = {
  since: string;
  until: string;
  prevSince: string;
  prevUntil: string;
  environment: "live" | "sandbox";
  venture: "all" | "events" | "ecards" | "projects" | "resume";
  current: PeriodTotals;
  previous: PeriodTotals;
};


/** Page guard: is this caller allowed to open the Owner Report at all. */
export const checkOwnerReportAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ allowed: boolean }> => {
    const { hasOwnerRole, assertOwnerMfaSatisfied } = await import("@/lib/owner-guard.server");
    const { isAllowlistedOwnerReportUser } = await import("@/lib/owner-report-access");

    if (!(await hasOwnerRole(context.supabase as any, context.userId))) return { allowed: false };
    if (!(await isAllowlistedOwnerReportUser(context.supabase as any))) return { allowed: false };
    // MFA still required; this throws MFA_ENROLL_REQUIRED / MFA_CHALLENGE_REQUIRED
    // so the existing owner MFA gate can react to it.
    await assertOwnerMfaSatisfied(context.supabase as any, context.userId);
    return { allowed: true };
  });

export const getOwnerReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(Input, input, "owner-report.functions.ts:46"))
  .handler(async ({ data, context }): Promise<OwnerReport> => {
    const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
    const { assertOwnerReportAllowlist } = await import("@/lib/owner-report-access");
    // Allowlist first, then role plus mandatory MFA (aal2).
    await assertOwnerReportAllowlist(context.supabase as any);
    await assertOwnerAccess(context.supabase as any, context.userId);

    const { loadPeriod } = await import("@/lib/owner-report.server");
    const env = data.environment ?? "live";
    const venture = data.venture ?? "all";
    const [current, previous] = await Promise.all([
      loadPeriod(env, data.since, data.until, venture),
      loadPeriod(env, data.prevSince, data.prevUntil, venture),
    ]);

    return { ...data, environment: env, venture, current, previous };

  });

