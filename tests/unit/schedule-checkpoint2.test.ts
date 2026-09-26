import { describe, expect, it } from "vitest";
import { parseReplyAnswer } from "@/lib/schedule-messages";
import { decideRoute } from "@/lib/schedule-sms-reply.server";
import { attendanceHistoryRows } from "@/lib/schedule-history";

const H = 3_600_000;

describe("parseReplyAnswer", () => {
  it.each([
    ["1", "yes"], ["YES", "yes"], ["Yes!", "yes"], ["y", "yes"], ["I'll be there", "yes"], ["I’ll be there", "yes"], ["count me in", "yes"],
    ["2", "maybe"], ["Maybe", "maybe"], ["not sure", "maybe"],
    ["3", "no"], ["NO", "no"], ["can't make it", "no"], ["Cannot attend.", "no"], ["won't make it", "no"],
  ])("%s -> %s", (t, a) => expect(parseReplyAnswer(t)).toBe(a));
  it.each(["STOP", "START", "HELP", "4", "hello", "yes please call me"])("%s is not an answer", (t) => expect(parseReplyAnswer(t)).toBeNull());
});

describe("decideRoute precedence", () => {
  const now = Date.UTC(2026, 9, 1);
  const s = (id: string, hoursAgo: number) => ({ scheduleId: id, at: now - hoursAgo * H });
  it("no schedule text: event flow", () => expect(decideRoute([], true, now).route).toBe("event"));
  it("schedule only", () => expect(decideRoute([s("A", 5)], false, null).route).toBe("schedule"));
  it("event exists but never texted: schedule", () => expect(decideRoute([s("A", 5)], true, null).route).toBe("schedule"));
  it("two schedules within 48h: ambiguous", () => expect(decideRoute([s("A", 1), s("B", 40)], false, null).route).toBe("ambiguous"));
  it("two schedules 3 days apart: newest wins", () => {
    const r = decideRoute([s("A", 1), s("B", 73)], false, null);
    expect(r.route).toBe("schedule");
    expect(r.hits[0]!.scheduleId).toBe("A");
  });
  it("event text within 48h of schedule text: ambiguous", () => expect(decideRoute([s("A", 1)], true, now - 30 * H).route).toBe("ambiguous"));
  it("event texted 3 days after schedule: event", () => expect(decideRoute([s("A", 80)], true, now - 2 * H).route).toBe("event"));
  it("schedule texted 3 days after event: schedule", () => expect(decideRoute([s("A", 2)], true, now - 80 * H).route).toBe("schedule"));
});

describe("attendance history quiet3 flag", () => {
  const dates = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"].map((d, i) => ({ id: `o${i}`, starts_at: `${d}T20:00:00Z` }));
  const people = [
    { id: "a", created_at: "2026-01-01", contact: { display_name: "Ann" } },
    { id: "b", created_at: "2026-01-01", contact: { display_name: "Bo" } },
    { id: "c", created_at: "2026-07-15", contact: { display_name: "Cy" } },
  ];
  const rows = attendanceHistoryRows(dates, people, [
    { person_id: "a", occurrence_id: "o0", answer: "yes" },
    { person_id: "b", occurrence_id: "o2", answer: "maybe" },
  ]);
  it("flags 3 silent dates in a row", () => expect(rows.find((r) => r.personId === "a")!.quiet3).toBe(true));
  it("an answer in the last 3 clears it", () => expect(rows.find((r) => r.personId === "b")!.quiet3).toBe(false));
  it("dates before joining do not count", () => expect(rows.find((r) => r.personId === "c")!.quiet3).toBe(false));
  it("answers per date", () => expect(rows.find((r) => r.personId === "b")!.answers).toEqual(["none", "none", "maybe", "none"]));
});
