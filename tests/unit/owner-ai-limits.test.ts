import { describe, it, expect } from "vitest";
import {
  OWNER_AI_DAILY_QUESTIONS,
  OWNER_AI_PER_MINUTE,
  checkOwnerAiLimit,
  estimateCostMicroUsd,
  formatMicroUsd,
  nextUsage,
} from "@/lib/owner-ai-limits";

const now = new Date("2026-08-22T20:00:00.000Z");

describe("owner assistant limits", () => {
  it("allows a first question", () => {
    const r = checkOwnerAiLimit(null, now);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remainingToday).toBe(OWNER_AI_DAILY_QUESTIONS - 1);
  });

  it("blocks once the daily allowance is spent", () => {
    const r = checkOwnerAiLimit(
      { questions: OWNER_AI_DAILY_QUESTIONS, minute_window_started_at: null, minute_count: 0 },
      now,
    );
    expect(r.ok).toBe(false);
  });

  it("blocks a burst inside the same minute, then allows after it rolls over", () => {
    const row = {
      questions: 5,
      minute_window_started_at: new Date(now.getTime() - 10_000).toISOString(),
      minute_count: OWNER_AI_PER_MINUTE,
    };
    expect(checkOwnerAiLimit(row, now).ok).toBe(false);
    const later = new Date(now.getTime() + 61_000);
    expect(checkOwnerAiLimit(row, later).ok).toBe(true);
  });

  it("counts within the window and restarts it after a minute", () => {
    const row = {
      questions: 2,
      minute_window_started_at: new Date(now.getTime() - 5_000).toISOString(),
      minute_count: 2,
    };
    expect(nextUsage(row, now).minute_count).toBe(3);
    expect(nextUsage(row, new Date(now.getTime() + 120_000)).minute_count).toBe(1);
  });

  it("estimates cost and formats dollars", () => {
    expect(estimateCostMicroUsd(1000, 1000)).toBe(375);
    expect(formatMicroUsd(1_500_000)).toBe("$1.50");
  });
});
