import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { billableAdults, fetchViewerEvent, formatEventDate, partyMemberCount, useEvent, type KEvent } from "@/lib/events-store";
import { exportRunOfShowPdf } from "@/lib/report-export";
import { formatTimestamp } from "@/lib/datetime";

export const Route = createFileRoute("/events/$eventId/run-of-show")({
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s.t === "string" ? s.t : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Run of show — The Kenroe Collective" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RunOfShowPage,
});

function RunOfShowPage() {
  const { eventId } = Route.useParams();
  const { t: tokenParam } = Route.useSearch();
  const localEvent = useEvent(eventId);
  const [remoteEvent, setRemoteEvent] = useState<KEvent | null | undefined>(undefined);
  useEffect(() => {
    if (localEvent) return;
    let cancelled = false;
    fetchViewerEvent(eventId, tokenParam).then((e) => { if (!cancelled) setRemoteEvent(e ?? null); });
    return () => { cancelled = true; };
  }, [eventId, localEvent, tokenParam]);
  const event = localEvent ?? (remoteEvent || undefined);
  const tokenOk = !!localEvent || (event?.shareToken ? event.shareToken === tokenParam : false);
  if (!event) {
    if (!localEvent && remoteEvent === undefined) {
      return <div className="p-8 text-sm text-gray-500">Loading run of show…</div>;
    }
    return <div className="p-8">Event not found.</div>;
  }
  if (!tokenOk) {
    return (
      <div className="p-8 text-sm text-gray-600">
        This run-of-show link needs an access code. Ask the event host to re-share it from their dashboard.
      </div>
    );
  }



  const blocks = [...(event.timelineBlocks ?? [])].sort((a, b) => a.time.localeCompare(b.time));
  const tables = event.seatingTables ?? [];

  return (
    <div className="min-h-screen bg-white p-8 text-gray-900 print:p-0">
      <style>{`
        @media print {
          @page { margin: 0.6in; }
          .no-print { display: none !important; }
          section { break-inside: avoid; }
        }
        body { font-family: Georgia, serif; }
      `}</style>

      <div className="no-print mx-auto mb-6 flex max-w-3xl items-center justify-between">
        <h1 className="font-serif text-2xl">Run of show</h1>
        <button
          onClick={() => exportRunOfShowPdf(event)}
          className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Download PDF
        </button>
      </div>

      <article className="mx-auto max-w-3xl">
        <header className="mb-8 border-b border-gray-300 pb-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">Run of Show</div>
          <h1 className="mt-1 font-serif text-3xl">{event.title}</h1>
          <div className="mt-1 text-sm text-gray-600">
            {formatEventDate(event.date, event.timezone).long} · {formatEventDate(event.date, event.timezone).time} · {event.venue}
            {event.address ? ` · ${event.address}` : ""}
          </div>
          {event.hosts?.length ? (
            <div className="mt-1 text-xs text-gray-500">
              Hosts: {event.hosts.map((h) => h.name).join(", ")}
            </div>
          ) : null}
        </header>

        <section>
          <h2 className="font-serif text-xl">Timeline</h2>
          {blocks.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No timeline blocks added yet.</p>
          ) : (
            <>
              <ul className="mt-3 space-y-2 sm:hidden print:hidden">
                {blocks.map((b) => (
                  <li key={b.id} className="rounded border border-gray-200 p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="font-mono text-sm">{b.time}</div>
                      {b.durationMin ? <div className="text-[11px] text-gray-500">{b.durationMin} min</div> : null}
                    </div>
                    <div className="mt-1 font-serif text-base break-anywhere">{b.title}</div>
                    {b.owner ? <div className="mt-0.5 text-xs text-gray-600">Owner: {b.owner}</div> : null}
                    {b.notes ? <div className="mt-1 text-xs text-gray-600 break-anywhere">{b.notes}</div> : null}
                  </li>
                ))}
              </ul>
              <table className="mt-3 hidden w-full border-collapse text-sm sm:table print:table">
                <thead>
                  <tr className="border-b border-gray-300 text-left text-[11px] uppercase tracking-wider text-gray-500">
                    <th className="py-2">Time</th>
                    <th className="py-2">Block</th>
                    <th className="py-2">Owner</th>
                    <th className="py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((b) => (
                    <tr key={b.id} className="border-b border-gray-100 align-top">
                      <td className="py-2 font-mono text-sm">{b.time}</td>
                      <td className="py-2">
                        <div className="font-serif">{b.title}</div>
                        {b.durationMin ? <div className="text-[11px] text-gray-500">{b.durationMin} min</div> : null}
                      </td>
                      <td className="py-2 text-sm">{b.owner ?? "—"}</td>
                      <td className="py-2 text-sm text-gray-600">{b.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>


        {tables.length > 0 && (
          <section className="mt-10">
            <h2 className="font-serif text-xl">Seating</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {tables.map((t) => {
                const seated = t.guestIds
                  .map((id) => event.guests.find((g) => g.id === id))
                  .filter((g): g is NonNullable<typeof g> => !!g);
                const totalSeated = seated.reduce((sum, g) => sum + partyMemberCount(g), 0);
                return (
                  <div key={t.id} className="rounded border border-gray-200 p-3">
                    <div className="flex items-baseline justify-between">
                      <div className="font-serif text-base">{t.label}</div>
                      <div className="text-[11px] text-gray-500">
                        {totalSeated} / {t.capacity} · {t.shape}
                      </div>
                    </div>
                    <ol className="mt-1 list-decimal pl-5 text-sm">
                      {seated.map((g) => {
                        const a = billableAdults(g);
                        const k = Math.max(0, g.children ?? 0);
                        const p = Math.max(0, g.pets ?? 0);
                        return (
                          <li key={g.id}>
                            {g.name}
                            {a > 0 && <span className="ml-1 inline-block rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-800">{a}× Adult</span>}
                            {k > 0 && <span className="ml-1 inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{k}× Kid</span>}
                            {p > 0 && <span className="ml-1 inline-block rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">{p}× Pet</span>}
                            {g.dietary ? (
                              <span className="ml-1 text-[11px] text-gray-500">({g.dietary})</span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <footer className="mt-12 border-t border-gray-200 pt-4 text-[11px] text-gray-500">
          Generated by The Kenroe Collective · {formatTimestamp(new Date())}
        </footer>
      </article>
    </div>
  );
}
