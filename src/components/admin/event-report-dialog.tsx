import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getEventFullReport,
  emailEventReport,
  type EventFullReport,
} from "@/lib/event-reports.functions";
import { guestReportSummaryPairs, guestReportMatrix, guestNeedRows } from "@/lib/guest-report";
import { SkeletonBlock } from "@/components/skeletons";
import { formatTimestamp } from "@/lib/datetime";

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

function money(n: number) {
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

/**
 * Single-event drill-down for owners/admins: everything a guest submitted plus
 * that event's payment reconciliation and attendance, on its own instead of one
 * row inside the cross-event table.
 */
export function EventReportDialog({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const fetchReport = useServerFn(getEventFullReport);
  const sendReport = useServerFn(emailEventReport);
  const [full, setFull] = useState<EventFullReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchReport({ data: { eventId } })
      .then((r) => {
        if (alive) setFull(r);
      })
      .catch(() => {
        if (alive) toast.error("Could not load this event's report.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [eventId, fetchReport]);

  function exportCsv() {
    if (!full) return;
    const name = full.title.replace(/\W+/g, "_") || "event";
    downloadCsv(`${name}-full-guest-report.csv`, [
      [`Guest report — ${full.title}`],
      [`Generated ${formatTimestamp(full.generatedAt)}`],
      ...(full.report.flags.payments ? [[full.caveat]] : []),
      [],
      ...guestReportSummaryPairs(full.report).map((p) => [p.label, p.value]),
      [],
      ...guestReportMatrix(full.report),
    ]);
    toast.success("Report exported");
  }

  async function email() {
    if (!full) return;
    const address = to.trim();
    if (!address.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    setSending(true);
    try {
      const res = await sendReport({ data: { eventId, to: address } });
      if (res.ok) toast.success(`Report sent to ${address}`);
      else toast.error(`Could not send the report (${res.reason ?? "unknown"})`);
    } catch {
      toast.error("Could not send the report.");
    } finally {
      setSending(false);
    }
  }

  const pairs = full ? guestReportSummaryPairs(full.report) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Event report"
    >
      <div className="w-full max-w-4xl rounded-3xl bg-card p-5 shadow-xl ring-1 ring-ink/10 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl">{full ? full.title : "Event report"}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {full ? [full.when, full.venue, full.ownerEmail].filter(Boolean).join(" · ") : "Loading…"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-full px-3 text-sm ring-1 ring-ink/15 hover:bg-secondary"
            aria-label="Close report"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <SkeletonBlock className="mt-5 h-64 w-full" />
        ) : !full ? (
          <p className="mt-5 text-sm text-muted-foreground">No report available for this event.</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={exportCsv}
                className="min-h-11 rounded-full px-4 text-xs font-medium ring-1 ring-ink/15 hover:bg-secondary"
              >
                Export full CSV
              </button>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="Email this report to…"
                aria-label="Email this report to"
                className="min-h-11 min-w-[220px] flex-1 rounded-full bg-secondary px-4 text-sm focus:outline-none"
              />
              <button
                onClick={email}
                disabled={sending}
                className="min-h-11 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                {sending ? "Sending…" : "Email report"}
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-secondary/40 p-4 ring-1 ring-ink/5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Guest data &amp; attendance
                </div>
                <dl className="mt-2 space-y-1 text-xs">
                  {pairs.map((p) => (
                    <div key={p.label} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{p.label}</dt>
                      <dd className="font-medium">{p.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-2xl bg-secondary/40 p-4 ring-1 ring-ink/5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Payment reconciliation
                </div>
                <dl className="mt-2 space-y-1 text-xs">
                  {[
                    ["Billed", money(full.reconciliation.billed)],
                    ["Collected", money(full.reconciliation.collected)],
                    ["Refunded", money(full.reconciliation.refunded)],
                    ["Outstanding", money(full.reconciliation.outstanding)],
                    ["Unpaid guests", String(full.reconciliation.unpaidGuests)],
                    ["Partial payments", String(full.reconciliation.partialGuests)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-medium">{v}</dd>
                    </div>
                  ))}
                  {full.reconciliation.byMethod.map((m) => (
                    <div key={m.method} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{m.label}</dt>
                      <dd className="font-medium">{money(m.net)}</dd>
                    </div>
                  ))}
                </dl>
                {full.report.flags.payments ? (
                  <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">{full.caveat}</p>
                ) : null}
              </div>
            </div>

            {(() => {
              const needs = guestNeedRows(full.report);
              return (
                <div className="mt-6">
                  <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Dietary &amp; accessibility ({needs.length})
                  </div>
                  {needs.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No dietary restrictions or accessibility needs submitted for this event.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {needs.map((n, i) => (
                        <li key={i} className="rounded-xl bg-secondary/40 p-3 text-xs ring-1 ring-ink/5">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-medium">{n.name}</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {n.rsvp}
                            </span>
                          </div>
                          {n.dietary ? <p className="mt-1 text-amber-800">🍽 {n.dietary}</p> : null}
                          {n.accessibility ? <p className="mt-1 text-sky-800">♿ {n.accessibility}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            <div className="mt-6">
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Guest by guest ({full.report.rows.length})
              </div>
              {full.report.rows.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No guests on this event yet.</p>
              ) : (
                <div className="mt-3 max-h-[45vh] overflow-auto rounded-2xl ring-1 ring-ink/5">
                  <table className="w-full min-w-[900px] text-left text-[11px]">
                    <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        {full.report.columns.map((c) => (
                          <th key={c} className="whitespace-nowrap px-2 py-2">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {full.report.rows.map((r, i) => (
                        <tr key={i} className="border-t border-ink/5 align-top">
                          {r.map((cell, j) => (
                            <td key={j} className="px-2 py-1.5">
                              {String(cell ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
