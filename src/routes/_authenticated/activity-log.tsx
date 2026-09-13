import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, Download, Search } from "lucide-react";
import { OwnerMfaGate } from "@/components/owner-mfa-gate";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonBlock } from "@/components/skeletons";
import { listEventActivity, type EventActivityEntry } from "@/lib/event-activity.functions";
import { formatTimestamp } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/activity-log")({
  head: () => ({
    meta: [
      { title: "Activity log | The Kenroe Collective" },
      { name: "description", content: "Owner and admin activity history for event check-ins and walk-ins." },
      { property: "og:title", content: "Activity log | The Kenroe Collective" },
      { property: "og:description", content: "Owner and admin activity history for event check-ins and walk-ins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <OwnerMfaGate><ActivityLogPage /></OwnerMfaGate>,
});

const ACTION_LABELS: Record<EventActivityEntry["action"], string> = {
  "guest.checked_in": "Checked in",
  "guest.checked_out": "Check-in reversed",
  "walkin.added": "Walk-in added",
};

function ActivityLogPage() {
  const loadActivity = useServerFn(listEventActivity);
  const [rows, setRows] = useState<EventActivityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<"all" | EventActivityEntry["action"]>("all");

  useEffect(() => {
    let active = true;
    setError(null);
    loadActivity({ data: { action, limit: 500 } })
      .then((result) => { if (active) setRows(result); })
      .catch((err) => { if (active) setError(toUserMessage(err, "Could not load activity.")); });
    return () => { active = false; };
  }, [action, loadActivity]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((row) =>
      [row.eventTitle, row.guestName, row.tableLabel, row.actorLabel, ACTION_LABELS[row.action], row.note]
        .filter(Boolean).some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  function downloadCsv() {
    const values = [
      ["Date and time", "Action", "Gathering", "Guest", "Seat location", "People", "Performed by", "Note"],
      ...filtered.map((row) => [formatTimestamp(row.occurredAt), ACTION_LABELS[row.action], row.eventTitle, row.guestName ?? "", row.tableLabel ?? "", row.heads ?? "", row.actorLabel, row.note ?? ""]),
    ];
    const csv = values.map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "event-activity-log.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em] text-velvet"><ClipboardList className="h-4 w-4" /> Admin &amp; owner</div>
            <h1 className="mt-2 font-serif text-4xl">Activity log</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">A timestamped record of guest check-ins, reversed check-ins, and walk-ins.</p>
          </div>
          <Button type="button" variant="outline" onClick={downloadCsv} disabled={!filtered.length}><Download /> Export CSV</Button>
        </header>

        <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_220px]">
          <label className="relative">
            <span className="sr-only">Search activity</span>
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search guest, gathering, or person" className="min-h-11 pl-10" />
          </label>
          <label>
            <span className="sr-only">Filter by action</span>
            <select value={action} onChange={(event) => setAction(event.target.value as typeof action)} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="all">All actions</option>
              <option value="guest.checked_in">Checked in</option>
              <option value="guest.checked_out">Check-in reversed</option>
              <option value="walkin.added">Walk-in added</option>
            </select>
          </label>
        </div>

        {error ? (
          <div className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
        ) : rows === null ? (
          <SkeletonBlock className="mt-6 h-64 w-full" />
        ) : filtered.length === 0 ? (
          <div className="mt-6 border-y border-ink/10 py-14 text-center text-sm text-muted-foreground">No activity matches this view yet.</div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-md border border-ink/10 bg-card">
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink/10 bg-secondary/50 text-xs text-muted-foreground"><tr><th className="p-3">Date and time</th><th className="p-3">Action</th><th className="p-3">Gathering</th><th className="p-3">Guest</th><th className="p-3">Seat location</th><th className="p-3">People</th><th className="p-3">Performed by</th></tr></thead>
                <tbody>{filtered.map((row) => <tr key={row.id} className="border-b border-ink/5 last:border-0"><td className="whitespace-nowrap p-3">{formatTimestamp(row.occurredAt)}</td><td className="p-3 font-medium">{ACTION_LABELS[row.action]}</td><td className="p-3">{row.eventTitle}</td><td className="p-3">{row.guestName ?? "Guest"}</td><td className="p-3">{row.tableLabel ?? "—"}</td><td className="p-3">{row.heads ?? "—"}</td><td className="p-3">{row.actorLabel}</td></tr>)}</tbody>
              </table>
            </div>
            <ul className="divide-y divide-ink/10 md:hidden">{filtered.map((row) => <li key={row.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{ACTION_LABELS[row.action]} · {row.guestName ?? "Guest"}</div><div className="mt-1 text-xs text-muted-foreground">{row.eventTitle}{row.tableLabel ? ` · ${row.tableLabel}` : ""}{row.heads ? ` · ${row.heads} ${row.heads === 1 ? "person" : "people"}` : ""}</div></div><time className="shrink-0 text-right text-[11px] text-muted-foreground">{formatTimestamp(row.occurredAt)}</time></div><div className="mt-2 text-xs text-muted-foreground">By {row.actorLabel}{row.note ? ` · ${row.note}` : ""}</div></li>)}</ul>
          </div>
        )}
        <Link to="/reports" className="mt-8 inline-block text-sm text-velvet hover:underline">Back to reports</Link>
      </main>
      <SiteFooter />
    </div>
  );
}