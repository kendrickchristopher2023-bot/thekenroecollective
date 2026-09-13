import { describe, expect, it } from "vitest";
import { duePresetsAt, REMINDER_PRESET_DAYS } from "@/lib/event-reminders.server";

// Old-shape event: reminderPresetIds only, NO reminderTimes key at all.
const DATE = "2026-08-29T18:00";
const TZ = "America/New_York";
const PRESETS = ["1d", "dayof"];

describe("old-shape reminder events (reminderPresetIds only)", () => {
  it("fires the 1-day preset at the 9:00 AM default with reminderTimes undefined", () => {
    expect(duePresetsAt(PRESETS, DATE, TZ, new Date("2026-08-28T12:59:00Z"), undefined)).toEqual([]);
    expect(duePresetsAt(PRESETS, DATE, TZ, new Date("2026-08-28T13:00:00Z"), undefined)).toEqual(["1d"]);
  });

  it("treats a null reminderTimes the same as absent", () => {
    expect(duePresetsAt(PRESETS, DATE, TZ, new Date("2026-08-28T13:00:00Z"), null)).toEqual(["1d"]);
  });

  it("fires day-of the morning of, never at midnight", () => {
    expect(duePresetsAt(PRESETS, DATE, TZ, new Date("2026-08-29T04:00:00Z"), undefined)).toEqual(["1d"]);
    const due = duePresetsAt(PRESETS, DATE, TZ, new Date("2026-08-29T13:10:00Z"), undefined);
    expect(due.sort()).toEqual(["1d", "dayof"]);
  });

  it("stops firing once the event has started", () => {
    expect(duePresetsAt(PRESETS, DATE, TZ, new Date("2026-08-29T22:30:00Z"), undefined)).toEqual([]);
  });

  it("keeps the preset vocabulary stable so old rows never reference unknown ids", () => {
    for (const id of PRESETS) expect(REMINDER_PRESET_DAYS[id]).toBeDefined();
  });
});
