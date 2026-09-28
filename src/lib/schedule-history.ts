// Per-person answers across past dates. Pure so it can be unit tested.

export type HistoryAnswer = "yes" | "maybe" | "no" | "none";

export interface HistoryRow {
  personId: string;
  name: string;
  answers: HistoryAnswer[];
  /** No answer on each of the last 3 dates (dates before they joined do not count). */
  quiet3: boolean;
}

export function attendanceHistoryRows(
  dates: { id: string; starts_at: string }[],
  people: { id: string; created_at?: string | null; contact?: { display_name?: string | null; email?: string | null; phone?: string | null } | null }[],
  rsvps: { person_id: string; occurrence_id: string; answer: string }[],
): HistoryRow[] {
  const by = new Map(rsvps.map((r) => [`${r.occurrence_id}:${r.person_id}`, r.answer as HistoryAnswer]));
  return people.map((p) => {
    const answers = dates.map((d) => by.get(`${d.id}:${p.id}`) ?? "none");
    const joined = p.created_at ? new Date(p.created_at).getTime() : 0;
    const eligible = dates.map((d, i) => ({ i, ok: new Date(d.starts_at).getTime() >= joined })).filter((x) => x.ok).map((x) => x.i);
    const last3 = eligible.slice(-3);
    return {
      personId: p.id,
      name: p.contact?.display_name || p.contact?.email || p.contact?.phone || "Someone",
      answers,
      quiet3: last3.length === 3 && last3.every((i) => answers[i] === "none"),
    };
  });
}
