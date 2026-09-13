import { toUserMessage } from "@/lib/user-error";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listOwnerMessagingLog, type MessagingReport } from "@/lib/owner-messaging.functions";
import { formatTimestamp } from "@/lib/datetime";

const RANGES = [
  { id: "24h", label: "24 hours", days: 1 },
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
] as const;

const CHANNELS = [
  { id: "all", label: "All" },
  { id: "email", label: "Email" },
  { id: "sms", label: "Text" },
] as const;

const STATUSES = ["all", "sent", "pending", "queued", "failed", "dlq", "bounced", "suppressed"] as const;

function badgeClass(status: string): string {
  if (status === "sent") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "failed" || status === "dlq" || status === "bounced" || status === "complained")
    return "bg-rose-50 text-rose-700 ring-rose-200";
  if (status === "suppressed") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-secondary text-muted-foreground ring-ink/10";
}

const pill = (active: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
    active ? "bg-ink text-paper ring-ink" : "bg-paper text-ink/70 ring-ink/10 hover:bg-secondary"
  }`;

/**
 * Owner-only messaging report: every guest email and text across all events,
 * with delivery status. Read-only; the server function enforces owner + MFA.
 */
export function MessagingReportPanel() {
  const fetchLog = useServerFn(listOwnerMessagingLog);

  const [rangeId, setRangeId] = useState<(typeof RANGES)[number]["id"]>("7d");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]["id"]>("all");
  const [status, setStatus] = useState<string>("all");
  const [eventId, setEventId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<MessagingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const days = RANGES.find((r) => r.id === rangeId)!.days;
    try {
      setData(
        await fetchLog({
          data: {
            since: new Date(Date.now() - days * 864e5).toISOString(),
            until: new Date().toISOString(),
            channel,
            status,
            eventId: eventId || undefined,
            search: search.trim() || undefined,
          },
        }),
      );
    } catch (e) {
      setErr(toUserMessage(e, "Failed to load messaging log"));
    } finally {
      setLoading(false);
    }
  }, [rangeId, channel, status, eventId, search, fetchLog]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-serif text-xl text-ink">Messaging log</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every guest email and text across all events, with delivery status. Contains recipient
          addresses and error details — owners only.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button key={r.id} onClick={() => setRangeId(r.id)} className={pill(rangeId === r.id)}>
            {r.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-ink/10" />
        {CHANNELS.map((c) => (
          <button key={c.id} onClick={() => setChannel(c.id)} className={pill(channel === c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-full bg-secondary px-3 py-1.5 text-xs ring-1 ring-ink/10"
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s}
            </option>
          ))}
        </select>
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="max-w-[16rem] rounded-full bg-secondary px-3 py-1.5 text-xs ring-1 ring-ink/10"
          aria-label="Filter by event"
        >
          <option value="">All events</option>
          {(data?.events ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipient, type, event"
          className="min-w-[14rem] flex-1 rounded-full bg-secondary px-3 py-1.5 text-xs ring-1 ring-ink/10"
          aria-label="Search messaging log"
        />
        <button onClick={() => void load()} className={pill(false)}>
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-secondary px-3 py-1 text-ink/70">{total} messages</span>
        {Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([s, n]) => (
            <span key={s} className={`rounded-full px-3 py-1 ring-1 ${badgeClass(s)}`}>
              {s} · {n}
            </span>
          ))}
      </div>

      {err && (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{err}</p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading messaging log…</p>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No messages in this window.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-ink/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-secondary/60 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 font-medium">Recipient</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data!.rows.map((r) => (
                <tr key={`${r.channel}-${r.id}`} className="border-t border-ink/5 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                    {formatTimestamp((r.createdAt))}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.channel === "sms" ? "Text" : "Email"}</td>
                  <td className="px-3 py-2 break-anywhere">{r.recipient}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground break-anywhere">
                    {r.eventTitle ?? (r.eventId ? r.eventId : "—")}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.kind}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${badgeClass(r.status)}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground break-anywhere">
                    {r.error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data?.truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the most recent {data.rows.length}. Narrow the range or filters to see more.
        </p>
      )}
    </div>
  );
}
