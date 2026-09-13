import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { emailReconciliationReport } from "@/lib/event-reports.functions";
import { EventReportDialog } from "@/components/admin/event-report-dialog";
import { getPaymentReconciliation, type ReconciliationReport } from "@/lib/payments-reconciliation.functions";
import { RECONCILIATION_CAVEAT } from "@/lib/payment-reconciliation";
import { SkeletonBlock } from "@/components/skeletons";

function money(n: number) {
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

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
 * Owner + admin reconciliation. Every number is self-reported by hosts, so the
 * caveat is rendered permanently, not behind a tooltip.
 */
export function PaymentReconciliationPanel() {
  const fetchReport = useServerFn(getPaymentReconciliation);
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [sending, setSending] = useState(false);
  const sendRecon = useServerFn(emailReconciliationReport);

  async function emailSummary() {
    const to = emailTo.trim();
    if (!to.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    setSending(true);
    try {
      const res = await sendRecon({ data: { to } });
      if (res.ok) toast.success(`Reconciliation report sent to ${to}`);
      else toast.error(`Could not send the report (${res.reason ?? "unknown"})`);
    } catch {
      toast.error("Could not send the report.");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchReport({ data: {} })
      .then((r) => {
        if (alive) setReport(r);
      })
      .catch(() => {
        if (alive) toast.error("Could not load the reconciliation report.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [fetchReport]);

  const rows = (report?.events ?? []).filter((e) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return e.title.toLowerCase().includes(q) || (e.ownerEmail ?? "").toLowerCase().includes(q) || e.eventId.includes(q);
  });

  function exportCsv() {
    if (!report) return;
    const methodCols = report.totals.byMethod.map((m) => m.label);
    const header = ["Event", "Event ID", "Host email", "Guests", "Billed", "Collected", "Refunded", "Outstanding", ...methodCols];
    const body = rows.map((e) => [
      e.title,
      e.eventId,
      e.ownerEmail ?? "",
      e.guests,
      e.billed.toFixed(2),
      e.collected.toFixed(2),
      e.refunded.toFixed(2),
      e.outstanding.toFixed(2),
      ...report.totals.byMethod.map((m) => (e.byMethod.find((x) => x.method === m.method)?.net ?? 0).toFixed(2)),
    ]);
    downloadCsv("payment-reconciliation.csv", [
      ["Self-reported host payments, not platform-verified"],
      header,
      ...body,
    ]);
  }

  return (
    <section className="rounded-3xl bg-card p-6 ring-1 ring-ink/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-serif text-2xl">Payment reconciliation</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Billed vs collected vs outstanding for every event, split by how the money came in.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={!report}
            className="min-h-11 rounded-full px-3 text-xs font-medium ring-1 ring-ink/15 hover:bg-secondary disabled:opacity-40"
          >
            Export CSV
          </button>
          <input
            type="email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="Email this report to…"
            aria-label="Email the reconciliation report to"
            className="min-h-11 min-w-[200px] rounded-full bg-secondary px-4 text-xs focus:outline-none"
          />
          <button
            onClick={emailSummary}
            disabled={!report || sending}
            className="min-h-11 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            {sending ? "Sending…" : "Email report"}
          </button>
        </div>
      </div>

      <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-900 ring-1 ring-amber-200">
        <span className="font-semibold uppercase tracking-wider">Self-reported</span> · {RECONCILIATION_CAVEAT}
      </p>

      {loading ? (
        <SkeletonBlock className="mt-5 h-48 w-full" />
      ) : !report ? (
        <p className="mt-5 text-sm text-muted-foreground">No reconciliation data available.</p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Billed", value: report.totals.billed },
              { label: "Collected", value: report.totals.collected },
              { label: "Outstanding", value: report.totals.outstanding },
              { label: "Refunded", value: report.totals.refunded },
            ].map((t) => (
              <div key={t.label} className="rounded-2xl bg-secondary/40 p-4 ring-1 ring-ink/5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{t.label}</div>
                <div className="mt-1 font-serif text-2xl">{money(t.value)}</div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Collected by method (all events)
            </div>
            {report.totals.byMethod.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No payments logged yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-1.5">Method</th>
                      <th className="py-1.5">Received</th>
                      <th className="py-1.5">Refunded</th>
                      <th className="py-1.5">Net</th>
                      <th className="py-1.5">Entries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.totals.byMethod.map((m) => (
                      <tr key={m.method} className="border-t border-ink/5">
                        <td className="py-1.5 font-medium">{m.label}</td>
                        <td className="py-1.5">{money(m.received)}</td>
                        <td className="py-1.5">{money(m.refunded)}</td>
                        <td className="py-1.5">{money(m.net)}</td>
                        <td className="py-1.5 text-muted-foreground">{m.entries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Event by event ({rows.length})
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search event or host"
                className="rounded-full bg-secondary px-3 py-1.5 text-xs focus:outline-none"
              />
            </div>
            {rows.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No events with payment collection yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-1.5">Event</th>
                      <th className="py-1.5">Host</th>
                      <th className="py-1.5">Billed</th>
                      <th className="py-1.5">Collected</th>
                      <th className="py-1.5">Outstanding</th>
                      <th className="py-1.5">Unpaid / partial</th>
                      <th className="py-1.5">Methods</th>
                      <th className="py-1.5">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.eventId} className="border-t border-ink/5 align-top">
                        <td className="py-2 font-medium">{e.title}</td>
                        <td className="py-2 text-muted-foreground">{e.ownerEmail ?? "—"}</td>
                        <td className="py-2">{money(e.billed)}</td>
                        <td className="py-2">{money(e.collected)}</td>
                        <td className="py-2">{money(e.outstanding)}</td>
                        <td className="py-2 text-muted-foreground">
                          {e.unpaidGuests} / {e.partialGuests}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {e.byMethod.length === 0
                            ? "—"
                            : e.byMethod.map((m) => `${m.label} ${money(m.net)}`).join(", ")}
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() => setOpenEventId(e.eventId)}
                            className="min-h-11 rounded-full px-3 text-[11px] font-medium ring-1 ring-ink/15 hover:bg-secondary"
                          >
                            Open report
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      {openEventId ? (
        <EventReportDialog eventId={openEventId} onClose={() => setOpenEventId(null)} />
      ) : null}
    </section>
  );
}
