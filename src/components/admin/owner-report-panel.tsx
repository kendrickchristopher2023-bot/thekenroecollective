// Owner Command Center: tabbed, read-only analytics and export.
// Owner access is enforced by the server function, not by hiding UI.
// Everything on this page is computed from data already returned by the report
// server function. Nothing here writes or fetches anything new.
import { toUserMessage } from "@/lib/user-error";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import {
  checkOwnerReportAccess,
  getOwnerReport,
  type OwnerReport,
} from "@/lib/owner-report.functions";
import {
  exportReportDocx,
  exportReportPdf,
  type ExportPayload,
  type ExportTable,
} from "@/lib/owner-report-export";
import { OwnerAiPanel, type AiSnapshot } from "@/components/admin/owner-ai-panel";
import { OwnerIssuesPanel } from "@/components/admin/owner-issues-panel";
import { OwnerFeedbackPanel } from "@/components/admin/owner-feedback-panel";
import {
  OWNER_VENTURES,
  isVentureConnected,
  ventureLabel,
  ventureShows,
  type VentureId,
} from "@/lib/owner-ventures";
import {
  ChangePill,
  HeadlineStat,
  Kpi,
  MetricDetail,
  RatioCard,
  RESUME_FEED_NOTE,
  ReportSkeleton,
  SectionTabs,
  money,
  pctChange,
  usDate,
  usDateTime,
} from "@/components/admin/owner-report-parts";

type PresetId = "dod" | "wow" | "mom" | "qoq" | "yoy" | "custom";

const PRESETS: Array<{ id: PresetId; label: string; short: string }> = [
  { id: "dod", label: "Day over day", short: "DoD" },
  { id: "wow", label: "Week over week", short: "WoW" },
  { id: "mom", label: "Month over month", short: "MoM" },
  { id: "qoq", label: "Quarter over quarter", short: "QoQ" },
  { id: "yoy", label: "Year over year", short: "YoY" },
  { id: "custom", label: "Custom range", short: "Custom" },
];

const VENTURE_COLORS = ["#5C3C28", "#A9743F", "#3F6B52", "#7A5C8A", "#8A5C5C", "#6B7280"];

type TabId = "overview" | "revenue" | "product" | "messaging" | "resume" | "insights";

const STORAGE_KEY = "kenroe.owner-report.view";

/** localStorage is best effort. A blocked or full store must never break the page. */
function readSavedView(): { venture?: VentureId; preset?: PresetId; tab?: TabId } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveView(view: { venture: VentureId; preset: PresetId; tab: TabId }) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
  } catch {
    /* storage unavailable, the page still works */
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

type Window = { since: Date; until: Date; prevSince: Date; prevUntil: Date; label: string };

/** Current and prior comparable window for a preset. Local dates, inclusive of today. */
function windowFor(preset: PresetId, customStart: string, customEnd: string): Window {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const shift = (d: Date, days: number) => {
    const n = new Date(d);
    n.setDate(n.getDate() + days);
    return n;
  };
  const shiftMonths = (d: Date, months: number) => {
    const n = new Date(d);
    n.setMonth(n.getMonth() + months);
    return n;
  };

  if (preset === "dod") {
    return {
      since: today,
      until: tomorrow,
      prevSince: shift(today, -1),
      prevUntil: today,
      label: "Today vs yesterday",
    };
  }
  if (preset === "wow") {
    const since = shift(tomorrow, -7);
    return {
      since,
      until: tomorrow,
      prevSince: shift(since, -7),
      prevUntil: since,
      label: "Last 7 days vs the 7 days before",
    };
  }
  if (preset === "mom") {
    const since = shiftMonths(tomorrow, -1);
    return {
      since,
      until: tomorrow,
      prevSince: shiftMonths(since, -1),
      prevUntil: since,
      label: "Last month vs the month before",
    };
  }
  if (preset === "qoq") {
    const since = shiftMonths(tomorrow, -3);
    return {
      since,
      until: tomorrow,
      prevSince: shiftMonths(since, -3),
      prevUntil: since,
      label: "Last quarter vs the quarter before",
    };
  }
  if (preset === "yoy") {
    const since = shiftMonths(tomorrow, -12);
    return {
      since,
      until: tomorrow,
      prevSince: shiftMonths(since, -12),
      prevUntil: since,
      label: "Last 12 months vs the 12 months before",
    };
  }

  const s = customStart ? new Date(`${customStart}T00:00:00`) : shift(tomorrow, -30);
  const e = customEnd ? new Date(`${customEnd}T00:00:00`) : today;
  const until = shift(startOfDay(e), 1);
  const since = startOfDay(s);
  const lengthDays = Math.max(1, Math.round((until.getTime() - since.getTime()) / 86400000));
  return {
    since,
    until,
    prevSince: shift(since, -lengthDays),
    prevUntil: since,
    label: "Custom range vs the same length before it",
  };
}

/** Divide-by-zero safe rate, shown as a percentage. */
function rate(numerator: number, denominator: number): string {
  if (!denominator) return "n/a";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

/** Divide-by-zero safe average payment, in dollars. */
function avgMoney(totalCents: number, count: number): string {
  if (!count) return "n/a";
  return money(Math.round(totalCents / count));
}

export function OwnerReportPanel() {
  const checkAccess = useServerFn(checkOwnerReportAccess);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    checkAccess()
      .then((r) => setAllowed(r.allowed))
      .catch(() => setAllowed(false));
  }, []);

  if (allowed === null) {
    return <p className="text-sm text-muted-foreground">Checking access…</p>;
  }
  if (!allowed) {
    return (
      <div className="rounded-2xl bg-secondary p-6 ring-1 ring-ink/10">
        <h2 className="font-serif text-2xl">Report access restricted</h2>
        <p className="mt-2 text-base text-muted-foreground">
          The Owner Report is limited to specific owner accounts with two-factor authentication
          turned on. If you believe you should have access, contact Christopher.
        </p>
      </div>
    );
  }

  return <OwnerReportContent />;
}

function OwnerReportContent() {
  const fetchReport = useServerFn(getOwnerReport);
  const [preset, setPreset] = useState<PresetId>("mom");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [environment, setEnvironment] = useState<"live" | "sandbox">("live");
  const [venture, setVenture] = useState<VentureId>("all");
  const [tab, setTab] = useState<TabId>("overview");
  const [restored, setRestored] = useState(false);
  const [report, setReport] = useState<OwnerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const connected = isVentureConnected(venture);
  const show = (group: Parameters<typeof ventureShows>[1]) => ventureShows(venture, group);

  // Restore the last view once, then keep it in step with any change.
  useEffect(() => {
    const saved = readSavedView();
    if (saved.venture && OWNER_VENTURES.some((v) => v.id === saved.venture))
      setVenture(saved.venture);
    if (saved.preset && PRESETS.some((p) => p.id === saved.preset)) setPreset(saved.preset);
    if (saved.tab) setTab(saved.tab);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    saveView({ venture, preset, tab });
  }, [restored, venture, preset, tab]);

  const win = useMemo(
    () => windowFor(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const load = useCallback(async () => {
    // A venture with no data feed is never queried, so nothing is invented.
    if (!isVentureConnected(venture)) {
      setReport(null);
      setErr(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchReport({
        data: {
          since: win.since.toISOString(),
          until: win.until.toISOString(),
          prevSince: win.prevSince.toISOString(),
          prevUntil: win.prevUntil.toISOString(),
          environment,
          venture,
        },
      });
      setReport(res);
    } catch (e: unknown) {
      setErr(toUserMessage(e, "Could not load the report."));
    } finally {
      setLoading(false);
    }
  }, [fetchReport, win, environment, venture]);

  useEffect(() => {
    void load();
  }, [load]);

  const cur = report?.current;
  const prev = report?.previous;

  // Drill-down: one open metric at a time, presentation only.
  const [openMetric, setOpenMetric] = useState<{
    label: string;
    current: number;
    previous: number;
    grid: string;
  } | null>(null);
  const toggleMetric = useCallback(
    (grid: string, label: string, current: number, previous: number) =>
      setOpenMetric((p) =>
        p?.label === label && p.grid === grid ? null : { label, current, previous, grid },
      ),
    [],
  );
  useEffect(() => {
    if (!openMetric) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMetric(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMetric]);
  // Close when the period, venture or section changes, since the context changes.
  useEffect(() => {
    setOpenMetric(null);
  }, [venture, preset, environment, report, tab]);

  const gridKpi = (grid: string, label: string, current: number, previous: number) => ({
    selected: openMetric?.grid === grid && openMetric.label === label,
    onToggle: () => toggleMetric(grid, label, current, previous),
    panelId: `owner-metric-detail-${grid}`,
  });

  const revenueSeries = useMemo(() => {
    if (!cur) return [];
    return cur.revenueByDay.map((b, i) => ({
      day: usDate(`${b.day}T12:00:00Z`),
      revenue: b.value / 100,
      orders: cur.ordersByDay[i]?.value ?? 0,
    }));
  }, [cur]);

  const messagingSeries = useMemo(() => {
    if (!cur) return [];
    return cur.emailByDay.map((b, i) => ({
      day: usDate(`${b.day}T12:00:00Z`),
      email: b.value,
      sms: cur.smsByDay[i]?.value ?? 0,
    }));
  }, [cur]);

  const ventureSeries = useMemo(
    () =>
      (cur?.byVenture ?? []).map((v) => ({
        name: v.venture,
        value: Math.max(0, v.grossCents / 100),
        orders: v.orders,
      })),
    [cur],
  );

  // Application Kit figures, straight from that app's own metrics feed.
  const resumeRows = useMemo(() => {
    const c = cur?.resume;
    if (!c) return [];
    const p = prev?.resume;
    const row = (label: string, cv: number, pv: number) => ({ label, current: cv, previous: pv });
    return [
      row("Users total", c.users.total, p?.users.total ?? 0),
      row("New users", c.users.newInWindow, p?.users.newInWindow ?? 0),
      row("Active users", c.users.activeInWindow, p?.users.activeInWindow ?? 0),
      row("Free plan", c.plans.free, p?.plans.free ?? 0),
      row("Pro plan", c.plans.pro, p?.plans.pro ?? 0),
      row("Founder plan", c.plans.founder, p?.plans.founder ?? 0),
      row("Resumes created", c.product.resumesCreated, p?.product.resumesCreated ?? 0),
      row("Tailor sessions", c.product.tailorSessions, p?.product.tailorSessions ?? 0),
      row("Applications logged", c.product.applicationsLogged, p?.product.applicationsLogged ?? 0),
      row("Matches saved", c.product.matchesSaved, p?.product.matchesSaved ?? 0),
      row("AI tailor runs", c.aiUsage.tailor, p?.aiUsage.tailor ?? 0),
      row("AI cover letters", c.aiUsage.coverLetter, p?.aiUsage.coverLetter ?? 0),
      row("AI interview prep", c.aiUsage.interviewPrep, p?.aiUsage.interviewPrep ?? 0),
      row("AI LinkedIn help", c.aiUsage.linkedin, p?.aiUsage.linkedin ?? 0),
      row("AI referral messages", c.aiUsage.referralDm, p?.aiUsage.referralDm ?? 0),
      row("Resumes parsed", c.aiUsage.parseResume, p?.aiUsage.parseResume ?? 0),
      row("AI chat replies", c.aiUsage.chat, p?.aiUsage.chat ?? 0),
    ];
  }, [cur, prev]);

  const resumeAiTotal = useMemo(() => {
    const a = cur?.resume?.aiUsage;
    if (!a) return 0;
    return (
      a.tailor +
      a.coverLetter +
      a.interviewPrep +
      a.linkedin +
      a.referralDm +
      a.parseResume +
      a.chat
    );
  }, [cur]);

  /** Derived figures, each one honest about what it divides by. */
  const derived = useMemo(() => {
    if (!cur) return [] as Array<{ label: string; value: string; note: string }>;
    const rows: Array<{ label: string; value: string; note: string }> = [];
    if (show("revenue")) {
      rows.push({
        label: "Average payment value",
        value: avgMoney(cur.grossCents, cur.orders),
        note: "Gross revenue divided by the number of payments. Shows n/a when there were no payments.",
      });
    }
    if (show("refunds")) {
      rows.push({
        label: "Refund rate",
        value: rate(cur.refundCents, cur.grossCents),
        note: "Refunds divided by gross revenue. Refunds are recorded app-wide, so this only appears under All ventures.",
      });
    }
    if (show("email")) {
      rows.push({
        label: "Email bounce rate",
        value: rate(cur.emailBounced, cur.emailSent),
        note: "Emails that bounced divided by emails sent.",
      });
    }
    if (show("sms")) {
      rows.push({
        label: "Text failure rate",
        value: rate(cur.smsFailed, cur.smsSent),
        note: "Texts that failed divided by texts sent. Texts are only used by Events and Gatherings.",
      });
    }
    if (show("ecards")) {
      rows.push({
        label: "eCard paid conversion",
        value: rate(cur.ecardsPaid, cur.ecardsCreated),
        note: "eCards sent divided by eCards created in the same period. Some cards are created in one period and paid in another.",
      });
    }
    if (show("events")) {
      rows.push({
        label: "RSVPs yes",
        value: cur.rsvpsYes.toLocaleString("en-US"),
        note: "We do not record how many people were invited, so this is a count, not a rate.",
      });
    }
    if (show("resumeFeed") && cur.resume?.available !== false) {
      rows.push({
        label: "Active rate",
        value: rate(cur.resume?.users.activeInWindow ?? 0, cur.resume?.users.total ?? 0),
        note: "Active users divided by all Application Kit accounts. Account totals are a snapshot of today.",
      });
      rows.push({
        label: "Total AI actions",
        value: resumeAiTotal.toLocaleString("en-US"),
        note: "The seven Application Kit usage counters added together for the period.",
      });
    }
    return rows;
  }, [cur, venture, resumeAiTotal]);

  /** The three or four headline numbers for the selected venture. */
  const headline = useMemo(() => {
    if (!cur || !prev) return [];
    const n = (v: number) => v.toLocaleString("en-US");
    if (venture === "resume") {
      const c = cur.resume;
      const p = prev.resume;
      if (!c || c.available === false) return [];
      return [
        {
          label: "Active users",
          value: n(c.users.activeInWindow),
          current: c.users.activeInWindow,
          previous: p?.users.activeInWindow ?? 0,
        },
        {
          label: "Resumes created",
          value: n(c.product.resumesCreated),
          current: c.product.resumesCreated,
          previous: p?.product.resumesCreated ?? 0,
        },
        {
          label: "Tailor sessions",
          value: n(c.product.tailorSessions),
          current: c.product.tailorSessions,
          previous: p?.product.tailorSessions ?? 0,
        },
        {
          label: "Applications logged",
          value: n(c.product.applicationsLogged),
          current: c.product.applicationsLogged,
          previous: p?.product.applicationsLogged ?? 0,
        },
      ];
    }
    const rows = [
      {
        label: "Gross revenue",
        value: money(cur.grossCents),
        current: cur.grossCents,
        previous: prev.grossCents,
      },
      {
        label: "Net revenue",
        value: money(cur.netCents),
        current: cur.netCents,
        previous: prev.netCents,
      },
      { label: "Payments", value: n(cur.orders), current: cur.orders, previous: prev.orders },
    ];
    if (venture === "ecards")
      rows.push({
        label: "eCards sent",
        value: n(cur.ecardsPaid),
        current: cur.ecardsPaid,
        previous: prev.ecardsPaid,
      });
    else if (venture === "events")
      rows.push({
        label: "Events created",
        value: n(cur.eventsCreated),
        current: cur.eventsCreated,
        previous: prev.eventsCreated,
      });
    else if (venture === "projects")
      rows.push({
        label: "Projects created",
        value: n(cur.projectsCreated),
        current: cur.projectsCreated,
        previous: prev.projectsCreated,
      });
    else
      rows.push({
        label: "eCards sent",
        value: n(cur.ecardsPaid),
        current: cur.ecardsPaid,
        previous: prev.ecardsPaid,
      });
    return rows;
  }, [cur, prev, venture]);

  const buildPayload = useCallback((): ExportPayload | null => {
    if (!cur || !prev || !report) return null;
    const row = (label: string, c: number, p: number, fmt: (n: number) => string) => ({
      label,
      value: fmt(c),
      change: pctChange(c, p).text,
    });
    const n = (v: number) => v.toLocaleString("en-US");
    const keep = <T,>(group: Parameters<typeof ventureShows>[1], items: T[]): T[] =>
      show(group) ? items : [];

    const kpis = [
      ...keep("revenue", [
        row("Gross revenue", cur.grossCents, prev.grossCents, money),
        row("Processing fees", cur.feeCents, prev.feeCents, money),
        row("Net revenue", cur.netCents, prev.netCents, money),
        row("Payments", cur.orders, prev.orders, n),
      ]),
      ...keep("refunds", [row("Refunds", cur.refundCents, prev.refundCents, money)]),
      ...keep("ecards", [
        row("eCards created", cur.ecardsCreated, prev.ecardsCreated, n),
        row("eCards sent", cur.ecardsPaid, prev.ecardsPaid, n),
        row("Messages collected", cur.contributions, prev.contributions, n),
      ]),
      ...keep("events", [
        row("Events created", cur.eventsCreated, prev.eventsCreated, n),
        row("RSVPs yes", cur.rsvpsYes, prev.rsvpsYes, n),
      ]),
      ...keep("projects", [
        row("Projects created", cur.projectsCreated, prev.projectsCreated, n),
        row("Tasks created", cur.tasksCreated, prev.tasksCreated, n),
      ]),
      ...keep("email", [
        row("Emails sent", cur.emailSent, prev.emailSent, n),
        row("Emails bounced", cur.emailBounced, prev.emailBounced, n),
      ]),
      ...keep("sms", [
        row("Texts sent", cur.smsSent, prev.smsSent, n),
        row("Texts failed", cur.smsFailed, prev.smsFailed, n),
      ]),
      ...keep("errors", [row("Errors logged", cur.errors, prev.errors, n)]),
      ...keep("support", [row("Support messages", cur.supportMessages, prev.supportMessages, n)]),
      ...keep(
        "resumeFeed",
        resumeRows.map((r) => row(r.label, r.current, r.previous, n)),
      ),
    ];

    const tables: ExportTable[] = [
      {
        title: "Revenue and fees summary",
        head: ["Line", "This period", "Prior period"],
        rows: [
          ["Gross revenue", money(cur.grossCents), money(prev.grossCents)],
          ["Processing fees", money(cur.feeCents), money(prev.feeCents)],
          ...(show("refunds")
            ? [["Refunds", money(cur.refundCents), money(prev.refundCents)]]
            : []),
          ["Net revenue", money(cur.netCents), money(prev.netCents)],
          ["Payments", n(cur.orders), n(prev.orders)],
        ],
      },
      {
        title: "Revenue by venture",
        head: ["Venture", "Gross revenue", "Payments"],
        rows: cur.byVenture.length
          ? cur.byVenture.map((v) => [v.venture, money(v.grossCents), n(v.orders)])
          : [["No payments in this period", money(0), "0"]],
      },
      {
        title: "Product activity",
        head: ["Metric", "This period", "Prior period"],
        rows: [
          ...(show("ecards")
            ? [
                ["eCards created", n(cur.ecardsCreated), n(prev.ecardsCreated)],
                ["eCards sent", n(cur.ecardsPaid), n(prev.ecardsPaid)],
                ["Messages collected", n(cur.contributions), n(prev.contributions)],
              ]
            : []),
          ...(show("events")
            ? [
                ["Events created", n(cur.eventsCreated), n(prev.eventsCreated)],
                ["RSVPs yes", n(cur.rsvpsYes), n(prev.rsvpsYes)],
              ]
            : []),
          ...(show("projects")
            ? [
                ["Projects created", n(cur.projectsCreated), n(prev.projectsCreated)],
                ["Tasks created", n(cur.tasksCreated), n(prev.tasksCreated)],
              ]
            : []),
        ],
      },
      {
        title: "Messaging and reliability",
        head: ["Metric", "This period", "Prior period"],
        rows: [
          ["Emails sent", n(cur.emailSent), n(prev.emailSent)],
          ["Emails bounced", n(cur.emailBounced), n(prev.emailBounced)],
          ...(show("sms")
            ? [
                ["Texts sent", n(cur.smsSent), n(prev.smsSent)],
                ["Texts failed", n(cur.smsFailed), n(prev.smsFailed)],
              ]
            : []),
          ["Errors logged", n(cur.errors), n(prev.errors)],
          ...(show("support")
            ? [["Support messages", n(cur.supportMessages), n(prev.supportMessages)]]
            : []),
        ],
      },
      ...(derived.length
        ? [
            {
              title: "Derived rates and averages",
              head: ["Metric", "This period", "How it is worked out"],
              rows: derived.map((d) => [d.label, d.value, d.note]),
            },
          ]
        : []),
      ...(resumeRows.length
        ? [
            {
              title: "Application Kit, from that app's metrics feed",
              head: ["Metric", "This period", "Prior period"],
              rows: resumeRows.map((r) => [r.label, n(r.current), n(r.previous)]),
            },
          ]
        : []),
    ];

    return {
      periodLabel: PRESETS.find((p) => p.id === preset)!.label,
      ventureLabel: ventureLabel(venture),
      scopeNotes: cur.scopeNotes ?? [],
      rangeLabel: `${usDate(report.since)} to ${usDate(
        new Date(new Date(report.until).getTime() - 86400000).toISOString(),
      )}`,
      comparisonLabel: `${usDate(report.prevSince)} to ${usDate(
        new Date(new Date(report.prevUntil).getTime() - 86400000).toISOString(),
      )}`,
      generatedLabel: usDateTime(new Date().toISOString()),
      environment: report.environment === "live" ? "Live payments" : "Test payments",
      kpis,
      tables,
    };
  }, [cur, prev, report, preset, venture, resumeRows, derived]);

  const aiSnapshot = useMemo<AiSnapshot | null>(() => {
    if (!report || !cur || !prev) return null;
    const n = (v: number) => v.toLocaleString("en-US");
    const m = (label: string, c: number, p: number, fmt: (v: number) => string) => ({
      label,
      current: fmt(c),
      previous: fmt(p),
      change: pctChange(c, p).text,
    });
    const keep = <T,>(group: Parameters<typeof ventureShows>[1], items: T[]): T[] =>
      show(group) ? items : [];
    return {
      since: report.since,
      until: report.until,
      rangeLabel: `${usDate(report.since)} to ${usDate(
        new Date(new Date(report.until).getTime() - 86400000).toISOString(),
      )}`,
      comparisonLabel: `${usDate(report.prevSince)} to ${usDate(
        new Date(new Date(report.prevUntil).getTime() - 86400000).toISOString(),
      )}`,
      periodLabel: PRESETS.find((p) => p.id === preset)!.label,
      environment: report.environment,
      venture,
      ventureLabel: ventureLabel(venture),
      scopeNotes: cur.scopeNotes ?? [],
      metrics: [
        ...keep("revenue", [
          m("Gross revenue", cur.grossCents, prev.grossCents, money),
          m("Processing fees", cur.feeCents, prev.feeCents, money),
          m("Net revenue", cur.netCents, prev.netCents, money),
          m("Payments", cur.orders, prev.orders, n),
        ]),
        ...keep("refunds", [m("Refunds", cur.refundCents, prev.refundCents, money)]),
        ...keep("ecards", [
          m("eCards created", cur.ecardsCreated, prev.ecardsCreated, n),
          m("eCards sent", cur.ecardsPaid, prev.ecardsPaid, n),
          m("Messages collected", cur.contributions, prev.contributions, n),
        ]),
        ...keep("events", [
          m("Events created", cur.eventsCreated, prev.eventsCreated, n),
          m("RSVPs yes", cur.rsvpsYes, prev.rsvpsYes, n),
        ]),
        ...keep("projects", [
          m("Projects created", cur.projectsCreated, prev.projectsCreated, n),
          m("Tasks created", cur.tasksCreated, prev.tasksCreated, n),
        ]),
        ...keep("email", [
          m("Emails sent", cur.emailSent, prev.emailSent, n),
          m("Emails bounced", cur.emailBounced, prev.emailBounced, n),
        ]),
        ...keep("sms", [
          m("Texts sent", cur.smsSent, prev.smsSent, n),
          m("Texts failed", cur.smsFailed, prev.smsFailed, n),
        ]),
        ...keep("errors", [m("Errors logged", cur.errors, prev.errors, n)]),
        ...keep("support", [m("Support messages", cur.supportMessages, prev.supportMessages, n)]),
        ...keep(
          "resumeFeed",
          resumeRows.map((r) => m(r.label, r.current, r.previous, n)),
        ),
      ],
      byVenture: cur.byVenture.map((v) => ({
        venture: v.venture,
        gross: money(v.grossCents),
        orders: v.orders,
      })),
      note: cur.available ? null : (cur.note ?? "Payment figures are unavailable for this period."),
    };
  }, [report, cur, prev, preset, venture, resumeRows]);

  const doExport = async (kind: "pdf" | "docx") => {
    const payload = buildPayload();
    if (!payload) {
      toast.error("Wait for the report to finish loading.");
      return;
    }
    try {
      if (kind === "pdf") await exportReportPdf(payload);
      else await exportReportDocx(payload);
      toast.success(`Report downloaded as ${kind.toUpperCase()}.`);
    } catch (e: unknown) {
      toast.error(toUserMessage(e, "Download failed."));
    }
  };

  const hasProductTab = show("ecards") || show("events") || show("projects");
  const tabs = useMemo(() => {
    const list: Array<{ id: TabId; label: string }> = [{ id: "overview", label: "Overview" }];
    if (show("revenue")) list.push({ id: "revenue", label: "Revenue" });
    if (hasProductTab) list.push({ id: "product", label: "Product" });
    if (show("email") || show("sms") || show("errors") || show("support"))
      list.push({ id: "messaging", label: "Messaging & reliability" });
    if (show("resumeFeed")) list.push({ id: "resume", label: "Application Kit" });
    list.push({ id: "insights", label: "Insights & issues" });
    return list;
  }, [venture]);

  // If a section disappears when the venture changes, fall back to Overview.
  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab("overview");
  }, [tabs, tab]);

  const panelProps = (id: TabId) => ({
    id: `owner-report-panel-${id}`,
    role: "tabpanel" as const,
    "aria-labelledby": `owner-report-tab-${id}`,
    tabIndex: 0,
    className: "space-y-6 focus:outline-none",
  });

  const detailFor = (grid: string, extraNote?: string) =>
    openMetric?.grid === grid ? (
      <MetricDetail
        id={`owner-metric-detail-${grid}`}
        label={openMetric.label}
        current={openMetric.current}
        previous={openMetric.previous}
        extraNote={extraNote}
        revenueSeries={revenueSeries}
        messagingSeries={messagingSeries}
        onClose={() => setOpenMetric(null)}
      />
    ) : null;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-serif text-3xl">Owner Report</h2>
        <p className="mt-1 text-base text-muted-foreground">
          Read-only numbers for the period you pick, with the change against the prior comparable
          period. Nothing here changes customer data.
        </p>
      </div>

      {/* Compact sticky control bar */}
      <div className="sticky top-2 z-30 rounded-2xl bg-card/95 p-3 shadow-sm ring-1 ring-ink/10 backdrop-blur">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="report-venture">
              Venture
            </label>
            <select
              id="report-venture"
              value={venture}
              onChange={(e) => setVenture(e.target.value as VentureId)}
              className="rounded-xl border border-ink/15 bg-paper px-3 py-2 text-base"
            >
              {OWNER_VENTURES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                  {v.connected ? "" : " (no data feed)"}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="report-preset">
              Period
            </label>
            <select
              id="report-preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value as PresetId)}
              className="rounded-xl border border-ink/15 bg-paper px-3 py-2 text-base"
            >
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="report-env">
              Payments source
            </label>
            <select
              id="report-env"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as "live" | "sandbox")}
              className="rounded-xl border border-ink/15 bg-paper px-3 py-2 text-base"
            >
              <option value="live">Live payments</option>
              <option value="sandbox">Test payments</option>
            </select>

            <button
              onClick={() => void load()}
              className="rounded-full bg-secondary px-4 py-2 text-base font-medium ring-1 ring-ink/10 hover:bg-secondary/70"
            >
              Refresh
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              onClick={() => doExport("pdf")}
              className="rounded-full bg-velvet px-4 py-2 text-base font-medium text-white hover:opacity-90"
            >
              Download PDF
            </button>
            <button
              onClick={() => doExport("docx")}
              className="rounded-full bg-secondary px-4 py-2 text-base font-medium text-ink ring-1 ring-ink/10 hover:bg-secondary/70"
            >
              Download DOCX
            </button>
          </div>
        </div>

        {preset === "custom" && (
          <div className="mt-3 flex flex-wrap items-end gap-4 border-t border-ink/10 pt-3">
            <label className="text-base">
              <span className="block text-sm font-medium text-muted-foreground">Start date</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="mt-1 rounded-xl border border-ink/15 bg-paper px-3 py-2 text-base"
              />
            </label>
            <label className="text-base">
              <span className="block text-sm font-medium text-muted-foreground">End date</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="mt-1 rounded-xl border border-ink/15 bg-paper px-3 py-2 text-base"
              />
            </label>
          </div>
        )}

        <p className="mt-2 text-sm text-muted-foreground">
          {win.label}. Showing {usDate(win.since.toISOString())} to{" "}
          {usDate(new Date(win.until.getTime() - 86400000).toISOString())}, compared with{" "}
          {usDate(win.prevSince.toISOString())} to{" "}
          {usDate(new Date(win.prevUntil.getTime() - 86400000).toISOString())}. Downloads always
          include every section, whichever one you are reading.
        </p>
      </div>

      {!connected && (
        <div className="rounded-2xl bg-card p-8 ring-1 ring-ink/5">
          <h3 className="font-serif text-2xl">Data feed not connected yet</h3>
          <p className="mt-2 text-lg text-muted-foreground">
            {ventureLabel(venture)} runs as a separate app, so this report cannot read its numbers
            yet. Figures will appear here once its metrics feed and payments are connected.
          </p>
        </div>
      )}

      {connected && err && (
        <div className="rounded-2xl bg-rose-50 p-5 text-base text-rose-900 ring-1 ring-rose-600/20">
          {err}
        </div>
      )}

      {connected && loading && !cur && <ReportSkeleton />}

      {connected && cur && prev && (
        <>
          <SectionTabs tabs={tabs} active={tab} onChange={setTab} idPrefix="owner-report" />

          {!cur.available && (
            <p className="rounded-2xl bg-amber-50 p-4 text-base text-amber-900 ring-1 ring-amber-600/20">
              {cur.note ?? "Payment figures are unavailable for this period."}
            </p>
          )}

          {tab === "overview" && (
            <div {...panelProps("overview")}>
              {headline.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {headline.map((h) => (
                    <HeadlineStat key={h.label} {...h} />
                  ))}
                </div>
              )}

              {cur.scopeNotes?.length ? (
                <ul className="space-y-1 rounded-2xl bg-secondary/40 p-4 text-base text-muted-foreground ring-1 ring-ink/5">
                  {cur.scopeNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}

              {derived.length > 0 && (
                <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
                  <h3 className="font-serif text-xl">Rates and averages</h3>
                  <p className="mt-1 text-base text-muted-foreground">
                    Worked out from the numbers on this page. A rate shows n/a when there is nothing
                    to divide by.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {derived.map((d) => (
                      <RatioCard key={d.label} {...d} />
                    ))}
                  </div>
                </div>
              )}

              {venture === "all" && (
                <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
                  <h3 className="font-serif text-xl">Revenue by venture</h3>
                  {ventureSeries.length === 0 ? (
                    <p className="mt-4 text-base text-muted-foreground">
                      No payments in this period.
                    </p>
                  ) : (
                    <div className="mt-4 h-72">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={ventureSeries}
                            dataKey="value"
                            nameKey="name"
                            outerRadius={95}
                            label
                          >
                            {ventureSeries.map((_, i) => (
                              <Cell key={i} fill={VENTURE_COLORS[i % VENTURE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number | string) => `$${Number(v).toFixed(2)}`} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "revenue" && (
            <div {...panelProps("revenue")}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  label="Gross revenue"
                  value={money(cur.grossCents)}
                  current={cur.grossCents}
                  previous={prev.grossCents}
                  {...gridKpi("revenue", "Gross revenue", cur.grossCents, prev.grossCents)}
                />
                <Kpi
                  label="Processing fees"
                  value={money(cur.feeCents)}
                  current={cur.feeCents}
                  previous={prev.feeCents}
                  {...gridKpi("revenue", "Processing fees", cur.feeCents, prev.feeCents)}
                />
                <Kpi
                  label="Net revenue"
                  value={money(cur.netCents)}
                  current={cur.netCents}
                  previous={prev.netCents}
                  {...gridKpi("revenue", "Net revenue", cur.netCents, prev.netCents)}
                />
                {show("refunds") && (
                  <Kpi
                    label="Refunds"
                    value={money(cur.refundCents)}
                    current={cur.refundCents}
                    previous={prev.refundCents}
                    {...gridKpi("revenue", "Refunds", cur.refundCents, prev.refundCents)}
                  />
                )}
                <Kpi
                  label="Payments"
                  value={cur.orders.toLocaleString("en-US")}
                  current={cur.orders}
                  previous={prev.orders}
                  {...gridKpi("revenue", "Payments", cur.orders, prev.orders)}
                />
              </div>

              {detailFor("revenue")}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <RatioCard
                  label="Average payment value"
                  value={avgMoney(cur.grossCents, cur.orders)}
                  note="Gross revenue divided by the number of payments. Shows n/a when there were no payments."
                />
                {show("refunds") && (
                  <RatioCard
                    label="Refund rate"
                    value={rate(cur.refundCents, cur.grossCents)}
                    note="Refunds divided by gross revenue. Refunds are recorded app-wide."
                  />
                )}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
                  <h3 className="font-serif text-xl">Revenue over time</h3>
                  <div className="mt-4 h-64">
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
                  </div>
                </div>

                <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
                  <h3 className="font-serif text-xl">Payments over time</h3>
                  <div className="mt-4 h-64">
                    <ResponsiveContainer>
                      <BarChart data={revenueSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} minTickGap={24} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="orders" fill="#A9743F" name="Payments" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
                <h3 className="font-serif text-xl">
                  Revenue and fees summary, {ventureLabel(venture)}
                </h3>
                <p className="mt-1 text-base text-muted-foreground">
                  Figures for the selected period, suitable to hand to your accountant. Numbers
                  only.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-base">
                    <thead>
                      <tr className="border-b border-ink/10 text-left text-sm uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4">Line</th>
                        <th className="py-2 pr-4">This period</th>
                        <th className="py-2 pr-4">Prior period</th>
                        <th className="py-2">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ["Gross revenue", cur.grossCents, prev.grossCents],
                        ["Processing fees", cur.feeCents, prev.feeCents],
                        ...(show("refunds")
                          ? [["Refunds", cur.refundCents, prev.refundCents] as const]
                          : []),
                        ["Net revenue", cur.netCents, prev.netCents],
                      ].map(([label, c, p]) => (
                        <tr key={label as string} className="border-b border-ink/5">
                          <td className="py-3 pr-4">{label as string}</td>
                          <td className="py-3 pr-4 font-medium">{money(c as number)}</td>
                          <td className="py-3 pr-4 text-muted-foreground">{money(p as number)}</td>
                          <td className="py-3">
                            <ChangePill current={c as number} previous={p as number} />
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="py-3 pr-4">Payments</td>
                        <td className="py-3 pr-4 font-medium">
                          {cur.orders.toLocaleString("en-US")}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {prev.orders.toLocaleString("en-US")}
                        </td>
                        <td className="py-3">
                          <ChangePill current={cur.orders} previous={prev.orders} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === "product" && (
            <div {...panelProps("product")}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {show("ecards") && (
                  <>
                    <Kpi
                      label="eCards created"
                      value={cur.ecardsCreated.toLocaleString("en-US")}
                      current={cur.ecardsCreated}
                      previous={prev.ecardsCreated}
                      {...gridKpi(
                        "product",
                        "eCards created",
                        cur.ecardsCreated,
                        prev.ecardsCreated,
                      )}
                    />
                    <Kpi
                      label="eCards sent"
                      value={cur.ecardsPaid.toLocaleString("en-US")}
                      current={cur.ecardsPaid}
                      previous={prev.ecardsPaid}
                      hint={`${cur.ecardsCreated.toLocaleString("en-US")} created`}
                      {...gridKpi("product", "eCards sent", cur.ecardsPaid, prev.ecardsPaid)}
                    />
                    <Kpi
                      label="Messages collected"
                      value={cur.contributions.toLocaleString("en-US")}
                      current={cur.contributions}
                      previous={prev.contributions}
                      {...gridKpi(
                        "product",
                        "Messages collected",
                        cur.contributions,
                        prev.contributions,
                      )}
                    />
                  </>
                )}
                {show("events") && (
                  <>
                    <Kpi
                      label="Events created"
                      value={cur.eventsCreated.toLocaleString("en-US")}
                      current={cur.eventsCreated}
                      previous={prev.eventsCreated}
                      hint={`${cur.rsvpsYes.toLocaleString("en-US")} RSVPs yes`}
                      {...gridKpi(
                        "product",
                        "Events created",
                        cur.eventsCreated,
                        prev.eventsCreated,
                      )}
                    />
                    <Kpi
                      label="RSVPs yes"
                      value={cur.rsvpsYes.toLocaleString("en-US")}
                      current={cur.rsvpsYes}
                      previous={prev.rsvpsYes}
                      {...gridKpi("product", "RSVPs yes", cur.rsvpsYes, prev.rsvpsYes)}
                    />
                  </>
                )}
                {show("projects") && (
                  <>
                    <Kpi
                      label="Projects created"
                      value={cur.projectsCreated.toLocaleString("en-US")}
                      current={cur.projectsCreated}
                      previous={prev.projectsCreated}
                      hint={`${cur.tasksCreated.toLocaleString("en-US")} tasks created`}
                      {...gridKpi(
                        "product",
                        "Projects created",
                        cur.projectsCreated,
                        prev.projectsCreated,
                      )}
                    />
                    <Kpi
                      label="Tasks created"
                      value={cur.tasksCreated.toLocaleString("en-US")}
                      current={cur.tasksCreated}
                      previous={prev.tasksCreated}
                      {...gridKpi("product", "Tasks created", cur.tasksCreated, prev.tasksCreated)}
                    />
                  </>
                )}
              </div>

              {detailFor("product")}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {show("ecards") && (
                  <RatioCard
                    label="eCard paid conversion"
                    value={rate(cur.ecardsPaid, cur.ecardsCreated)}
                    note="eCards sent divided by eCards created in the same period. Some cards are created in one period and paid in another."
                  />
                )}
                {show("events") && (
                  <RatioCard
                    label="RSVPs yes"
                    value={cur.rsvpsYes.toLocaleString("en-US")}
                    note="We do not record how many people were invited, so this is a count, not a rate."
                  />
                )}
              </div>
            </div>
          )}

          {tab === "messaging" && (
            <div {...panelProps("messaging")}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  label="Emails sent"
                  value={cur.emailSent.toLocaleString("en-US")}
                  current={cur.emailSent}
                  previous={prev.emailSent}
                  hint={`${cur.emailBounced.toLocaleString("en-US")} bounced`}
                  {...gridKpi("messaging", "Emails sent", cur.emailSent, prev.emailSent)}
                />
                <Kpi
                  label="Emails bounced"
                  value={cur.emailBounced.toLocaleString("en-US")}
                  current={cur.emailBounced}
                  previous={prev.emailBounced}
                  {...gridKpi("messaging", "Emails bounced", cur.emailBounced, prev.emailBounced)}
                />
                {show("sms") && (
                  <>
                    <Kpi
                      label="Texts sent"
                      value={cur.smsSent.toLocaleString("en-US")}
                      current={cur.smsSent}
                      previous={prev.smsSent}
                      hint={`${cur.smsFailed.toLocaleString("en-US")} failed`}
                      {...gridKpi("messaging", "Texts sent", cur.smsSent, prev.smsSent)}
                    />
                    <Kpi
                      label="Texts failed"
                      value={cur.smsFailed.toLocaleString("en-US")}
                      current={cur.smsFailed}
                      previous={prev.smsFailed}
                      {...gridKpi("messaging", "Texts failed", cur.smsFailed, prev.smsFailed)}
                    />
                  </>
                )}
                <Kpi
                  label="Errors logged"
                  value={cur.errors.toLocaleString("en-US")}
                  current={cur.errors}
                  previous={prev.errors}
                  {...gridKpi("messaging", "Errors logged", cur.errors, prev.errors)}
                />
                {show("support") && (
                  <Kpi
                    label="Support messages"
                    value={cur.supportMessages.toLocaleString("en-US")}
                    current={cur.supportMessages}
                    previous={prev.supportMessages}
                    {...gridKpi(
                      "messaging",
                      "Support messages",
                      cur.supportMessages,
                      prev.supportMessages,
                    )}
                  />
                )}
              </div>

              {detailFor("messaging")}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <RatioCard
                  label="Email bounce rate"
                  value={rate(cur.emailBounced, cur.emailSent)}
                  note="Emails that bounced divided by emails sent."
                />
                {show("sms") && (
                  <RatioCard
                    label="Text failure rate"
                    value={rate(cur.smsFailed, cur.smsSent)}
                    note="Texts that failed divided by texts sent."
                  />
                )}
              </div>

              <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
                <h3 className="font-serif text-xl">
                  {show("sms") ? "Email and text volume" : "Email volume"}
                </h3>
                <div className="mt-4 h-64">
                  <ResponsiveContainer>
                    <LineChart data={messagingSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} minTickGap={24} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="email"
                        stroke="#3F6B52"
                        strokeWidth={2}
                        dot={false}
                        name="Emails sent"
                      />
                      {show("sms") && (
                        <Line
                          type="monotone"
                          dataKey="sms"
                          stroke="#7A5C8A"
                          strokeWidth={2}
                          dot={false}
                          name="Texts sent"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {tab === "resume" && (
            <div {...panelProps("resume")}>
              <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
                <h3 className="font-serif text-2xl">Application Kit activity</h3>
                <p className="mt-1 text-lg text-muted-foreground">
                  These figures come from the Application Kit app's own metrics feed, not from this
                  app's tables. Plan counts are a snapshot of today, the rest cover the period you
                  picked.
                </p>
                {cur.resume?.available === false ? (
                  <p className="mt-4 rounded-xl bg-amber-50 p-4 text-lg text-amber-900 ring-1 ring-amber-600/20">
                    {cur.resume.note ?? "AI Resume metrics are temporarily unreachable."}
                  </p>
                ) : (
                  <>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {resumeRows.map((r) => (
                        <Kpi
                          key={r.label}
                          label={r.label}
                          value={r.current.toLocaleString("en-US")}
                          current={r.current}
                          previous={r.previous}
                          {...gridKpi("resume", r.label, r.current, r.previous)}
                        />
                      ))}
                    </div>

                    {detailFor("resume", RESUME_FEED_NOTE)}

                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <RatioCard
                        label="Active rate"
                        value={rate(
                          cur.resume?.users.activeInWindow ?? 0,
                          cur.resume?.users.total ?? 0,
                        )}
                        note="Active users divided by all accounts. Account totals are a snapshot of today."
                      />
                      <RatioCard
                        label="Total AI actions"
                        value={resumeAiTotal.toLocaleString("en-US")}
                        note="The seven AI usage counters added together for the period."
                      />
                    </div>

                    {cur.resume?.generatedAt && (
                      <p className="mt-4 text-base text-muted-foreground">
                        Feed updated {usDateTime(cur.resume.generatedAt)}.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "insights" && (
            <div {...panelProps("insights")}>
              <OwnerAiPanel snapshot={aiSnapshot} />
              <OwnerFeedbackPanel
                since={aiSnapshot?.since ?? null}
                until={aiSnapshot?.until ?? null}
              />
              <OwnerIssuesPanel
                since={aiSnapshot?.since ?? null}
                until={aiSnapshot?.until ?? null}
                venture={venture}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
