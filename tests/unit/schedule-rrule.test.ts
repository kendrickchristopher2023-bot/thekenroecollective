import { describe, expect, it } from "vitest";
import { expandOccurrences, nextOccurrences, buildScheduleIcs, describeRule, monthDayWarning, type ScheduleRule } from "@/lib/schedule-rrule";

const tz = "America/New_York";
const base = (over: Partial<ScheduleRule> = {}): ScheduleRule => ({
  start_local: "2026-10-04T19:00",
  timezone: tz,
  duration_minutes: 60,
  rrule: "FREQ=MONTHLY;BYDAY=1SU",
  ends_kind: "never",
  until_local: null,
  occurrence_count: null,
  ...over,
});
const local = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

describe("schedule recurrence", () => {
  it("1st Sunday stays at 7:00 PM local across the November change", () => {
    const occ = expandOccurrences(base(), [], new Date("2026-10-01T00:00Z"), new Date("2027-01-01T00:00Z"));
    expect(occ.map((o) => o.occurrence_local)).toEqual(["2026-10-04T19:00", "2026-11-01T19:00", "2026-12-06T19:00"]);
    expect(local(occ[0]!.starts_at)).toContain("7:00 PM EDT");
    expect(local(occ[1]!.starts_at)).toContain("7:00 PM EST");
    expect(occ[0]!.starts_at.toISOString()).toBe("2026-10-04T23:00:00.000Z");
    expect(occ[1]!.starts_at.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("last Friday", () => {
    const occ = expandOccurrences(base({ start_local: "2026-10-30T18:00", rrule: "FREQ=MONTHLY;BYDAY=-1FR" }), [], new Date("2026-10-01Z"), new Date("2027-01-01Z"));
    expect(occ.map((o) => o.occurrence_local.slice(0, 10))).toEqual(["2026-10-30", "2026-11-27", "2026-12-25"]);
  });

  it("5th Sunday skips months without one", () => {
    const occ = expandOccurrences(base({ start_local: "2026-11-29T19:00", rrule: "FREQ=MONTHLY;BYDAY=5SU" }), [], new Date("2026-11-01Z"), new Date("2027-06-01Z"));
    expect(occ.map((o) => o.occurrence_local.slice(0, 10))).toEqual(["2026-11-29", "2027-01-31", "2027-05-30"]);
  });

  it("skip and move one date", () => {
    const ex = [
      { original_local: "2026-11-01T19:00", action: "skip" as const, new_start_local: null, new_duration_minutes: null },
      { original_local: "2026-12-06T19:00", action: "move" as const, new_start_local: "2026-12-07T20:00", new_duration_minutes: null },
    ];
    const occ = expandOccurrences(base(), ex, new Date("2026-10-01Z"), new Date("2027-01-01Z"));
    expect(occ.map((o) => o.status)).toEqual(["scheduled", "skipped", "moved"]);
    expect(occ[2]!.start_local).toBe("2026-12-07T20:00");
    const next = nextOccurrences(base(), ex, 3, new Date("2026-10-10Z"));
    expect(next.map((o) => o.start_local)).toEqual(["2026-12-07T20:00", "2027-01-03T19:00", "2027-02-07T19:00"]);
    const ics = buildScheduleIcs({ uid: "x", title: "Call", schedule: base(), exceptions: ex });
    expect(ics).toContain("EXDATE;TZID=America/New_York:20261101T190000");
    expect(ics).toContain("RECURRENCE-ID;TZID=America/New_York:20261206T190000");
  });

  it("ends on a date and after a count", () => {
    const until = expandOccurrences(base({ ends_kind: "on_date", until_local: "2026-12-06T00:00" }), [], new Date("2026-10-01Z"), new Date("2027-06-01Z"));
    expect(until).toHaveLength(3);
    const count = expandOccurrences(base({ ends_kind: "count", occurrence_count: 2 }), [], new Date("2026-10-01Z"), new Date("2027-06-01Z"));
    expect(count).toHaveLength(2);
  });

  it("open-ended keeps going", () => {
    const far = expandOccurrences(base(), [], new Date("2035-01-01Z"), new Date("2035-03-01Z"));
    expect(far.length).toBe(2);
  });

  it("describes rules in plain English", () => {
    expect(describeRule("FREQ=MONTHLY;BYDAY=1SU")).toBe("Every month on the 1st Sunday");
    expect(describeRule("FREQ=MONTHLY;BYDAY=-1FR")).toBe("Every month on the last Friday");
    expect(describeRule(null)).toBe("One time");
  });

  it("this and all future split leaves no gap or overlap", () => {
    // Old series ends the day before the split date; new series starts on it at 8 PM.
    const old = base({ ends_kind: "on_date", until_local: "2026-11-30T00:00" });
    const next = base({ start_local: "2026-12-06T20:00" });
    const win: [Date, Date] = [new Date("2026-10-01Z"), new Date("2027-02-01Z")];
    const a = expandOccurrences(old, [], ...win).map((o) => o.start_local);
    const b = expandOccurrences(next, [], ...win).map((o) => o.start_local);
    expect(a).toEqual(["2026-10-04T19:00", "2026-11-01T19:00"]);
    expect(b).toEqual(["2026-12-06T20:00", "2027-01-03T20:00"]);
  });

  it("31st warns and skips short months", () => {
    expect(monthDayWarning(31)).toContain("Months without a 31st are skipped");
    expect(monthDayWarning(15)).toBeNull();
    const occ = expandOccurrences(base({ start_local: "2027-01-31T19:00", rrule: "FREQ=MONTHLY;BYMONTHDAY=31" }), [], new Date("2027-01-01Z"), new Date("2027-06-01Z"));
    expect(occ.map((o) => o.start_local.slice(0, 10))).toEqual(["2027-01-31", "2027-03-31", "2027-05-31"]);
  });
});
