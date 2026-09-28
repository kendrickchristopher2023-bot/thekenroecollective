// Owner AI analyst, Tier 1: persistence, rate limiting and audit.
//
// Callers must already have passed the owner allowlist + role + MFA gate.
// Storage tables are service-role only, so every read here is scoped by
// owner_user_id in code as well.
import type { AssistantMessage, AssistantThread } from "@/lib/owner-assistant.functions";
import {
  OWNER_AI_DAILY_QUESTIONS,
  checkOwnerAiLimit,
  formatMicroUsd,
  nextUsage,
} from "@/lib/owner-ai-limits";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loadThreads(userId: string): Promise<AssistantThread[]> {
  const sb = await admin();
  const { data } = await sb
    .from("owner_ai_threads")
    .select("id,title,message_count,last_message_at")
    .eq("owner_user_id", userId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(50);
  return (data ?? []).map((t: any) => ({
    id: t.id,
    title: t.title,
    messageCount: t.message_count ?? 0,
    lastMessageAt: t.last_message_at,
  }));
}

export async function loadMessages(userId: string, threadId: string): Promise<AssistantMessage[]> {
  const sb = await admin();
  const { data } = await sb
    .from("owner_ai_messages")
    .select("id,role,content,sources,tool_calls,created_at")
    .eq("owner_user_id", userId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((m: any) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    sources: Array.isArray(m.sources) ? m.sources : [],
    toolsUsed: Array.isArray(m.tool_calls) ? m.tool_calls : [],
    createdAt: m.created_at,
  }));
}

export async function loadUsageSummary(userId: string) {
  const sb = await admin();
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const [{ data: dayRow }, { data: monthRows }] = await Promise.all([
    sb.from("owner_ai_usage").select("questions").eq("owner_user_id", userId).eq("day", today()).maybeSingle(),
    sb.from("owner_ai_usage").select("cost_micro_usd").eq("owner_user_id", userId).gte("day", monthStart),
  ]);
  const questionsToday = dayRow?.questions ?? 0;
  const monthMicro = (monthRows ?? []).reduce((s: number, r: any) => s + (r.cost_micro_usd ?? 0), 0);
  return {
    questionsToday,
    remainingToday: Math.max(0, OWNER_AI_DAILY_QUESTIONS - questionsToday),
    monthCost: formatMicroUsd(monthMicro),
  };
}

export async function removeThread(userId: string, threadId: string): Promise<void> {
  const sb = await admin();
  await sb.from("owner_ai_threads").delete().eq("owner_user_id", userId).eq("id", threadId);
}

function titleFrom(question: string): string {
  const t = question.replace(/\s+/g, " ").trim();
  return t.length > 70 ? `${t.slice(0, 67)}...` : t;
}

export async function answerOwnerQuestion(args: {
  userId: string;
  email: string | null;
  threadId: string | null;
  question: string;
}): Promise<{
  threadId: string;
  answer: AssistantMessage;
  usage: { questionsToday: number; remainingToday: number; monthCost: string };
}> {
  const sb = await admin();
  const now = new Date();
  const day = today();

  // Rate limit before spending any tokens.
  const { data: usageRow } = await sb
    .from("owner_ai_usage")
    .select("questions,minute_window_started_at,minute_count")
    .eq("owner_user_id", args.userId)
    .eq("day", day)
    .maybeSingle();

  const check = checkOwnerAiLimit(usageRow ?? null, now);
  if (!check.ok) {
    await sb.from("owner_ai_audit").insert({
      thread_id: args.threadId,
      owner_user_id: args.userId,
      owner_email: args.email,
      question: args.question,
      outcome: "rate_limited",
    });
    throw new Error(check.reason);
  }

  const counters = nextUsage(usageRow ?? null, now);
  await sb.from("owner_ai_usage").upsert(
    {
      owner_user_id: args.userId,
      day,
      questions: counters.questions,
      minute_window_started_at: counters.minute_window_started_at,
      minute_count: counters.minute_count,
      last_question_at: now.toISOString(),
      cost_micro_usd: usageRow?.cost_micro_usd ?? 0,
    },
    { onConflict: "owner_user_id,day" },
  );

  // Thread
  let threadId = args.threadId;
  if (!threadId) {
    const { data: created, error } = await sb
      .from("owner_ai_threads")
      .insert({
        owner_user_id: args.userId,
        owner_email: args.email,
        title: titleFrom(args.question),
      })
      .select("id")
      .single();
    if (error || !created) throw new Error("Could not start that conversation.");
    threadId = created.id as string;
  }

  const history = await loadMessages(args.userId, threadId);

  await sb.from("owner_ai_messages").insert({
    thread_id: threadId,
    owner_user_id: args.userId,
    role: "user",
    content: args.question,
  });

  const { runOwnerAssistant } = await import("@/lib/owner-ai-chat.server");
  let turn;
  try {
    turn = await runOwnerAssistant(
      history.map((m) => ({ role: m.role, content: m.content })),
      args.question,
      { ownerUserId: args.userId, ownerEmail: args.email, threadId },
    );
  } catch (e: any) {
    await sb.from("owner_ai_audit").insert({
      thread_id: threadId,
      owner_user_id: args.userId,
      owner_email: args.email,
      question: args.question,
      outcome: "failed",
    });
    throw new Error(e?.message ?? "The assistant could not answer that.");
  }

  const { data: saved } = await sb
    .from("owner_ai_messages")
    .insert({
      thread_id: threadId,
      owner_user_id: args.userId,
      role: "assistant",
      content: turn.text,
      sources: turn.sources,
      tool_calls: turn.toolsUsed,
    })
    .select("id,created_at")
    .single();

  await Promise.all([
    sb
      .from("owner_ai_threads")
      .update({ message_count: history.length + 2, last_message_at: new Date().toISOString() })
      .eq("id", threadId)
      .eq("owner_user_id", args.userId),
    sb.from("owner_ai_audit").insert({
      thread_id: threadId,
      owner_user_id: args.userId,
      owner_email: args.email,
      question: args.question,
      tools_used: turn.toolsUsed,
      sources: turn.sources,
      input_tokens: turn.inputTokens,
      output_tokens: turn.outputTokens,
      cost_micro_usd: turn.costMicroUsd,
      outcome: "answered",
    }),
    sb
      .from("owner_ai_usage")
      .update({ cost_micro_usd: (usageRow?.cost_micro_usd ?? 0) + turn.costMicroUsd })
      .eq("owner_user_id", args.userId)
      .eq("day", day),
  ]);

  return {
    threadId,
    answer: {
      id: saved?.id ?? "pending",
      role: "assistant",
      content: turn.text,
      sources: turn.sources,
      toolsUsed: turn.toolsUsed,
      createdAt: saved?.created_at ?? new Date().toISOString(),
    },
    usage: await loadUsageSummary(args.userId),
  };
}
