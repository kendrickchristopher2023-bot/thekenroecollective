// Owner Command Center, Phase 2: AI server functions.
// Same gate as the report itself: allowlisted owner email plus role plus MFA (aal2).
// The AI is read only and receives only the compact snapshot the client already has.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Snapshot = z.object({
  since: z.string(),
  until: z.string(),
  rangeLabel: z.string(),
  comparisonLabel: z.string(),
  periodLabel: z.string(),
  environment: z.enum(["live", "sandbox"]),
  venture: z.enum(["all", "events", "ecards", "projects", "resume"]).default("all"),
  ventureLabel: z.string().max(80).default("All ventures"),
  scopeNotes: z.array(z.string().max(400)).max(6).default([]),
  metrics: z
    .array(
      z.object({
        label: z.string(),
        current: z.string(),
        previous: z.string(),
        change: z.string(),
      }),
    )
    .max(40),
  byVenture: z
    .array(z.object({ venture: z.string(), gross: z.string(), orders: z.number() }))
    .max(12),
  note: z.string().nullable().optional(),
});


const AskInput = z.object({ snapshot: Snapshot, question: z.string().min(3).max(500) });

async function gate(supabase: unknown, userId: string) {
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  const { assertOwnerReportAllowlist } = await import("@/lib/owner-report-access");
  await assertOwnerReportAllowlist(supabase as never);
  await assertOwnerAccess(supabase as never, userId);
}

export const generateOwnerOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(Snapshot, input, "owner-ai.functions.ts:46"))
  .handler(async ({ data, context }): Promise<{ text: string }> => {
    await gate(context.supabase, context.userId);
    const { loadRecentIssues } = await import("@/lib/owner-issues.server");
    const { generateOverview } = await import("@/lib/owner-ai.server");
    const issues = await loadRecentIssues(data.since, data.until, data.venture);
    return { text: await generateOverview(data, issues) };
  });

export const askOwnerQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(AskInput, input, "owner-ai.functions.ts:57"))
  .handler(async ({ data, context }): Promise<{ text: string }> => {
    await gate(context.supabase, context.userId);
    const { loadRecentIssues } = await import("@/lib/owner-issues.server");
    const { answerQuestion } = await import("@/lib/owner-ai.server");
    const issues = await loadRecentIssues(
      data.snapshot.since,
      data.snapshot.until,
      data.snapshot.venture,
    );
    return { text: await answerQuestion(data.snapshot, issues, data.question) };
  });

