import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMINDER_TIME,
  normalizeReminderTime,
  reminderTimeFor,
  reminderWarning,
  reminderWhenLabel,
  resolveReminderSend,
} from "@/lib/reminder-schedule";
import { duePresetsAt } from "@/lib/event-reminders.server";
import { personalInviteUrl } from "@/lib/invite-links";

const TENIA = "2026-08-29T18:00";
const NY = "America/New_York";

describe("reminder send times", () => {
  it("fires 1 day before at 9:00 AM event-local", () => {
    const r = resolveReminderSend(TENIA, NY, 1, DEFAULT_REMINDER_TIME, new Date("2026-08-01T00:00:00Z"));
    expect(r.at?.toISOString()).toBe("2026-08-28T13:00:00.000Z"); // 9:00 AM EDT
    expect(r.adjustment).toBe("none");
  });

  it("fires day-of in the morning, never midnight", () => {
    const r = resolveReminderSend(TENIA, NY, 0, DEFAULT_REMINDER_TIME, new Date("2026-08-01T00:00:00Z"));
    expect(r.at?.toISOString()).toBe("2026-08-29T13:00:00.000Z");
  });

  it("respects a host-chosen time in the event's zone", () => {
    const r = resolveReminderSend(TENIA, NY, 1, "07:30", new Date("2026-08-01T00:00:00Z"));
    expect(r.at?.toISOString()).toBe("2026-08-28T11:30:00.000Z");
  });

  it("moves an impossible early-event reminder to 6:00 PM the evening before", () => {
    // 7:00 AM breakfast: a 9:00 AM day-of reminder would arrive after it starts.
    const r = resolveReminderSend("2026-08-29T07:00", NY, 0, "09:00", new Date("2026-08-01T00:00:00Z"));
    expect(r.adjustment).toBe("early_event");
    expect(r.at!.getTime()).toBeLessThan(r.eventStart!.getTime());
    expect(r.at?.toISOString()).toBe("2026-08-28T22:00:00.000Z"); // 6:00 PM EDT
    expect(reminderWarning("2026-08-29T07:00", NY, 0, "09:00", new Date("2026-08-01T00:00:00Z"))).toContain(
      "after it begins",
    );
  });

  it("keeps the intended local time across a DST boundary", () => {
    // Event in March 2027, reminder 2 weeks earlier while EST is still in force.
    const label = reminderWhenLabel("2027-03-20T18:00", NY, 14);
    expect(label).toContain("9:00 AM");
    expect(label).toContain("EST");
  });

  it("never schedules a send at or after the event start", () => {
    const due = duePresetsAt(
      ["dayof"],
      "2026-08-29T07:00",
      NY,
      new Date("2026-08-29T12:00:00Z"), // 8:00 AM EDT, event already started
    );
    expect(due).toEqual([]);
  });

  it("marks a past moment and refuses to schedule it", () => {
    const warning = reminderWarning(TENIA, NY, 1, "09:00", new Date("2026-08-29T00:00:00Z"));
    expect(warning).toContain("already passed");
  });

  it("normalises and defaults times", () => {
    expect(normalizeReminderTime("9:5")).toBe("09:05");
    expect(normalizeReminderTime("25:00")).toBeNull();
    expect(reminderTimeFor("1d", null)).toBe(DEFAULT_REMINDER_TIME);
    expect(reminderTimeFor("1d", { "1d": "7:15" })).toBe("07:15");
  });
});

describe("personal invite links survive resends", () => {
  it("always reuses the guest's own link, never a fresh one", () => {
    const base = "https://thekenroecollective.com/invite/evt-1";
    const first = personalInviteUrl(base, "guest-9");
    const resend = personalInviteUrl(base, "guest-9");
    expect(resend).toBe(first);
    expect(first).toContain("guest-9");
  });
});
