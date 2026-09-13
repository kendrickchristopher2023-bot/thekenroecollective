import { describe, expect, it } from "vitest";
import {
  REMINDER_PRESET_DAYS,
  daysUntilEvent,
  duePresets,
  isReminderAudience,
  whenLabelForDays,
} from "@/lib/event-reminders.server";
import { REMINDER_PRESETS } from "@/lib/events-store";

describe("event countdown reminders", () => {
  it("mirrors every UI preset, including day-of", () => {
    for (const p of REMINDER_PRESETS) {
      expect(REMINDER_PRESET_DAYS[p.id]).toBe(p.days);
    }
    expect(REMINDER_PRESET_DAYS["dayof"]).toBe(0);
  });

  it("counts whole days to the event", () => {
    const now = Date.parse("2026-08-27T12:00:00Z");
    expect(daysUntilEvent("2026-08-29T22:00:00Z", now)).toBe(3);
    expect(daysUntilEvent("2026-08-27T18:00:00Z", now)).toBe(1);
    expect(daysUntilEvent(undefined, now)).toBeNull();
  });

  it("fires a preset once the countdown reaches it", () => {
    expect(duePresets(["2d", "1d", "dayof"], 5)).toEqual([]);
    expect(duePresets(["2d", "1d", "dayof"], 2)).toEqual(["2d"]);
    expect(duePresets(["2d", "1d", "dayof"], 1)).toEqual(["2d", "1d"]);
    expect(duePresets(["2d", "1d", "dayof"], 0)).toEqual(["2d", "1d", "dayof"]);
    expect(duePresets(["bogus"], 0)).toEqual([]);
  });

  it("reminds guests who hold an invitation, not the declines", () => {
    expect(isReminderAudience({ status: "yes" })).toBe(true);
    expect(isReminderAudience({ status: "maybe" })).toBe(true);
    expect(isReminderAudience({})).toBe(true);
    expect(isReminderAudience({ status: "no" })).toBe(false);
  });

  it("labels the countdown in words a guest reads", () => {
    expect(whenLabelForDays(0)).toBe("today");
    expect(whenLabelForDays(1)).toBe("tomorrow");
    expect(whenLabelForDays(3)).toBe("in 3 days");
    expect(whenLabelForDays(7)).toBe("in 1 week");
    expect(whenLabelForDays(14)).toBe("in 2 weeks");
  });
});
