import { toUserMessage } from "@/lib/user-error";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { recentEventUpdates, type RecentUpdateRow } from "@/lib/events-admin.functions";
import { formatTimestamp } from "@/lib/datetime";

export function RecentUpdatesReport({ limit = 5 }: { limit?: number }) {
  const fetchRecent = useServerFn(recentEventUpdates);
  const [rows, setRows] = useState<RecentUpdateRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    fetchRecent({ data: { limit } })
      .then((r) => setRows(r as RecentUpdateRow[]))
      .catch((e) => setErr(toUserMessage(e, "Failed to load")));

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [limit]);

  return (
    <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-serif text-2xl">Reports — Recent event updates</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Last {limit} events created or edited, with the account responsible.
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <button onClick={load} className="text-velvet hover:underline">Refresh</button>
          <Link to="/owner-events" className="text-velvet hover:underline">All events →</Link>
        </div>
      </div>

      {err && <p className="mt-4 text-sm text-rose-600">{err}</p>}
      {!err && rows === null && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>}
      {!err && rows && rows.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No events yet.</p>
      )}

      {rows && rows.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">When</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2 pr-3">Event</th>
                <th className="py-2 pr-3">By</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const who = r.updated_by_name || r.updated_by_email || (r.user_id ? r.user_id.slice(0, 8) : "—");
                const action = r.archived_at ? "Archived" : r.is_new ? "Created" : "Edited";
                const label = r.title || r.branded_slug || r.id;
                return (
                  <tr key={r.id} className="border-t border-ink/5">
                    <td className="py-2 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimestamp((r.updated_at))}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        action === "Archived" ? "bg-amber-100 text-amber-800"
                        : action === "Created" ? "bg-emerald-100 text-emerald-800"
                        : "bg-velvet/10 text-velvet"
                      }`}>{action}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{label}</div>
                      {r.branded_slug && r.title && (
                        <div className="text-xs text-muted-foreground">/{r.branded_slug}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div>{who}</div>
                      {r.updated_by_email && r.updated_by_name && (
                        <div className="text-xs text-muted-foreground">{r.updated_by_email}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Link
                        to="/events/$eventId"
                        params={{ eventId: r.id }}
                        className="text-xs text-velvet hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
