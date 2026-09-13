import { toUserMessage } from "@/lib/user-error";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import jsPDF from "jspdf";
import { toast } from "sonner";
import {
  listPiecesForModeration,
  soundSalesReport,
  takedownPiece,
} from "@/lib/music-studio.functions";
import { money } from "@/lib/music-studio-pricing";
import { formatTimestamp } from "@/lib/datetime";

type Sale = {
  id: string;
  priceKey: string;
  seconds: number;
  amountCents: number;
  status: string;
  creditUnused: boolean;
  environment: string;
  attachedTo: string;
  eventId: string | null;
  isDemo: boolean;
  title: string;
  createdAt: string;
};

type Piece = {
  id: string;
  userId: string;
  title: string;
  kind: string;
  seconds: number;
  eventId: string | null;
  origin: string;
  shareToken: string;
  createdAt: string;
  removedAt: string | null;
  removedReason: string | null;
  isDemo?: boolean;
};

const STATUS_FILTERS = ["all", "paid", "pending", "refunded"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const pill = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
    active ? "bg-ink text-paper ring-ink" : "bg-paper text-ink/70 ring-ink/10 hover:bg-secondary"
  }`;

function downloadCsv(filename: string, rows: (string | number | undefined)[][]) {
  const body = rows
    .map((r) =>
      r
        .map((cell) => {
          const v = cell === undefined || cell === null ? "" : String(cell);
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function lengthLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

/**
 * Owner-only Sound Studio console: what has been sold, and a moderation list
 * with a takedown control that actually works from a screen.
 *
 * Money defaults to what counts: live environment only, demo events excluded.
 * A test render on a demo event must never appear in revenue by accident, so
 * hiding it is the default and showing it is a deliberate click.
 */
export function SoundStudioPanel() {
  const fetchSales = useServerFn(soundSalesReport);
  const fetchPieces = useServerFn(listPiecesForModeration);
  const takedown = useServerFn(takedownPiece);

  const [sales, setSales] = useState<Sale[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [liveOnly, setLiveOnly] = useState(true);
  const [includeDemo, setIncludeDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [s, p] = await Promise.all([fetchSales(), fetchPieces()]);
      setSales((s as { sales: Sale[] }).sales);
      setPieces((p as { pieces: Piece[] }).pieces);
    } catch (e) {
      setErr(toUserMessage(e, "Couldn't load the studio report."));
    } finally {
      setLoading(false);
    }
  }, [fetchSales, fetchPieces]);

  useEffect(() => {
    void load();
  }, [load]);

  const scoped = useMemo(
    () =>
      sales.filter(
        (s) =>
          (liveOnly ? s.environment === "live" : true) && (includeDemo ? true : !s.isDemo),
      ),
    [sales, liveOnly, includeDemo],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: scoped.length };
    for (const s of scoped) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [scoped]);

  const rows = useMemo(
    () => (status === "all" ? scoped : scoped.filter((s) => s.status === status)),
    [scoped, status],
  );

  const revenueCents = scoped
    .filter((s) => s.status === "paid")
    .reduce((n, s) => n + s.amountCents, 0);
  const unusedCredits = scoped.filter((s) => s.status === "paid" && s.creditUnused).length;

  const scopeNote = `${liveOnly ? "Live payments" : "All environments"} · ${
    includeDemo ? "demo events included" : "demo events excluded"
  }`;

  function exportCsv() {
    downloadCsv("sound-studio-sales.csv", [
      ["Date", "Piece", "Length", "Price key", "Amount", "Status", "Credit unused", "Attached to", "Environment", "Demo"],
      ...rows.map((r) => [
        r.createdAt,
        r.title,
        lengthLabel(r.seconds),
        r.priceKey,
        (r.amountCents / 100).toFixed(2),
        r.status,
        r.creditUnused ? "yes" : "no",
        r.attachedTo,
        r.environment,
        r.isDemo ? "yes" : "no",
      ]),
    ]);
  }

  function exportPdf() {
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
    const margin = 32;
    const width = pdf.internal.pageSize.getWidth();
    const height = pdf.internal.pageSize.getHeight();
    const cols: Array<{ label: string; w: number; value: (r: Sale) => string }> = [
      { label: "Date", w: 110, value: (r) => formatTimestamp(r.createdAt) },
      { label: "Piece", w: 200, value: (r) => r.title || "(not composed yet)" },
      { label: "Length", w: 56, value: (r) => lengthLabel(r.seconds) },
      { label: "Amount", w: 64, value: (r) => money(r.amountCents) },
      { label: "Status", w: 70, value: (r) => r.status },
      { label: "Credit", w: 56, value: (r) => (r.creditUnused ? "unused" : "spent") },
      { label: "Attached", w: 78, value: (r) => r.attachedTo },
      { label: "Env", w: 60, value: (r) => r.environment },
    ];
    let y = 0;
    let page = 0;
    const header = () => {
      if (page > 0) pdf.addPage();
      page += 1;
      y = margin + 8;
      pdf.setFont("times", "bold");
      pdf.setFontSize(15);
      pdf.setTextColor(20, 20, 20);
      pdf.text("Kenroe Sound Studio — piece sales", margin, y);
      pdf.setFont("times", "normal");
      pdf.setFontSize(9.5);
      pdf.setTextColor(90, 96, 105);
      y += 14;
      pdf.text(
        `${scopeNote} · ${status === "all" ? "all statuses" : status} · ${rows.length} rows · ${money(revenueCents)} collected`,
        margin,
        y,
      );
      y += 18;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8.5);
      pdf.setTextColor(40, 40, 40);
      let x = margin;
      for (const c of cols) {
        pdf.text(c.label.toUpperCase(), x, y);
        x += c.w;
      }
      y += 6;
      pdf.setDrawColor(200);
      pdf.line(margin, y, width - margin, y);
      y += 12;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
    };
    header();
    for (const r of rows) {
      if (y > height - margin) header();
      let x = margin;
      for (const c of cols) {
        pdf.text(pdf.splitTextToSize(c.value(r), c.w - 6)[0] ?? "", x, y);
        x += c.w;
      }
      y += 14;
    }
    pdf.save("sound-studio-sales.pdf");
  }

  async function removePiece(p: Piece) {
    const reason = window.prompt(
      `Take down "${p.title}"? It stops playing, the listen link stops working, and the record is kept.\n\nReason (required, stored with your name):`,
      "",
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      toast.error("A reason is required, so the record says why it went.");
      return;
    }
    setBusy(p.id);
    try {
      await takedown({ data: { id: p.id, reason: reason.trim() } } as never);
      toast.success("Taken down. The listen link no longer resolves.");
      await load();
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't take that piece down."));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (err) {
    return <p className="py-10 text-center text-sm text-rose-700">{err}</p>;
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl text-ink">Piece sales</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setLiveOnly((v) => !v)} className={pill(liveOnly)}>
              {liveOnly ? "Live payments only" : "All environments"}
            </button>
            <button
              type="button"
              onClick={() => setIncludeDemo((v) => !v)}
              className={pill(!includeDemo)}
            >
              {includeDemo ? "Demo events included" : "Demo events excluded"}
            </button>
            <button type="button" onClick={exportCsv} className={pill(false)}>
              Download CSV
            </button>
            <button type="button" onClick={exportPdf} className={pill(false)}>
              Print PDF
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{scopeNote}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-2xl border p-4 text-left transition ${
                status === s ? "border-ink bg-secondary" : "border-ink/10 bg-white hover:bg-secondary/60"
              }`}
            >
              <p className="text-2xl font-semibold text-ink">{counts[s] ?? 0}</p>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {s === "all" ? "All purchases" : s}
              </p>
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-ink/10 bg-white p-4">
            <p className="text-2xl font-semibold text-ink">{money(revenueCents)}</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Collected</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white p-4">
            <p className="text-2xl font-semibold text-ink">{unusedCredits}</p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Paid but not yet composed
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 text-sm text-muted-foreground">
            No purchases in this view yet. Every piece so far was composed on an owner account,
            which composes free, so nothing has been charged.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Piece</th>
                  <th className="px-3 py-2">Length</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Attached to</th>
                  <th className="px-3 py-2">Env</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-ink/5">
                    <td className="px-3 py-2 whitespace-nowrap">{formatTimestamp(r.createdAt)}</td>
                    <td className="px-3 py-2">{r.title || "(not composed yet)"}</td>
                    <td className="px-3 py-2">{lengthLabel(r.seconds)}</td>
                    <td className="px-3 py-2">{money(r.amountCents)}</td>
                    <td className="px-3 py-2">
                      {r.status}
                      {r.creditUnused ? " · credit" : ""}
                    </td>
                    <td className="px-3 py-2">
                      {r.attachedTo}
                      {r.isDemo ? " (demo)" : ""}
                    </td>
                    <td className="px-3 py-2">{r.environment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-serif text-2xl text-ink">Moderation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every composed piece, newest first. Taking one down stops playback, kills the listen
          link, and keeps the record with your reason attached. The brief and the words are never
          shown here.
        </p>
        <ul className="mt-4 space-y-3">
          {pieces.map((p) => (
            <li
              key={p.id}
              className={`rounded-2xl border p-4 ${
                p.removedAt ? "border-rose-200 bg-rose-50/60" : "border-ink/10 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">
                    {p.title}{" "}
                    <span className="text-ink/50">
                      · {lengthLabel(p.seconds)} · {p.kind === "poem" ? "Spoken word" : "Song"} ·{" "}
                      {p.origin}
                    </span>
                    {p.isDemo ? (
                      <span className="ml-2 rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/60">
                        Test piece
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatTimestamp(p.createdAt)} · host {p.userId.slice(0, 8)}
                    {p.eventId ? ` · event ${p.eventId}` : ""}
                  </p>
                  {p.removedAt ? (
                    <p className="mt-1 text-xs font-medium text-rose-700">
                      Taken down {formatTimestamp(p.removedAt)}
                      {p.removedReason ? ` — ${p.removedReason}` : ""}
                    </p>
                  ) : null}
                </div>
                {p.removedAt ? null : (
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => void removePiece(p)}
                    className="min-h-[40px] shrink-0 rounded-full bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {busy === p.id ? "Removing…" : "Take down"}
                  </button>
                )}
              </div>
            </li>
          ))}
          {pieces.length === 0 ? (
            <li className="rounded-2xl border border-ink/10 bg-white p-5 text-sm text-muted-foreground">
              No pieces have been composed yet.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
