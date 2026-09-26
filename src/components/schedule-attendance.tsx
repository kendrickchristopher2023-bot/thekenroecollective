import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { addRsvpLinkToSteps, getAttendanceReport, setRsvpByHost } from "@/lib/schedules.functions";
import { toUserMessage } from "@/lib/user-error";

type Answer = "yes" | "maybe" | "no" | "none";

export const ANSWER_LABEL: Record<Answer, string> = {
  yes: "Will attend",
  maybe: "May attend",
  no: "Cannot attend",
  none: "No answer",
};
const ORDER: Answer[] = ["yes", "maybe", "no", "none"];
const TONE: Record<Answer, string> = {
  yes: "bg-emerald-100 text-emerald-900",
  maybe: "bg-amber-100 text-amber-900",
  no: "bg-rose-100 text-rose-900",
  none: "bg-secondary text-muted-foreground",
};

const field = "mt-1 w-full rounded-xl border border-ink/10 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-velvet/30";

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function AttendanceReport({ scheduleId }: { scheduleId: string }) {
  const load = useServerFn(getAttendanceReport);
  const setAnswer = useServerFn(setRsvpByHost);
  const [occurrenceId, setOccurrenceId] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [filter, setFilter] = useState<Answer | "all">("all");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async (occ: string | null) => {
    try {
      const r = await load({ data: { id: scheduleId, occurrenceId: occ } });
      setData(r);
      if (!occ && r.occurrenceId) setOccurrenceId(r.occurrenceId);
    } catch (e) { setErr(toUserMessage(e)); }
  }, [load, scheduleId]);

  useEffect(() => { void refresh(occurrenceId); }, [refresh, occurrenceId]);

  const rows: any[] = data?.rows ?? [];
  const counts = useMemo(() => {
    const c: Record<Answer, number> = { yes: 0, maybe: 0, no: 0, none: 0 };
    for (const r of rows) c[r.answer as Answer]++;
    return c;
  }, [rows]);
  const shown = rows.filter((r) => (filter === "all" || r.answer === filter) && `${r.name} ${r.email ?? ""} ${r.phone ?? ""} ${r.note ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const date = (data?.dates ?? []).find((d: any) => d.id === data?.occurrenceId);

  function download() {
    const lines = [["Name", "Email", "Phone", "Answer", "Note", "Answered by", "Answered at"]];
    for (const r of rows) lines.push([r.name, r.email ?? "", r.phone ?? "", ANSWER_LABEL[r.answer as Answer], r.note ?? "", r.source === "host" ? "Host" : r.source ? "Guest" : "", r.answeredAt ?? ""]);
    const blob = new Blob([lines.map((l) => l.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `attendance-${String(date?.startsAt ?? "").slice(0, 10) || "date"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function change(personId: string, answer: Answer) {
    if (!data?.occurrenceId) return;
    try {
      await setAnswer({ data: { id: scheduleId, occurrenceId: data.occurrenceId, personId, answer } });
      toast.success("Answer saved");
      void refresh(data.occurrenceId);
    } catch (e) { toast.error(toUserMessage(e)); }
  }

  if (err) return <p className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">{err}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading attendance...</p>;
  if (!data.occurrenceId) return <p className="rounded-3xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-ink/5">There are no dates on this schedule yet.</p>;

  return (
    <section className="space-y-4 rounded-3xl bg-card p-6 ring-1 ring-ink/5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-0 flex-1"><span className="block text-xs font-medium text-muted-foreground">Date</span>
          <select className={field} value={data.occurrenceId} onChange={(e) => setOccurrenceId(e.target.value)} aria-label="Date">
            {data.dates.map((d: any) => <option key={d.id} value={d.id}>{d.label}{d.past ? " (past)" : ""}</option>)}
          </select>
        </label>
        <button type="button" onClick={download} className="rounded-full bg-secondary px-4 py-2 text-sm">Download CSV</button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ORDER.map((a) => (
          <button key={a} type="button" aria-pressed={filter === a} onClick={() => setFilter(filter === a ? "all" : a)}
            className={`rounded-2xl p-3 text-left ring-1 ${filter === a ? "ring-velvet" : "ring-ink/5"} ${TONE[a]}`}>
            <span className="block text-2xl font-semibold">{counts[a]}</span>
            <span className="text-xs">{ANSWER_LABEL[a]}</span>
          </button>
        ))}
      </div>

      <input className={field} placeholder="Search by name, phone, email or note" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search attendance" />

      <ul className="divide-y divide-ink/5 rounded-2xl ring-1 ring-ink/5">
        {shown.map((r) => (
          <li key={r.personId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.name}</p>
              {r.note ? <p className="text-xs text-muted-foreground">"{r.note}"</p> : null}
              {r.source === "host" ? <p className="text-xs text-muted-foreground">Set by you</p> : null}
            </div>
            <select className="rounded-xl border border-ink/10 bg-background px-2 py-1.5 text-sm" value={r.answer} onChange={(e) => void change(r.personId, e.target.value as Answer)} aria-label={`Answer for ${r.name}`}>
              {ORDER.map((a) => <option key={a} value={a}>{ANSWER_LABEL[a]}</option>)}
            </select>
          </li>
        ))}
        {!shown.length ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nobody matches.</li> : null}
      </ul>
      <p className="text-xs text-muted-foreground">People who say they cannot attend get no more automatic reminders for that date.</p>
    </section>
  );
}

/** Shown on the Reminders tab when some messages do not carry the RSVP link yet. */
export function RsvpSuggestion({ scheduleId, steps, onDone }: { scheduleId: string; steps: any[]; onDone: () => void }) {
  const add = useServerFn(addRsvpLinkToSteps);
  const [busy, setBusy] = useState(false);
  const missing = steps.filter((s) => !s.is_starting_now && !String(s.body ?? "").includes("{rsvp}")).length;
  if (!steps.length || !missing) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-secondary p-4 text-sm">
      <p className="min-w-0 flex-1">Want people to tell you if they are coming? Add each person's RSVP link to {missing === 1 ? "1 message" : `${missing} messages`}.</p>
      <button type="button" disabled={busy} className="rounded-full bg-velvet px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          try { const r = await add({ data: { id: scheduleId } }); toast.success(`RSVP link added to ${r.updated === 1 ? "1 message" : `${r.updated} messages`}`); onDone(); }
          catch (e) { toast.error(toUserMessage(e)); }
          finally { setBusy(false); }
        }}>Add RSVP link to my messages</button>
    </div>
  );
}
