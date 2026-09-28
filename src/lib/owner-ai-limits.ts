// Cost and rate limits for the owner-only AI analyst.
//
// Pure logic so it can be unit tested without a database. The server function
// reads the current counters, calls `checkOwnerAiLimit`, and only spends tokens
// when it returns `{ ok: true }`.

export const OWNER_AI_DAILY_QUESTIONS = 40;
export const OWNER_AI_PER_MINUTE = 8;
/** Hard ceiling on tool calls the model may make while answering one question. */
export const OWNER_AI_MAX_STEPS = 8;

/** Rough Lovable AI Gateway cost for the standard flash model, in micro dollars. */
const INPUT_MICRO_PER_1K = 75;
const OUTPUT_MICRO_PER_1K = 300;

export type OwnerAiUsageRow = {
  questions: number;
  minute_window_started_at: string | null;
  minute_count: number;
};

export type LimitCheck =
  | { ok: true; remainingToday: number }
  | { ok: false; reason: string; retryAfterSeconds: number };

export function estimateCostMicroUsd(inputTokens: number, outputTokens: number): number {
  const micro =
    (Math.max(0, inputTokens) / 1000) * INPUT_MICRO_PER_1K +
    (Math.max(0, outputTokens) / 1000) * OUTPUT_MICRO_PER_1K;
  return Math.round(micro);
}

export function formatMicroUsd(micro: number): string {
  return `$${(Math.max(0, micro) / 1_000_000).toFixed(2)}`;
}

export function checkOwnerAiLimit(
  row: OwnerAiUsageRow | null,
  now: Date = new Date(),
): LimitCheck {
  const questions = row?.questions ?? 0;
  if (questions >= OWNER_AI_DAILY_QUESTIONS) {
    return {
      ok: false,
      reason: `Daily limit reached: ${OWNER_AI_DAILY_QUESTIONS} questions per owner per day. It resets at midnight UTC.`,
      retryAfterSeconds: 3600,
    };
  }

  const windowStart = row?.minute_window_started_at ? new Date(row.minute_window_started_at) : null;
  const withinWindow = windowStart ? now.getTime() - windowStart.getTime() < 60_000 : false;
  if (withinWindow && (row?.minute_count ?? 0) >= OWNER_AI_PER_MINUTE) {
    const elapsed = Math.floor((now.getTime() - (windowStart as Date).getTime()) / 1000);
    return {
      ok: false,
      reason: `Slow down a moment: up to ${OWNER_AI_PER_MINUTE} questions a minute.`,
      retryAfterSeconds: Math.max(1, 60 - elapsed),
    };
  }

  return { ok: true, remainingToday: OWNER_AI_DAILY_QUESTIONS - questions - 1 };
}

/** Next counter values after a question is allowed through. */
export function nextUsage(
  row: OwnerAiUsageRow | null,
  now: Date = new Date(),
): { questions: number; minute_window_started_at: string; minute_count: number } {
  const windowStart = row?.minute_window_started_at ? new Date(row.minute_window_started_at) : null;
  const withinWindow = windowStart ? now.getTime() - windowStart.getTime() < 60_000 : false;
  return {
    questions: (row?.questions ?? 0) + 1,
    minute_window_started_at: withinWindow
      ? (windowStart as Date).toISOString()
      : now.toISOString(),
    minute_count: withinWindow ? (row?.minute_count ?? 0) + 1 : 1,
  };
}
