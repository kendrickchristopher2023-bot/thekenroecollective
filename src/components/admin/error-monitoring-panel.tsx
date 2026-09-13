import { toUserMessage } from "@/lib/user-error";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getErrorGroupDetail,
  listErrorGroups,
  type ErrorGroup,
} from "@/lib/error-monitoring.functions";
import { setErrorGroupResolved } from "@/lib/error-monitoring.functions";
import { formatOwnerId } from "@/lib/format-owner";
import { formatTimestamp } from "@/lib/datetime";

type StatusFilter = "all" | "unresolved" | "resolved";

const RANGES = [
  { id: "24h", label: "24 hours", days: 1 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
] as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * Owner-only error monitoring. Every read/write goes through owner-gated
 * server functions; plain admins get "Forbidden" from the server.
 */
export function ErrorMonitoringPanel() {
  const fetchGroups = useServerFn(listErrorGroups);
  const fetchDetail = useServerFn(getErrorGroupDetail);
  const setResolved = useServerFn(setErrorGroupResolved);

  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]["id"]>("7d");
  const [status, setStatus] = useState<StatusFilter>("unresolved");
  const [routeFilter, setRouteFilter] = useState("");
  const [data, setData] = useState<Awaited<ReturnType<typeof listErrorGroups>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openFingerprint, setOpenFingerprint] = useState<string | null>(null);
  const [detail, setDetail] = useState<any[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const days = RANGES.find((r) => r.id === rangeId)!.days;
    try {
      const res = await fetchGroups({
        data: {
          since: new Date(Date.now() - days * 864e5).toISOString(),
          until: new Date().toISOString(),
          status,
        },
      });
      setData(res);
    } catch (e) {
      setErr(toUserMessage(e, "Failed to load errors"));
    } finally {
      setLoading(false);
    }
  }, [rangeId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const list: ErrorGroup[] = data?.groups ?? [];
    const q = routeFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((g) => g.routes.some((r) => r.toLowerCase().includes(q)));
  }, [data, routeFilter]);

  async function toggleOpen(g: ErrorGroup) {
    if (openFingerprint === g.fingerprint) {
      setOpenFingerprint(null);
      setDetail(null);
      return;
    }
    setOpenFingerprint(g.fingerprint);
    setDetail(null);
    try {
      const res = await fetchDetail({ data: { fingerprint: g.fingerprint } });
      setDetail(res.occurrences);
    } catch {
      setDetail([]);
    }
  }

  async function markResolved(g: ErrorGroup, resolved: boolean) {
    try {
      await setResolved({ data: { fingerprint: g.fingerprint, resolved } });
      toast.success(resolved ? "Marked resolved" : "Reopened");
      void load();
    } catch (e) {
      toast.error(toUserMessage(e, "Could not update"));
    }
  }

  if (err) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        {err}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile
          label="Errors (last 24h)"
          value={data?.totals.last24h ?? 0}
          tone="rose"
        />
        <MetricTile
          label={`Occurrences (${RANGES.find((r) => r.id === rangeId)!.label})`}
          value={data?.totals.occurrences ?? 0}
          tone="amber"
        />
        <MetricTile label="Distinct issues" value={data?.totals.groups ?? 0} tone="sky" />
        <MetricTile
          label="Unresolved issues"
          value={data?.totals.unresolvedGroups ?? 0}
          tone="violet"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-secondary p-1 ring-1 ring-ink/10">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRangeId(r.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                rangeId === r.id ? "bg-paper shadow-sm text-ink" : "text-muted-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-full bg-secondary p-1 ring-1 ring-ink/10">
          {(["unresolved", "resolved", "all"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                status === s ? "bg-paper shadow-sm text-ink" : "text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="error-route-filter">
          Filter by route
        </label>
        <input
          id="error-route-filter"
          value={routeFilter}
          onChange={(e) => setRouteFilter(e.target.value)}
          placeholder="Filter by route…"
          className="min-h-9 rounded-full border border-ink/10 bg-paper px-4 text-xs"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-9 rounded-full bg-ink px-4 text-xs font-medium text-paper"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground">
          Loading errors…
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-10 text-center">
          <div className="text-3xl" aria-hidden="true">
            ✅
          </div>
          <p className="mt-2 font-serif text-xl">No errors in this window</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Errors are captured automatically from every page, for guests and signed-in
            hosts alike.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li
              key={g.fingerprint}
              className="overflow-hidden rounded-2xl bg-card ring-1 ring-ink/5"
            >
              <div className="flex flex-wrap items-start gap-3 p-4">
                <span
                  className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    g.resolved
                      ? "bg-emerald-500/10 text-emerald-700"
                      : "bg-rose-500/10 text-rose-700"
                  }`}
                >
                  {g.resolved ? "Resolved" : "Open"}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => void toggleOpen(g)}
                    className="block w-full text-left"
                  >
                    <span className="font-medium text-ink">{g.error_name}</span>
                    <span className="ml-2 break-words text-sm text-muted-foreground">
                      {g.message}
                    </span>
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-ink">
                      ×{g.count}
                    </span>
                    <span>last {timeAgo(g.last_seen)}</span>
                    <span>first {formatTimestamp((g.first_seen))}</span>
                    {g.routes.slice(0, 3).map((r) => (
                      <span key={r} className="font-mono">
                        {r}
                      </span>
                    ))}
                    {g.sources.map((s) => (
                      <span key={s} className="rounded-full bg-secondary px-2 py-0.5">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void markResolved(g, !g.resolved)}
                  className="rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                >
                  {g.resolved ? "Reopen" : "Mark resolved"}
                </button>
              </div>

              {openFingerprint === g.fingerprint && (
                <div className="border-t border-ink/5 bg-secondary/30 p-4">
                  {detail === null ? (
                    <p className="text-xs text-muted-foreground">Loading occurrences…</p>
                  ) : (
                    <div className="space-y-3">
                      {detail.map((o) => (
                        <div key={o.id} className="rounded-xl bg-paper p-3 ring-1 ring-ink/5">
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span>{formatTimestamp((o.created_at))}</span>
                            {o.route ? <span className="font-mono">{o.route}</span> : null}
                            <span>{o.environment}</span>
                            {o.user_id ? <span>user {formatOwnerId(o.user_id)}</span> : <span>guest</span>}
                          </div>
                          {o.user_agent ? (
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">
                              {o.user_agent}
                            </p>
                          ) : null}
                          {o.stack ? (
                            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary/60 p-2 text-[11px] leading-relaxed">
                              {o.stack}
                            </pre>
                          ) : null}
                        </div>
                      ))}
                      {detail.length === 0 && (
                        <p className="text-xs text-muted-foreground">No details available.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TONES: Record<string, string> = {
  rose: "from-rose-500/15 to-rose-500/0 text-rose-700",
  amber: "from-amber-500/15 to-amber-500/0 text-amber-700",
  sky: "from-sky-500/15 to-sky-500/0 text-sky-700",
  violet: "from-violet-500/15 to-violet-500/0 text-violet-700",
  emerald: "from-emerald-500/15 to-emerald-500/0 text-emerald-700",
};

export function MetricTile({
  label,
  value,
  tone = "sky",
  hint,
}: {
  label: string;
  value: number | string;
  tone?: keyof typeof TONES | string;
  hint?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-gradient-to-br p-4 ring-1 ring-ink/5 ${TONES[tone] ?? TONES.sky}`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div className="mt-1 font-serif text-3xl text-ink">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
