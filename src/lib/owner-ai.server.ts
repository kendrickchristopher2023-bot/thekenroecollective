// Owner Command Center, Phase 2: AI overview and grounded question answering.
//
// READ ONLY. This module never writes data and the model is given no tools.
// It receives a compact, already-aggregated snapshot of the report and answers
// strictly from it.

export type OwnerSnapshot = {
  rangeLabel: string;
  comparisonLabel: string;
  periodLabel: string;
  environment: "live" | "sandbox";
  ventureLabel?: string;
  scopeNotes?: string[];
  metrics: Array<{ label: string; current: string; previous: string; change: string }>;
  byVenture: Array<{ venture: string; gross: string; orders: number }>;
  note?: string | null;
};


const MODEL = "google/gemini-3.6-flash";

const GUARDRAILS = `You are the Owner Report analyst for The Kenroe Collective, a US business reporting in US dollars.

RULES, all mandatory:
- Use ONLY the numbers in the snapshot and the recent issues list below. Never invent, estimate, extrapolate, or recall figures from anywhere else.
- If something is not in the data, say plainly that it is not in the current report, and say which report or period would show it.
- Never give tax, financial, accounting, investment or legal advice. Report the numbers and let the owner or their accountant decide. If asked for advice of that kind, say that is for their accountant and give the relevant numbers instead.
- You cannot take any action and you never change data. If asked to fix, refund, delete, message anyone or edit anything, say that this report view is read only.
- Write in plain, friendly business English. US date format mm/dd/yyyy. Dollar amounts as $1,234.56.
- Never use em dashes. Use commas or shorter sentences.
- The snapshot may cover one venture only. Speak about the venture in view and do not assume figures for other ventures. If a metric is app-wide and excluded from a venture view, say so instead of guessing.
- Do not name or describe individual customers.`;


function snapshotText(snapshot: OwnerSnapshot, issues: Array<{ area: string; detail: string; count: number }>): string {
  const lines: string[] = [];
  lines.push(`Venture in view: ${snapshot.ventureLabel ?? "All ventures"}`);
  lines.push(`Period: ${snapshot.periodLabel}`);
  lines.push(`Current range: ${snapshot.rangeLabel}`);
  lines.push(`Comparison range: ${snapshot.comparisonLabel}`);
  lines.push(`Payments environment: ${snapshot.environment === "live" ? "Live" : "Test"}`);
  if (snapshot.note) lines.push(`Data note: ${snapshot.note}`);
  for (const s of snapshot.scopeNotes ?? []) lines.push(`Scope note: ${s}`);
  lines.push("");
  lines.push("METRICS (label | this period | prior period | change)");

  for (const m of snapshot.metrics) {
    lines.push(`${m.label} | ${m.current} | ${m.previous} | ${m.change}`);
  }
  lines.push("");
  lines.push("REVENUE BY VENTURE (venture | gross | payments)");
  if (snapshot.byVenture.length === 0) lines.push("No payments in this period.");
  for (const v of snapshot.byVenture) lines.push(`${v.venture} | ${v.gross} | ${v.orders}`);
  lines.push("");
  lines.push("RECENT ISSUES (area | detail | count)");
  if (issues.length === 0) lines.push("No errors, bounces, text failures or stuck cards recorded in this period.");
  for (const i of issues) lines.push(`${i.area} | ${i.detail} | ${i.count}`);
  return lines.join("\n");
}

async function callModel(system: string, prompt: string): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured right now.");
  const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
  const { streamText } = await import("ai");
  const gateway = createLovableAiGatewayProvider(key);
  const result = streamText({
    model: gateway(MODEL),
    system,
    prompt,
    temperature: 0.2,
  });
  const text = await result.text;
  return text.replace(/—/g, ", ").trim();
}

export async function generateOverview(
  snapshot: OwnerSnapshot,
  issues: Array<{ area: string; detail: string; count: number }>,
): Promise<string> {
  const prompt = `${snapshotText(snapshot, issues)}

Write a short executive summary of this period for the business owner, in markdown, using these sections exactly:

## Headline
One or two sentences on the overall picture, naming the two or three numbers that matter most.

## What happened
Three to five bullets, each with the actual number and the change against the prior period.

## Wins
One to three bullets.

## Concerns and issues
One to three bullets drawn from the metrics and the recent issues list. If there are none, say there are none in this period.

## Recommended actions
Two to four short, concrete, operational actions the owner can take inside the product. No tax, financial or legal advice.

Keep the whole summary under 300 words.`;
  return callModel(GUARDRAILS, prompt);
}

export async function answerQuestion(
  snapshot: OwnerSnapshot,
  issues: Array<{ area: string; detail: string; count: number }>,
  question: string,
): Promise<string> {
  const prompt = `${snapshotText(snapshot, issues)}

The owner asks: "${question}"

Answer using only the snapshot and issues above. Lead with the direct answer and the exact numbers, then at most three short supporting bullets. If the answer is not in this data, reply exactly "I do not have that in the current report." and then suggest in one sentence how to get it, for example a different period, the Errors tab, or the messaging report. Keep it under 180 words.`;
  return callModel(GUARDRAILS, prompt);
}
