// Owner AI analyst: the grounded chat runner.
//
// The model has two kinds of tools and nothing else:
//   - read tools (owner-ai-tools.server.ts), which only select data
//   - draft tools (owner-ai-draft-tools.server.ts), which only write a pending
//     row to owner_ai_actions
// It has no execution path at all. Money only moves and customers are only
// contacted when a human owner clicks Approve, which runs a separate gated
// endpoint. Every answer must end with a Sources block naming the report or
// table each number came from, so the owner can verify it independently.
import { stepCountIs, streamText } from "ai";
import { buildOwnerAiTools, takeSources, type SourceRef } from "@/lib/owner-ai-tools.server";
import {
  buildOwnerDraftTools,
  takeDrafts,
  type DraftContext,
} from "@/lib/owner-ai-draft-tools.server";
import { OWNER_AI_MAX_STEPS, estimateCostMicroUsd } from "@/lib/owner-ai-limits";

const MODEL = "google/gemini-3.6-flash";

const SYSTEM = `You are the Owner Analyst for The Kenroe Collective, a US business reporting in US dollars. You are speaking privately to one of the two business owners inside the owner console.

RULES, all mandatory:
- Get every number by calling a tool. Never state a figure you did not read from a tool result in this conversation. Never estimate, extrapolate, or recall figures from memory.
- If the tools cannot answer, say plainly that the data is not available through this assistant and name the report that would show it.
- Always finish with a "## Sources" section listing each tool result you used, as "report or table name, window". This is how the owner verifies a number independently. Where a figure is customer self-reported rather than confirmed by Stripe, say so, the same way the payment reconciliation report labels it.
- Default the window to the last 30 days when the owner does not say. State the window you used.
- You never carry out an action. You can only DRAFT one with a draft_ tool, and a human owner must click Approve in the panel before anything at all happens. Never say a refund was issued, an email or text was sent, or a plan was changed. Say you have drafted it and that it is waiting for their approval, and that drafts expire after 24 hours.
- Before drafting, look up the real facts with the read tools: the account id, the Stripe payment intent id, the amount, the ticket id, the email or phone. Never invent an id or an amount. If you cannot find a required id, say which one is missing instead of drafting.
- Refunds over $100 also need the owner to type the amount to confirm. Say so when you draft one.
- Draft one action at a time unless the owner clearly asks for several.
- For customer emails and texts, write the finished message, warm and plain, signed off as The Kenroe Collective. Never promise anything you cannot verify from the data.
- Never give tax, financial, accounting, investment or legal advice. Report the numbers and say that is for their accountant.
- Plain, friendly business English. Markdown. US dates mm/dd/yyyy. Money as $1,234.56.
- Never use em dashes. Use commas or shorter sentences.
- Customer-level detail is permitted when the owner asks about a specific account. Do not volunteer customer names or emails in aggregate answers.
- Keep answers under 350 words unless the owner asks for more.`;

export type AssistantTurn = {
  text: string;
  sources: SourceRef[];
  draftIds: string[];
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
};

export async function runOwnerAssistant(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  question: string,
  draftContext: DraftContext,
): Promise<AssistantTurn> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured right now.");
  const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
  const gateway = createLovableAiGatewayProvider(key);

  takeSources(); // clear anything left over
  takeDrafts();
  const todayIso = new Date().toISOString();
  const result = streamText({
    model: gateway(MODEL),
    system: `${SYSTEM}

The current date and time is ${todayIso} (UTC). Never state a date you did not read from a tool result or derive from this one.`,
    temperature: 0.2,
    tools: { ...buildOwnerAiTools(), ...buildOwnerDraftTools(draftContext) },
    stopWhen: stepCountIs(OWNER_AI_MAX_STEPS),
    messages: [
      ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: question },
    ],
  });

  const text = (await result.text).replace(/—/g, ", ").trim();
  const usage = await result.usage;
  const steps = await result.steps;
  const toolsUsed = [
    ...new Set(steps.flatMap((s: any) => (s.toolCalls ?? []).map((c: any) => c.toolName as string))),
  ];
  const inputTokens = Number(usage?.inputTokens ?? 0);
  const outputTokens = Number(usage?.outputTokens ?? 0);

  return {
    text,
    draftIds: takeDrafts().map((d) => d.id),
    sources: takeSources(),
    toolsUsed,
    inputTokens,
    outputTokens,
    costMicroUsd: estimateCostMicroUsd(inputTokens, outputTokens),
  };
}
