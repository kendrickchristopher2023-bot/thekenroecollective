// Owner Command Center, Phase 3: issues plus safe actions.
//
// Only reversible or additive actions appear here. There is no delete, refund,
// reveal-now, bulk operation, or anything that edits a customer's message.
// Each button opens a confirmation dialog first, and the server re-checks the
// owner allowlist and 2FA on every call.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { VentureId } from "@/lib/owner-ventures";

import { toast } from "sonner";
import {
  listOwnerIssues,
  resolveIssueError,
  retryIssueSms,
  remindStuckEcard,
  suppressBouncingEmail,
  type ActionableIssue,
} from "@/lib/owner-issues.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminPaginationBar, AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { csvFileStem, exportCsv, pageMath } from "@/lib/admin-table";
import { formatTimestamp } from "@/lib/datetime";

type AreaFilter = "all" | ActionableIssue["area"];
type ActionFilter = "all" | "actionable" | "no_action";
type IssueSort = "last_seen_desc" | "last_seen_asc" | "count_desc" | "count_asc" | "area";

const AREA_STYLES: Record<ActionableIssue["area"], string> = {
  Errors: "bg-[#8A5C5C]/10 text-[#7a4a4a]",
  "Email bounces": "bg-[#A9743F]/10 text-[#8a5c2f]",
  "Text failures": "bg-[#7A5C8A]/10 text-[#63496f]",
  "Stuck eCards": "bg-[#3F6B52]/10 text-[#33573f]",
};

function usDateTime(iso: string): string {
  return formatTimestamp((iso));
}

export function OwnerIssuesPanel({
  since,
  until,
  venture = "all",
}: {
  since: string | null;
  until: string | null;
  venture?: VentureId;
}) {

  const load = useServerFn(listOwnerIssues);
  const doResolve = useServerFn(resolveIssueError);
  const doSuppress = useServerFn(suppressBouncingEmail);
  const doRetry = useServerFn(retryIssueSms);
  const doRemind = useServerFn(remindStuckEcard);

  const [issues, setIssues] = useState<ActionableIssue[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<ActionableIssue | null>(null);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [area, setArea] = useState<AreaFilter>("all");
  const [actionable, setActionable] = useState<ActionFilter>("all");
  const [sort, setSort] = useState<IssueSort>("last_seen_desc");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(25);

  const refresh = useCallback(async () => {
    if (!since || !until) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await load({ data: { since, until, venture } });
      setIssues(res.issues);
    } catch (e: any) {
      setErr(e?.message ?? "The issues list could not be loaded.");
      setIssues(null);
    } finally {
      setLoading(false);
    }
  }, [load, since, until, venture]);


  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = issues ?? [];
    if (q)
      list = list.filter((i) =>
        `${i.title} ${i.explanation} ${i.recommendation}`.toLowerCase().includes(q),
      );
    if (area !== "all") list = list.filter((i) => i.area === area);
    if (actionable === "actionable")
      list = list.filter((i) => i.action.kind !== "none" && Boolean(i.actionLabel));
    else if (actionable === "no_action")
      list = list.filter((i) => i.action.kind === "none" || !i.actionLabel);
    const seen = (i: ActionableIssue) => i.lastSeen ?? "";
    return [...list].sort((a, b) => {
      switch (sort) {
        case "last_seen_asc":
          return seen(a).localeCompare(seen(b));
        case "count_desc":
          return b.count - a.count;
        case "count_asc":
          return a.count - b.count;
        case "area":
          return a.area.localeCompare(b.area) || seen(b).localeCompare(seen(a));
        default:
          return seen(b).localeCompare(seen(a));
      }
    });
  }, [issues, search, area, actionable, sort]);

  useEffect(() => setOffset(0), [search, area, actionable, sort, limit, since, until, venture]);

  const paged = useMemo(() => filtered.slice(offset, offset + limit), [filtered, offset, limit]);

  const exportFiltered = () => {
    exportCsv(csvFileStem("issues", area === "all" ? "all" : area), filtered, [
      { header: "Area", value: (i: ActionableIssue) => i.area },
      { header: "Title", value: (i: ActionableIssue) => i.title },
      { header: "Count", value: (i: ActionableIssue) => i.count },
      { header: "Last seen", value: (i: ActionableIssue) => i.lastSeen ?? "" },
      { header: "Explanation", value: (i: ActionableIssue) => i.explanation },
      { header: "Recommended", value: (i: ActionableIssue) => i.recommendation },
      { header: "Action available", value: (i: ActionableIssue) => i.actionLabel ?? "" },
    ]);
  };

  const confirmCopy = (issue: ActionableIssue): { title: string; body: string } => {
    switch (issue.action.kind) {
      case "resolve_error":
        return {
          title: "Mark this error resolved?",
          body: "This only closes the entry in your monitoring list. Nothing on the site changes, and you can reopen it later from the error monitoring tab.",
        };
      case "suppress_email":
        return {
          title: "Stop emailing this address?",
          body: "The address joins your do not email list, so future emails skip it. No account or message is changed, and the address can be removed from the list later.",
        };
      case "retry_sms":
        return {
          title: "Retry this one text?",
          body: "The exact same message is put back in the queue for one more attempt. No new message is written and nothing is charged.",
        };
      case "remind_ecard":
        return {
          title: "Email the organizer a reminder?",
          body: "The organizer gets the standard reminder email. This never charges anyone, never reveals the card, and never changes any message on it.",
        };
      default:
        return { title: "No action available", body: "" };
    }
  };

  const runAction = async (issue: ActionableIssue) => {
    setWorking(true);
    try {
      let message = "Done.";
      if (issue.action.kind === "resolve_error") {
        const r = await doResolve({ data: { fingerprint: issue.action.key } });
        message = `Marked resolved (${r.updated} ${r.updated === 1 ? "entry" : "entries"}).`;
        setDone((d) => ({ ...d, [issue.id]: "Marked resolved" }));
      } else if (issue.action.kind === "suppress_email") {
        const r = await doSuppress({ data: { email: issue.action.key } });
        message = r.alreadySuppressed
          ? "That address was already on the do not email list."
          : "Added to the do not email list.";
        setDone((d) => ({ ...d, [issue.id]: "On do not email list" }));
      } else if (issue.action.kind === "retry_sms") {
        const r = await doRetry({ data: { id: issue.action.key } });
        if (!r.ok) throw new Error(`Retry was not possible: ${r.reason ?? "unknown reason"}`);
        message = "Message re-queued for one more attempt.";
        setDone((d) => ({ ...d, [issue.id]: "Re-queued" }));
      } else if (issue.action.kind === "remind_ecard") {
        const r = await doRemind({ data: { ecardId: issue.action.key } });
        if (!r.ok) throw new Error(`Reminder was not sent: ${r.reason ?? "unknown reason"}`);
        message = "Reminder email sent to the organizer.";
        setDone((d) => ({ ...d, [issue.id]: "Reminder sent" }));
      }
      toast.success(message);
      setPending(null);
    } catch (e: any) {
      toast.error(e?.message ?? "That action could not be completed.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-2xl">Issues and safe actions</h3>
          <p className="mt-1 max-w-2xl text-base text-muted-foreground">
            Real problems from the selected period, in plain language. Every action here is safe and
            reversible. Nothing on this panel can delete, refund, reveal a card, or change a
            customer message.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <AdminTableToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search issue text…"
          chips={[
            {
              label: "Area",
              value: area,
              options: [
                { value: "all", label: "All" },
                { value: "Errors", label: "Errors" },
                { value: "Email bounces", label: "Email bounces" },
                { value: "Text failures", label: "Text failures" },
                { value: "Stuck eCards", label: "Stuck eCards" },
              ],
              onChange: (v: AreaFilter) => setArea(v),
            },
            {
              label: "Action",
              value: actionable,
              options: [
                { value: "all", label: "All" },
                { value: "actionable", label: "Action available" },
                { value: "no_action", label: "No action needed" },
              ],
              onChange: (v: ActionFilter) => setActionable(v),
            },
          ]}
          sort={{
            value: sort,
            options: [
              { value: "last_seen_desc", label: "Most recent" },
              { value: "last_seen_asc", label: "Oldest" },
              { value: "count_desc", label: "Most occurrences" },
              { value: "count_asc", label: "Fewest occurrences" },
              { value: "area", label: "Area" },
            ],
            onChange: (v: IssueSort) => setSort(v),
          }}
          pageSize={limit}
          onPageSize={setLimit}
          onExport={exportFiltered}
          exportDisabled={filtered.length === 0}
          busy={loading}
          onRefresh={() => void refresh()}
        />
      </div>

      {err ? (
        <p className="mt-4 rounded-xl bg-[#8A5C5C]/10 p-4 text-base text-[#7a4a4a]">{err}</p>
      ) : null}

      {!err && issues && issues.length === 0 ? (
        <p className="mt-4 text-lg">Nothing needs your attention in this period. All clear.</p>
      ) : null}

      {!err && issues && issues.length > 0 && filtered.length === 0 ? (
        <p className="mt-4 text-lg">No issues match these filters.</p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {paged.map((issue) => (
          <li key={issue.id} className="rounded-xl bg-background/60 p-4 ring-1 ring-ink/5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${AREA_STYLES[issue.area]}`}
              >
                {issue.area}
              </span>
              <span className="rounded-full bg-ink/5 px-3 py-1 text-sm">
                {issue.count} {issue.area === "Errors" ? "times" : issue.count === 1 ? "item" : "items"}
              </span>
              {issue.lastSeen ? (
                <span className="text-sm text-muted-foreground">
                  Last seen {usDateTime(issue.lastSeen)}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-lg font-medium text-ink">{issue.title}</p>
            <p className="mt-1 text-base text-muted-foreground">{issue.explanation}</p>
            <p className="mt-2 text-base">
              <span className="font-medium">Recommended: </span>
              {issue.recommendation}
            </p>
            <div className="mt-3">
              {done[issue.id] ? (
                <span className="inline-block rounded-full bg-[#3F6B52]/10 px-4 py-2 text-base font-medium text-[#33573f]">
                  {done[issue.id]}
                </span>
              ) : issue.actionLabel && issue.action.kind !== "none" ? (
                <button
                  type="button"
                  onClick={() => setPending(issue)}
                  className="rounded-full bg-[#5C3C28] px-5 py-2.5 text-base font-medium text-white hover:bg-[#4a3020]"
                >
                  {issue.actionLabel}
                </button>
              ) : (
                <span className="text-base text-muted-foreground">No action needed.</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {filtered.length > 0 && (
        <div className="mt-3">
          <AdminPaginationBar
            math={pageMath(filtered.length, offset, limit)}
            noun="issues"
            busy={loading}
            onPrev={() => setOffset(Math.max(0, offset - limit))}
            onNext={() => setOffset(offset + limit)}
          />
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={(o) => (!o ? setPending(null) : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">
              {pending ? confirmCopy(pending).title : ""}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {pending ? confirmCopy(pending).body : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-base">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="text-base"
              disabled={working}
              onClick={(e) => {
                e.preventDefault();
                if (pending) void runAction(pending);
              }}
            >
              {working ? "Working..." : "Yes, continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </section>
  );
}
