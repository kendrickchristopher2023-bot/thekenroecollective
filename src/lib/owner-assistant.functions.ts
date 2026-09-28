// Owner AI analyst, Tier 1: server functions.
//
// Same gate as the Owner Report itself: allowlisted owner email, plus
// owner/super_admin role, plus MFA at aal2, all verified server-side against
// the request's own bearer token. Rate limited per owner, and every question is
// written to the permanent audit log with the owner's identity.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AskInput = z.object({
  threadId: z.string().uuid().nullable().optional(),
  question: z.string().min(3).max(600),
});

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: Array<{ label: string; where: string; window?: string }>;
  toolsUsed: string[];
  createdAt: string;
};

export type AssistantThread = {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
};

async function gate(supabase: unknown, userId: string): Promise<string | null> {
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  const { assertOwnerReportAllowlist } = await import("@/lib/owner-report-access");
  await assertOwnerReportAllowlist(supabase as never);
  await assertOwnerAccess(supabase as never, userId);
  const { data } = await (supabase as any).auth.getUser();
  return data?.user?.email ?? null;
}

export const listAssistantThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ threads: AssistantThread[]; usage: { questionsToday: number; remainingToday: number; monthCost: string } }> => {
    await gate(context.supabase, context.userId);
    const { loadThreads, loadUsageSummary } = await import("@/lib/owner-assistant.server");
    const [threads, usage] = await Promise.all([
      loadThreads(context.userId),
      loadUsageSummary(context.userId),
    ]);
    return { threads, usage };
  });

export const getAssistantThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(z.object({ threadId: z.string().uuid() }), input, "owner-assistant.functions.ts:55"))
  .handler(async ({ data, context }): Promise<{ messages: AssistantMessage[] }> => {
    await gate(context.supabase, context.userId);
    const { loadMessages } = await import("@/lib/owner-assistant.server");
    return { messages: await loadMessages(context.userId, data.threadId) };
  });

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(AskInput, input, "owner-assistant.functions.ts:64"))
  .handler(async ({ data, context }): Promise<{
    threadId: string;
    answer: AssistantMessage;
    usage: { questionsToday: number; remainingToday: number; monthCost: string };
  }> => {
    const email = await gate(context.supabase, context.userId);
    const { answerOwnerQuestion } = await import("@/lib/owner-assistant.server");
    return answerOwnerQuestion({
      userId: context.userId,
      email,
      threadId: data.threadId ?? null,
      question: data.question,
    });
  });

export const deleteAssistantThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(z.object({ threadId: z.string().uuid() }), input, "owner-assistant.functions.ts:82"))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await gate(context.supabase, context.userId);
    const { removeThread } = await import("@/lib/owner-assistant.server");
    await removeThread(context.userId, data.threadId);
    return { ok: true };
  });
