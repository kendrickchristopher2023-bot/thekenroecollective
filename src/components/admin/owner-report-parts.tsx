// Owner Report, presentational building blocks.
// Read only. No data fetching lives here.
import { useRef } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatStampDate, formatTimestamp } from "@/lib/datetime";

/** mm/dd/yyyy, US format, from an ISO instant. */
export function usDate(iso: string): string {
  return formatStampDate((iso));
}

export function usDateTime(iso: string): string {
  return formatTimestamp((iso));
}

export function money(cents: number): string {
  const dollars = (Number.isFinite(cents) ? cents : 0) / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function pctChange(
  current: number,
  previous: number,
): { text: string; dir: "up" | "down" | "flat" } {
  if (previous === 0 && current === 0) return { text: "0.0% (no change)", dir: "flat" };
  if (previous === 0) return { text: "New this period", dir: "up" };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const dir = pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat";
  const arrow = dir === "up" ? "Up" : dir === "down" ? "Down" : "Flat";
  return { text: `${arrow} ${Math.abs(pct).toFixed(1)}%`, dir };
}

export function ChangePill({ current, previous }: { current: number; previous: number }) {
  const { text, dir } = pctChange(current, previous);
  const tone =
    dir === "up"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20"
      : dir === "down"
        ? "bg-rose-50 text-rose-800 ring-rose-600/20"
        : "bg-secondary text-muted-foreground ring-ink/10";
  const glyph = dir === "up" ? "▲" : dir === "down" ? "▼" : "■";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-medium ring-1 ${tone}`}
    >
      <span aria-hidden="true">{glyph}</span>
      {text}
    </span>
  );
}

/** Which daily series, if any, backs a metric. */
export type SeriesKind = "revenue" | "orders" | "email" | "sms" | null;

export type MetricMeta = { note: string; series: SeriesKind; money?: boolean; seriesNote?: string };

/** Plain-language notes for every KPI card, in the report's own voice. */
export const METRIC_META: Record<string, MetricMeta> = {
  "Gross revenue": {
    note: "Total customer payments before Stripe's processing fees, for the period you picked.",
    series: "revenue",
    money: true,
    seriesNote: "This chart shows total revenue per day. Fees and net are not split out daily.",
  },
  "Processing fees": {
    note: "What Stripe kept for handling the payments in this period.",
    series: "revenue",
    money: true,
    seriesNote: "This chart shows total revenue per day. Fees and net are not split out daily.",
  },
  "Net revenue": {
    note: "Gross revenue minus processing fees, and minus refunds when you are viewing all ventures.",
    series: "revenue",
    money: true,
    seriesNote: "This chart shows total revenue per day. Fees and net are not split out daily.",
  },
  Refunds: {
    note: "Money returned to customers. Recorded app-wide, so it only shows under All ventures.",
    series: null,
    money: true,
  },
  Payments: {
    note: "The number of successful customer payments in this period.",
    series: "orders",
  },
  "eCards created": {
    note: "Group eCards started in this period, paid or not.",
    series: null,
  },
  "eCards sent": {
    note: "Group eCards that were paid for and sent. The hint shows how many were created in the same period.",
    series: null,
  },
  "Messages collected": {
    note: "Messages people signed onto group eCards in this period.",
    series: null,
  },
  "Events created": {
    note: "Events started in this period. The hint counts guests marked as attending on those events.",
    series: null,
  },
  "RSVPs yes": {
    note: "Guests who said yes in this period. We do not record how many people were invited, so this is a count, not a rate.",
    series: null,
  },
  "Projects created": {
    note: "Projects started in this period, with tasks created alongside them.",
    series: null,
  },
  "Tasks created": { note: "Tasks added to projects in this period.", series: null },
  "Emails sent": {
    note: "Emails the app delivered successfully. The hint counts the ones that bounced.",
    series: "email",
    seriesNote: "This chart shows emails sent per day.",
  },
  "Emails bounced": {
    note: "Emails that could not be delivered.",
    series: "email",
    seriesNote: "This chart shows emails sent per day, not bounces.",
  },
  "Texts sent": {
    note: "Text messages delivered for Events and Gatherings. The hint counts the ones that failed.",
    series: "sms",
    seriesNote: "This chart shows texts sent per day.",
  },
  "Texts failed": {
    note: "Text messages that could not be delivered.",
    series: "sms",
    seriesNote: "This chart shows texts sent per day, not failures.",
  },
  "Errors logged": {
    note: "Problems the app recorded while people were using it.",
    series: null,
  },
  "Support messages": {
    note: "Messages people sent through support. Recorded app-wide, so it only shows under All ventures.",
    series: null,
  },
  "Users total": {
    note: "Everyone with an Application Kit account. A snapshot of today, not the period.",
    series: null,
  },
  "New users": { note: "People who signed up during the period you picked.", series: null },
  "Active users": { note: "People who used the app during the period you picked.", series: null },
  "Free plan": { note: "A snapshot of today, not the period.", series: null },
  "Pro plan": { note: "A snapshot of today, not the period.", series: null },
  "Founder plan": { note: "A snapshot of today, not the period.", series: null },
  "Resumes created": { note: "Resumes people built during the period.", series: null },
  "Tailor sessions": {
    note: "Times someone tailored a resume to a specific job during the period.",
    series: null,
  },
  "Applications logged": {
    note: "Counted by the date the user marked them applied.",
    series: null,
  },
  "Matches saved": { note: "Job matches people saved during the period.", series: null },
  "AI tailor runs": { note: "AI tailoring requests during the period.", series: null },
  "AI cover letters": { note: "Cover letters the AI drafted during the period.", series: null },
  "AI interview prep": {
    note: "Interview prep sessions run with AI during the period.",
    series: null,
  },
  "AI LinkedIn help": { note: "LinkedIn profile help requests during the period.", series: null },
  "AI referral messages": {
    note: "Referral messages the AI drafted during the period.",
    series: null,
  },
  "Resumes parsed": { note: "Uploaded resumes the AI read during the period.", series: null },
  "AI chat replies": { note: "Assistant replies given during the period.", series: null },
};

export const RESUME_FEED_NOTE =
  "This figure comes from the Application Kit app's own metrics feed, which reports period totals only.";

export function metaFor(label: string): MetricMeta {
  return METRIC_META[label] ?? { note: "A count for the period you picked.", series: null };
}

export function Kpi({
  label,
  value,
  current,
  previous,
  hint,
  selected = false,
  onToggle,
  panelId,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
  hint?: string;
  selected?: boolean;
  onToggle?: (label: string) => void;
  panelId?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle?.(label)}
      aria-expanded={selected}
      aria-controls={selected && panelId ? panelId : undefined}
      className={`rounded-2xl bg-card p-5 text-left ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-velvet ${
        selected
          ? "ring-2 ring-velvet shadow-sm"
          : "ring-ink/5 hover:-translate-y-0.5 hover:shadow-sm hover:ring-velvet/40"
      }`}
    >
      <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-serif text-3xl text-ink">{value}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ChangePill current={current} previous={previous} />
        <span className="text-sm text-muted-foreground">vs prior period</span>
      </div>
      {hint && <p className="mt-2 text-sm text-muted-foreground">{hint}</p>}
      <span className="mt-3 block text-sm font-medium text-velvet">
        {selected ? "Hide details" : "See details"}
      </span>
    </button>
  );
}

/** A headline figure for the Overview strip. Not clickable, always visible. */
export function HeadlineStat({
  label,
  value,
  current,
  previous,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
      <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-serif text-4xl text-ink">{value}</div>
      <div className="mt-3">
        <ChangePill current={current} previous={previous} />
      </div>
    </div>
  );
}

/** A derived ratio or average. Value may be "n/a" when the denominator is zero. */
export function RatioCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl bg-secondary/40 p-5 ring-1 ring-ink/5">
      <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-serif text-3xl text-ink">{value}</div>
      <p className="mt-2 text-sm text-muted-foreground">{note}</p>
    </div>
  );
}

/** Read-only drill-down for one KPI, shown under the grid the card lives in. */
export function MetricDetail({
  id,
  label,
  current,
  previous,
  extraNote,
  revenueSeries,
  messagingSeries,
  onClose,
}: {
  id: string;
  label: string;
  current: number;
  previous: number;
  extraNote?: string;
  revenueSeries: Array<{ day: string; revenue: number; orders: number }>;
  messagingSeries: Array<{ day: string; email: number; sms: number }>;
  onClose: () => void;
}) {
  const meta = metaFor(label);
  const fmt = (n: number) => (meta.money ? money(n) : n.toLocaleString("en-US"));

  let chart: React.ReactNode = null;
  if (meta.series === "revenue" && revenueSeries.length) {
    chart = (
      <ResponsiveContainer>
        <LineChart data={revenueSeries}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v: number | string) => `$${Number(v).toFixed(2)}`} />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#5C3C28"
            strokeWidth={2}
            dot={false}
            name="Revenue (USD)"
          />
        </LineChart>
      </ResponsiveContainer>
    );
  } else if (meta.series === "orders" && revenueSeries.length) {
    chart = (
      <ResponsiveContainer>
        <BarChart data={revenueSeries}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="orders" fill="#A9743F" name="Payments" />
        </BarChart>
      </ResponsiveContainer>
    );
  } else if ((meta.series === "email" || meta.series === "sms") && messagingSeries.length) {
    const isSms = meta.series === "sms";
    chart = (
      <ResponsiveContainer>
        <LineChart data={messagingSeries}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey={isSms ? "sms" : "email"}
            stroke={isSms ? "#7A5C8A" : "#3F6B52"}
            strokeWidth={2}
            dot={false}
            name={isSms ? "Texts sent" : "Emails sent"}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <section
      id={id}
      role="region"
      aria-label={`${label} details`}
      tabIndex={-1}
      className="mt-4 rounded-2xl bg-card p-5 ring-1 ring-velvet/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-serif text-2xl text-ink">{label}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-secondary px-4 py-2 text-base font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary/80"
        >
          Close
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-6">
        <div>
          <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            This period
          </div>
          <div className="font-serif text-4xl text-ink">{fmt(current)}</div>
        </div>
        <div>
          <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Prior period
          </div>
          <div className="font-serif text-2xl text-muted-foreground">{fmt(previous)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChangePill current={current} previous={previous} />
          <span className="text-base text-muted-foreground">vs prior period</span>
        </div>
      </div>

      <p className="mt-4 text-lg text-ink/80">{meta.note}</p>
      {extraNote && <p className="mt-2 text-base text-muted-foreground">{extraNote}</p>}

      {chart ? (
        <>
          <div className="mt-5 h-64">{chart}</div>
          {meta.seriesNote && (
            <p className="mt-2 text-base text-muted-foreground">{meta.seriesNote}</p>
          )}
        </>
      ) : (
        <p className="mt-4 text-base text-muted-foreground">
          Day-by-day history isn't tracked for this metric yet.
        </p>
      )}
    </section>
  );
}

/** Accessible tablist that collapses into a select on small screens. */
export function SectionTabs<T extends string>({
  tabs,
  active,
  onChange,
  idPrefix,
}: {
  tabs: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  idPrefix: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End")
      return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === active);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${CSS.escape(target.id)}`)
        ?.focus();
    });
  };

  return (
    <>
      <div className="sm:hidden">
        <label className="sr-only" htmlFor={`${idPrefix}-tab-select`}>
          Report section
        </label>
        <select
          id={`${idPrefix}-tab-select`}
          value={active}
          onChange={(e) => onChange(e.target.value as T)}
          className="w-full rounded-xl border border-ink/15 bg-paper px-3 py-3 text-base"
        >
          {tabs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div
        ref={listRef}
        role="tablist"
        aria-label="Report sections"
        onKeyDown={onKeyDown}
        className="hidden flex-wrap gap-1 rounded-full bg-secondary/60 p-1 ring-1 ring-ink/5 sm:flex"
      >
        {tabs.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              id={`${idPrefix}-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`rounded-full px-4 py-2 text-base font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-velvet ${
                selected ? "bg-velvet text-white" : "text-ink hover:bg-secondary"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function SkelBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink/[0.07] ${className ?? ""}`} />;
}

/** Card and chart shaped placeholders while the report loads. */
export function ReportSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading the report">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
            <SkelBar className="h-3 w-24" />
            <SkelBar className="mt-4 h-9 w-32" />
            <SkelBar className="mt-4 h-6 w-28 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
            <SkelBar className="h-4 w-40" />
            <SkelBar className="mt-4 h-64 w-full" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading the report</span>
    </div>
  );
}
