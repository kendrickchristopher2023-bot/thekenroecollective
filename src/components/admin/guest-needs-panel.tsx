import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getGuestNeedsOverview, type GuestNeedsEvent } from "@/lib/event-reports.functions";
import { EventReportDialog } from "@/components/admin/event-report-dialog";
import { SkeletonBlock } from "@/components/skeletons";

function csvEscape(v: string | number | undefined) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number | undefined)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Dietary restrictions and accessibility needs across every event.
 *
 * This exists because the data used to be visible only inside a wide
 * per-event table: hosts, caterers and venues need it as a standing list that
 * owners and admins can actually find and forward.
 */
export function GuestNeedsPanel() {
  const fetchOverview = useServerFn(getGuestNeedsOverview);
  const [data, setData] = useState<Awaited<ReturnType<typeof getGuestNeedsOverview>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchOverview()
      .then((r) => {
        if (alive) setData(r);
      })
      .catch(() => {
        if (alive) toast.error("Could not load guest dietary and accessibility data.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [fetchOverview]);

  const events: GuestNeedsEvent[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = data?.events ?? [];
    if (!q) return all;
    return all.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.ownerEmail ?? "").toLowerCase().includes(q) ||
        e.needs.some(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            n.dietary.toLowerCase().includes(q) ||
            n.accessibility.toLowerCase().includes(q),
        ),
    );
  }, [data, search]);

  function exportCsv() {
    downloadCsv("guest-dietary-accessibility.csv", [
      ["Event", "Event date", "Host email", "Guest", "RSVP", "Dietary restrictions", "Accessibility needs"],
      ...events.flatMap((e) =>
        e.needs.map((n) => [e.title, e.when, e.ownerEmail ?? "", n.name, n.rsvp, n.dietary, n.accessibility]),
      ),
    ]);
    toast.success("Exported");
  }

  return (
    <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-serif text-2xl">Dietary &amp; accessibility needs</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Every guest note submitted through an RSVP, across all events, so it can be relayed for
            catering, venue and accommodation planning.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={!data}
          className="min-h-11 shrink-0 rounded-full px-3 text-xs font-medium ring-1 ring-ink/15 hover:bg-secondary disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>

      {data && (
        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full bg-secondary px-3 py-1">
            {data.totals.events} event{data.totals.events === 1 ? "" : "s"} with notes
          </span>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">
            {data.totals.withDietary} guest{data.totals.withDietary === 1 ? "" : "s"} with dietary notes
          </span>
          <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-900">
            {data.totals.withAccessibility} with accessibility needs
          </span>
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search event, host, guest or note…"
        aria-label="Search dietary and accessibility notes"
        className="mt-4 min-h-11 w-full rounded-full bg-secondary px-4 text-sm focus:outline-none"
      />

      {loading ? (
        <SkeletonBlock className="mt-5 h-48 w-full" />
      ) : events.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          No guest has submitted dietary restrictions or accessibility needs yet.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {events.map((e) => (
            <div key={e.eventId} className="rounded-2xl bg-secondary/30 p-4 ring-1 ring-ink/5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {[e.when, e.venue, e.ownerEmail].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <button
                  onClick={() => setOpenEventId(e.eventId)}
                  className="min-h-11 shrink-0 rounded-full px-3 text-xs ring-1 ring-ink/15 hover:bg-card"
                >
                  Full report
                </button>
              </div>
              <ul className="mt-3 space-y-2">
                {e.needs.map((n, i) => (
                  <li key={i} className="rounded-xl bg-card p-3 text-xs ring-1 ring-ink/5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium">{n.name}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {n.rsvp}
                      </span>
                    </div>
                    {n.dietary ? (
                      <p className="mt-1 text-amber-800">🍽 {n.dietary}</p>
                    ) : null}
                    {n.accessibility ? (
                      <p className="mt-1 text-sky-800">♿ {n.accessibility}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {openEventId && (
        <EventReportDialog eventId={openEventId} onClose={() => setOpenEventId(null)} />
      )}
    </section>
  );
}
