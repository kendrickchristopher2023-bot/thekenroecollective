import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useUrlViewState, useUrlParam, useSetUrlParams } from "@/lib/use-url-view-state";
import { useServerFn } from "@tanstack/react-start";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Legend,
} from "recharts";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { getOwnerAnalytics, getOwnerContactsAnalytics } from "@/lib/owner-analytics.functions";
import { OwnerMfaGate } from "@/components/owner-mfa-gate";
import { formatTimestamp } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/owner-analytics")({
  head: () => ({ meta: [{ title: "Owner analytics — The Kenroe Collective" }] }),
  component: () => (
    <OwnerMfaGate>
      <OwnerAnalyticsPage />
    </OwnerMfaGate>
  ),
});

type Range = "7d" | "30d" | "90d" | "1y";

type Snapshot = {
  signups_by_day: Array<{ day: string; count: number }>;
  signups_total: number;
  active_subs_by_tier: Record<string, number>;
  trial_active: number;
  events_by_day: Array<{ day: string; count: number }>;
  events_total: number;
  events_archived: number;
  trial_attempts: { allowed: number; blocked: number };
  referrals: { codes: number; redemptions: number };
  top_discounts: Array<{ code: string; used_count: number; percent_off: number | null; tier_id: string | null }>;
  recent_signups: Array<{ id: string; email: string; created_at: string }>;
  top_referrers: Array<{ referrer_user_id: string; redemptions: number }>;
};

type CrmSnapshot = {
  contacts_total: number;
  contacts_new: number;
  contacts_opted_out: number;
  contacts_by_source: Record<string, number>;
  contacts_by_day?: Array<{ day: string; count: number }>;
  rsvp_conversion_by_source?: Array<{ source: string; total: number; with_rsvp: number }>;
  top_tags: Array<{ tag: string; cnt: number }>;
  top_owners: Array<{ owner_user_id: string; contacts: number }>;
  broadcasts_sent?: number;
  broadcast_recipients?: number;
  event_links: number;
};


function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Start of the given local day, and the exclusive end of it. */
function dayStart(value: string): string {
  return new Date(`${value}T00:00:00`).toISOString();
}
function dayEnd(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function OwnerAnalyticsPage() {
  const fetchAnalytics = useServerFn(getOwnerAnalytics);
  const fetchCrm = useServerFn(getOwnerContactsAnalytics);
  const setUrl = useSetUrlParams();
  const urlRange = useUrlParam("range", ["7d", "30d", "90d", "365d", "custom"]);
  const urlFrom = useUrlParam("from");
  const urlTo = useUrlParam("to");
  const [range, setRangeState] = useState<Range | "custom">((urlRange as Range | "custom") ?? "30d");
  const [fromDate, setFromDate] = useState(
    () => urlFrom ?? toDateInput(new Date(Date.now() - 29 * 864e5)),
  );
  const [toDate, setToDate] = useState(() => urlTo ?? toDateInput(new Date()));

  function setRange(next: Range | "custom") {
    setRangeState(next);
    setUrl({ range: next === "30d" ? undefined : next });
  }

  // Mirror the resolved window into the URL for refresh restore.
  useEffect(() => {
    setUrl({ from: fromDate, to: toDate });
  }, [fromDate, toDate, setUrl]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [crm, setCrm] = useState<CrmSnapshot | null>(null);
  // Tab and date range live in the URL so a refresh keeps the same view.
  const [tab, setTab] = useUrlViewState<"overview" | "crm">("tab", "overview", ["overview", "crm"]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function applyPreset(r: Range) {
    const days = r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : 365;
    setFromDate(toDateInput(new Date(Date.now() - (days - 1) * 864e5)));
    setToDate(toDateInput(new Date()));
    setRange(r);
  }

  useEffect(() => {
    setLoading(true);
    setErr(null);
    const payload = { since: dayStart(fromDate), until: dayEnd(toDate) };
    Promise.all([
      fetchAnalytics({ data: payload }).then((r) => setSnap(r.snapshot as Snapshot)),
      fetchCrm({ data: payload })
        .then((r) => setCrm(r.snapshot as CrmSnapshot))
        .catch(() => setCrm(null)),
    ])
      .catch((e) => setErr(toUserMessage(e, "Failed to load")))
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);


  if (err) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="font-serif text-2xl">Owner access only</h1>
          <p className="mt-2 text-xs text-muted-foreground">{err}</p>
          <Link to="/gatherings" className="mt-6 inline-block text-xs text-velvet hover:underline">Home</Link>
        </div>
      </div>
    );
  }

  // Merge signups + events into single time series
  const timeSeries = (() => {
    if (!snap) return [];
    const map = new Map<string, { day: string; signups: number; events: number }>();
    for (const r of snap.signups_by_day || []) {
      map.set(r.day, { day: r.day, signups: r.count, events: 0 });
    }
    for (const r of snap.events_by_day || []) {
      const ex = map.get(r.day);
      if (ex) ex.events = r.count;
      else map.set(r.day, { day: r.day, signups: 0, events: r.count });
    }
    return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
  })();

  const tierData = snap
    ? Object.entries(snap.active_subs_by_tier || {}).map(([tier, count]) => ({ tier, count }))
    : [];

  const totalActive = tierData.reduce((s, r) => s + Number(r.count), 0);

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-velvet/15 via-sky-500/10 to-emerald-500/10 p-6 ring-1 ring-ink/5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-serif text-4xl">Analytics</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Signups, subscriptions, events, and referrals — live data for the window you choose.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-full bg-paper/80 p-1 ring-1 ring-ink/10">
                {(["7d", "30d", "90d", "1y"] as Range[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => applyPreset(r)}
                    className={`rounded-full px-3 py-1 text-xs ${range === r ? "bg-velvet text-paper shadow-sm" : "text-muted-foreground hover:text-ink"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 rounded-full bg-paper/80 px-3 py-1.5 ring-1 ring-ink/10">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground" htmlFor="range-from">
                  From
                </label>
                <input
                  id="range-from"
                  type="date"
                  value={fromDate}
                  max={toDate}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setRange("custom");
                  }}
                  className="bg-transparent text-xs outline-none"
                />
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground" htmlFor="range-to">
                  To
                </label>
                <input
                  id="range-to"
                  type="date"
                  value={toDate}
                  min={fromDate}
                  max={toDateInput(new Date())}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setRange("custom");
                  }}
                  className="bg-transparent text-xs outline-none"
                />
              </div>
            </div>
          </div>
        </header>

        <div className="inline-flex rounded-full bg-secondary p-1 ring-1 ring-ink/10">
          {(["overview", "crm"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1 text-xs font-medium capitalize ${tab === t ? "bg-paper shadow-sm" : "text-muted-foreground"}`}
            >
              {t === "crm" ? "CRM" : t}
            </button>
          ))}
        </div>

        {loading || !snap ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading analytics…</div>
        ) : tab === "overview" ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Signups" value={snap.signups_total} tone="violet" />
              <Kpi label="Active subs" value={totalActive} tone="emerald" />
              <Kpi label="Trials active" value={snap.trial_active} tone="amber" />
              <Kpi
                label="Events (period)"
                value={(snap.events_by_day || []).reduce((s, r) => s + r.count, 0)}
                tone="sky"
              />
            </div>


            <section className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
              <h2 className="font-serif text-xl">Signups & events over time</h2>
              <div className="h-72 mt-3">
                <ResponsiveContainer>
                  <LineChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="signups" stroke="#7c3aed" strokeWidth={2} />
                    <Line type="monotone" dataKey="events" stroke="#0ea5e9" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
                <h2 className="font-serif text-xl">Active subs by tier</h2>
                <div className="h-64 mt-3">
                  <ResponsiveContainer>
                    <BarChart data={tierData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="tier" fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#7c3aed" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <section className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
                <h2 className="font-serif text-xl">Referrals & trials</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <Stat label="Referral codes" value={snap.referrals.codes} />
                  <Stat label="Referral redemptions" value={snap.referrals.redemptions} />
                  <Stat label="Trials allowed" value={snap.trial_attempts.allowed} />
                  <Stat label="Trials blocked" value={snap.trial_attempts.blocked} />
                  <Stat label="Total events" value={snap.events_total} />
                  <Stat label="Archived events" value={snap.events_archived} />
                </dl>
              </section>
            </div>

            <section className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
              <h2 className="font-serif text-xl">Top discount codes</h2>
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="py-1">Code</th><th>Uses</th><th>%</th><th>Tier</th></tr>
                </thead>
                <tbody>
                  {snap.top_discounts.map((d) => (
                    <tr key={d.code} className="border-t border-ink/5">
                      <td className="py-2 font-mono">{d.code}</td>
                      <td>{d.used_count}</td>
                      <td>{d.percent_off ?? "—"}</td>
                      <td className="text-muted-foreground">{d.tier_id ?? "any"}</td>
                    </tr>
                  ))}
                  {snap.top_discounts.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted-foreground text-xs">No discount codes yet</td></tr>}
                </tbody>
              </table>
            </section>

            <section className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
              <h2 className="font-serif text-xl">Recent signups</h2>
              <ul className="mt-3 space-y-1 text-sm">
                {snap.recent_signups.map((u) => (
                  <li key={u.id} className="flex justify-between border-t border-ink/5 py-2 first:border-0">
                    <span>{u.email}</span>
                    <span className="text-xs text-muted-foreground">{formatTimestamp((u.created_at))}</span>
                  </li>
                ))}
                {snap.recent_signups.length === 0 && <li className="text-xs text-muted-foreground">None yet.</li>}
              </ul>
            </section>
          </>
        ) : (
          <>
            {!crm ? (
              <div className="p-12 text-center text-sm text-muted-foreground">No CRM data.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  <Kpi label="Contacts total" value={crm.contacts_total} />
                  <Kpi label="New (period)" value={crm.contacts_new} />
                  <Kpi label="Opted out" value={crm.contacts_opted_out} />
                  <Kpi label="Event links" value={crm.event_links} />
                  <Kpi label="Broadcasts" value={crm.broadcasts_sent ?? 0} />
                  <Kpi label="Emailed" value={crm.broadcast_recipients ?? 0} />
                </div>

                {(crm.contacts_by_day || []).length > 0 && (
                  <section className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
                    <h2 className="font-serif text-xl">Contacts growth (last 90 days)</h2>
                    <div className="mt-3 h-64">
                      <ResponsiveContainer>
                        <LineChart data={crm.contacts_by_day}>
                          <CartesianGrid stroke="rgba(0,0,0,0.05)" />
                          <XAxis dataKey="day" fontSize={10} />
                          <YAxis fontSize={10} />
                          <Tooltip />
                          <Line dataKey="count" stroke="#4b1e2b" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}

                {(crm.rsvp_conversion_by_source || []).length > 0 && (
                  <section className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
                    <h2 className="font-serif text-xl">RSVP conversion by source</h2>
                    <div className="mt-3 h-64">
                      <ResponsiveContainer>
                        <BarChart data={crm.rsvp_conversion_by_source}>
                          <CartesianGrid stroke="rgba(0,0,0,0.05)" />
                          <XAxis dataKey="source" fontSize={10} />
                          <YAxis fontSize={10} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="total" fill="#c7b3a8" name="Total contacts" />
                          <Bar dataKey="with_rsvp" fill="#4b1e2b" name="With RSVP" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                )}



                <div className="grid gap-4 md:grid-cols-2">
                  <section className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
                    <h2 className="font-serif text-xl">Contacts by source</h2>
                    <ul className="mt-3 space-y-1 text-sm">
                      {Object.entries(crm.contacts_by_source || {}).map(([source, cnt]) => (
                        <li key={source} className="flex justify-between border-t border-ink/5 py-2 first:border-0">
                          <span className="capitalize">{source}</span>
                          <span className="text-muted-foreground">{cnt}</span>
                        </li>
                      ))}
                      {Object.keys(crm.contacts_by_source || {}).length === 0 && (
                        <li className="text-xs text-muted-foreground">No contacts yet.</li>
                      )}
                    </ul>
                  </section>

                  <section className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
                    <h2 className="font-serif text-xl">Top tags</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(crm.top_tags || []).map((t) => (
                        <span key={t.tag} className="rounded-full bg-secondary px-3 py-1 text-xs">
                          #{t.tag} <span className="text-muted-foreground">· {t.cnt}</span>
                        </span>
                      ))}
                      {(crm.top_tags || []).length === 0 && (
                        <span className="text-xs text-muted-foreground">No tags yet.</span>
                      )}
                    </div>
                  </section>
                </div>

                <section className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
                  <h2 className="font-serif text-xl">Top hosts by CRM size</h2>
                  <table className="mt-3 w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <tr><th className="py-1">Host user</th><th>Contacts</th></tr>
                    </thead>
                    <tbody>
                      {(crm.top_owners || []).map((r) => (
                        <tr key={r.owner_user_id} className="border-t border-ink/5">
                          <td className="py-2 font-mono text-xs">{r.owner_user_id}</td>
                          <td>{r.contacts}</td>
                        </tr>
                      ))}
                      {(crm.top_owners || []).length === 0 && (
                        <tr><td colSpan={2} className="py-4 text-center text-xs text-muted-foreground">No hosts with contacts yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </section>
              </>
            )}
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}

const KPI_TONES: Record<string, string> = {
  violet: "from-velvet/20 to-velvet/5 text-velvet",
  emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-700",
  amber: "from-amber-500/20 to-amber-500/5 text-amber-700",
  sky: "from-sky-500/20 to-sky-500/5 text-sky-700",
};

function Kpi({ label, value, tone = "violet" }: { label: string; value: number; tone?: string }) {
  const toneClass = KPI_TONES[tone] ?? KPI_TONES["violet"]!;
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-serif text-3xl">{value}</div>
      <div className={`mt-3 h-1.5 rounded-full bg-gradient-to-r ${toneClass}`} />
    </div>
  );
}


function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-serif text-xl">{value}</div>
    </div>
  );
}
