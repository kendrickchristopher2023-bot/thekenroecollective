import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { OwnerMfaGate } from "@/components/owner-mfa-gate";
import { EventReportDialog } from "@/components/admin/event-report-dialog";
import { SkeletonBlock } from "@/components/skeletons";
import { meCanAdminEvents, listAllEventsAdminPage, type AdminEventRow } from "@/lib/events-admin.functions";
import {
  EVENT_REPORTS,
  REPORT_GROUPS,
  visibleAccountReports,
  type AccountReport,
  type EventReportKind,
} from "@/lib/report-directory";
import { attendanceCsvRows, shirtCsvRows } from "@/lib/report-csv";
import { bringCsvRows } from "@/lib/bring-sheet";
import { listBringItems } from "@/lib/bring-sheet.functions";

import { csvFileStem } from "@/lib/admin-table";

type Search = { event?: string; open?: string };

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports hub — The Kenroe Collective" },
      {
        name: "description",
        content:
          "One place for owners and admins to find every Kenroe Collective report: guest data, dietary and accessibility needs, payment reconciliation, revenue, and delivery logs.",
      },
      { property: "og:title", content: "Reports hub — The Kenroe Collective" },
      {
        property: "og:description",
        content: "Every guest, business, and operations report for owners and admins, in one directory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    event: typeof search.event === "string" && search.event ? search.event : undefined,
    open: search.open === "report" ? "report" : undefined,
  }),
  component: () => (
    <OwnerMfaGate>
      <ReportsHubPage />
    </OwnerMfaGate>
  ),
});

function ReportsHubPage() {
  const checkAccess = useServerFn(meCanAdminEvents);
  const [access, setAccess] = useState<{ allowed: boolean; isOwner: boolean } | null>(null);

  useEffect(() => {
    checkAccess()
      .then((r) => setAccess({ allowed: r.allowed, isOwner: r.isOwner }))
      .catch(() => setAccess({ allowed: false, isOwner: false }));
  }, [checkAccess]);

  if (access === null) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-5xl px-6 py-10">
          <SkeletonBlock className="h-10 w-64" />
          <SkeletonBlock className="mt-6 h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="font-serif text-3xl">Reports</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This area is for admins and owners. Your event's own reports live on the event's Reports tab.
          </p>
          <p className="mt-6 text-xs">
            <Link to="/events" className="text-muted-foreground hover:underline">
              Back to my gatherings
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
              Admin &amp; owner
            </span>
            <h1 className="mt-2 font-serif text-4xl">Reports</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Every report in one place. Each one still lives in its usual spot too, this is just the front door.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin"
              className="inline-flex min-h-11 items-center rounded-full px-4 text-xs font-medium ring-1 ring-ink/15 hover:bg-secondary"
            >
              Admin dashboard
            </Link>
            {access.isOwner && (
              <Link
                to="/owner"
                search={{ tab: undefined }}
                className="inline-flex min-h-11 items-center rounded-full bg-velvet px-4 text-xs font-medium text-white hover:opacity-90"
              >
                Owner console
              </Link>
            )}
          </div>
        </header>

        <div className="mt-10 space-y-10">
          {REPORT_GROUPS.map((group) => {
            const items = visibleAccountReports(access.isOwner).filter((r) => r.group === group.id);
            if (items.length === 0) return null;
            return (
              <section key={group.id}>
                <h2 className="font-serif text-2xl">{group.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{group.blurb}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {items.map((r) => (
                    <AccountReportCard key={r.id} report={r} />
                  ))}
                </div>
              </section>
            );
          })}

          <PerEventSection />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

function AccountReportCard({ report }: { report: AccountReport }) {
  return (
    <div className="flex flex-col rounded-2xl bg-card p-5 ring-1 ring-ink/5">
      <h3 className="font-serif text-lg">{report.title}</h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{report.blurb}</p>
      {report.route ? (
        <Link
          to={report.route}
          className="mt-4 inline-flex min-h-11 w-fit items-center rounded-full bg-ink px-4 text-xs font-medium text-paper hover:bg-velvet"
        >
          Open {report.title}
        </Link>
      ) : (
        <Link
          to="/owner"
          search={{ tab: report.ownerTab ?? undefined }}
          className="mt-4 inline-flex min-h-11 w-fit items-center rounded-full bg-ink px-4 text-xs font-medium text-paper hover:bg-velvet"
        >
          Open {report.title}
        </Link>
      )}
    </div>
  );
}

/**
 * Per-event reports need an event chosen first. The selection lives in the URL
 * so a refresh keeps you on the same event and the same open report.
 */
function PerEventSection() {
  const navigate = useNavigate({ from: "/reports" });
  const { event: selectedId, open } = Route.useSearch();
  const listFn = useServerFn(listAllEventsAdminPage);
  const loadBringItems = useServerFn(listBringItems);

  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<AdminEventRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      listFn({ data: { search: term, scope: "all", limit: 25 } })
        .then((res) => {
          if (alive) setRows(res.rows);
        })
        .catch(() => {
          if (alive) setRows([]);
        });
    }, term ? 300 : 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [term, listFn]);

  const selected = useMemo(
    () => (rows ?? []).find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const select = useCallback(
    (id: string | undefined) => {
      navigate({ search: { event: id, open: undefined }, replace: true });
    },
    [navigate],
  );

  const eventTitle = (row: AdminEventRow) => {
    const data = row.data as Record<string, any> | null;
    return String(data?.title || "Untitled gathering");
  };

  async function runReport(kind: EventReportKind) {
    if (!selected) return;
    const data = (selected.data ?? {}) as Record<string, any>;
    const stem = csvFileStem("report", eventTitle(selected));
    if (kind === "full") {
      navigate({ search: { event: selected.id, open: "report" }, replace: true });
      return;
    }
    if (kind === "attendance") {
      downloadRows(`${stem}-attendance.csv`, attendanceCsvRows(data, selected.id));
      toast.success("Attendance CSV downloaded");
      return;
    }
    if (kind === "bring") {
      try {
        const r = await loadBringItems({ data: { eventId: selected.id } });
        if (!r.items.length) {
          toast.error("No sign-up sheet has been started for this gathering yet.");
          return;
        }
        downloadRows(`${stem}-what-to-bring.csv`, bringCsvRows(r.items));
        toast.success("What to bring CSV downloaded");
      } catch {
        toast.error("Could not load that sign-up sheet. Try again.");
      }
      return;
    }
    if (kind === "shirts") {
      const rowsOut = shirtCsvRows(data);
      if (rowsOut.length <= 4) {
        toast.error("No shirt sizes have been collected for this gathering yet.");
        return;
      }
      downloadRows(`${stem}-shirt-order.csv`, rowsOut);
      toast.success("Shirt order CSV downloaded");
    }
  }


  return (
    <section>
      <h2 className="font-serif text-2xl">One gathering at a time</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick a gathering, then choose a report. Hosts see these same reports on their own event.
      </p>

      <div className="mt-4 rounded-2xl bg-card p-5 ring-1 ring-ink/5">
        <label htmlFor="report-event-search" className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Find a gathering
        </label>
        <input
          id="report-event-search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by title or host"
          className="mt-2 min-h-11 w-full rounded-full bg-secondary px-4 text-sm focus:outline-none focus:ring-2 focus:ring-velvet/40"
        />

        {rows === null ? (
          <SkeletonBlock className="mt-4 h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No gatherings match that search.</p>
        ) : (
          <div className="mt-4 max-h-72 space-y-1 overflow-y-auto">
            {rows.map((row) => {
              const active = row.id === selectedId;
              return (
                <button
                  key={row.id}
                  onClick={() => select(active ? undefined : row.id)}
                  aria-pressed={active}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                    active ? "bg-ink text-paper" : "hover:bg-secondary"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{eventTitle(row)}</span>
                    <span className={`block truncate text-[11px] ${active ? "text-paper/70" : "text-muted-foreground"}`}>
                      {[row.owner_email, row.archived_at ? "Archived" : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="text-[11px] opacity-70">{active ? "Selected" : "Select"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {EVENT_REPORTS.map((r) => (
          <div key={r.id} className="flex flex-col rounded-2xl bg-card p-5 ring-1 ring-ink/5">
            <h3 className="font-serif text-lg">{r.title}</h3>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{r.blurb}</p>
            {r.id === "summary" ? (
              selected ? (
                <Link
                  to="/events/$eventId"
                  params={{ eventId: selected.id }}
                  className="mt-4 inline-flex min-h-11 w-fit items-center rounded-full bg-ink px-4 text-xs font-medium text-paper hover:bg-velvet"
                >
                  Open the gathering
                </Link>
              ) : (
                <DisabledAction />
              )
            ) : selected ? (
              <button
                onClick={() => runReport(r.id)}
                className="mt-4 inline-flex min-h-11 w-fit items-center rounded-full bg-ink px-4 text-xs font-medium text-paper hover:bg-velvet"
              >
                {r.id === "full" ? "Open report" : "Download CSV"}
              </button>
            ) : (
              <DisabledAction />
            )}
          </div>
        ))}
      </div>

      {selected && open === "report" && (
        <EventReportDialog
          eventId={selected.id}
          onClose={() => navigate({ search: { event: selected.id, open: undefined }, replace: true })}
        />
      )}
    </section>
  );
}

function DisabledAction() {
  return (
    <span className="mt-4 inline-flex min-h-11 w-fit items-center rounded-full bg-secondary px-4 text-xs font-medium text-muted-foreground">
      Pick a gathering first
    </span>
  );
}

function downloadRows(filename: string, rows: (string | number)[][]) {
  const escape = (v: string | number | undefined) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
