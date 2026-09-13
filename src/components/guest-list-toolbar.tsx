import { toUserMessage } from "@/lib/user-error";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { buildGuestReport, guestReportMatrix } from "@/lib/guest-report";
import { SHIRT_SIZES, SHIRT_SIZE_LABELS, shirtSizeLabel } from "@/lib/tshirt-sizes";
import { confirmDialog } from "@/lib/confirm-dialog";
import {
  guestCollected,
  guestOwedAmount,
  isCheckedIn,
  partyHeadcount,
  resendPaymentReminder,
  setRsvp,
  type Guest,
  type KEvent,
} from "@/lib/events-store";
import {
  DEFAULT_GUEST_FILTERS,
  guestPayBucket,
  hasActiveGuestFilters,
  rsvpSelection,
  type GuestFilterState,
  type RsvpFilter,
  type SortKey,
} from "@/lib/guest-filters";
import { sendPaymentSend, reportPaymentSend } from "@/lib/payment-notify";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { isDemoAccountEmail } from "@/lib/demo-mode";

const RSVP_CHIP_LABELS: Record<string, string> = {
  pending: "No response",
  yes: "Confirmed",
  maybe: "Maybe",
  no: "Declined",
  waitlisted: "Waitlisted",
};

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name A–Z",
  name_desc: "Name Z–A",
  rsvp: "RSVP (needs reply first)",
  party: "Biggest party first",
  balance: "Largest balance owed",
  recent: "Most recently contacted",
};

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

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-[11px] font-medium transition ${
        active ? "bg-velvet text-white" : "text-muted-foreground ring-1 ring-ink/15 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function GuestListToolbar({
  event,
  eventId,
  filters,
  setFilters,
  visible,
}: {
  event: KEvent;
  eventId: string;
  filters: GuestFilterState;
  setFilters: (patch: Partial<GuestFilterState>) => void;
  /** The rows currently rendered, in render order — every bulk action and the CSV use exactly these. */
  visible: Guest[];
}) {
  const total = event.guests.length;
  const paymentOn = !!event.paymentEnabled;
  const shirtsOn = !!event.tshirtSizesEnabled;
  const active = hasActiveGuestFilters(filters);
  // The demo's guests are invented, so there is nothing worth exporting. The
  // decision keys off the verified signed-in account (and the event's own demo
  // flag), never the demo cookie.
  const { user } = useAuthReady();
  const canExport = !isDemoAccountEmail(user?.email) && !event._isDemo;
  // RSVP is multi-select: the first pick lands in `rsvp`, the rest in `rsvpMore`.
  const selected = rsvpSelection(filters);
  function toggleRsvp(v: RsvpFilter) {
    const next = selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v];
    setFilters({ rsvp: next[0] ?? "all", rsvpMore: next.slice(1) });
  }

  // The search box keeps its own value and pushes to the URL on a short debounce.
  // Driving the input straight off the URL dropped characters while typing fast,
  // so a name like "Malik Osei" could land as "Mliksei" and match nobody.
  const [draftQ, setDraftQ] = useState(filters.q);
  const lastPushed = useRef(filters.q);
  useEffect(() => {
    if (filters.q !== lastPushed.current) {
      lastPushed.current = filters.q;
      setDraftQ(filters.q);
    }
  }, [filters.q]);
  useEffect(() => {
    if (draftQ === lastPushed.current) return;
    const t = setTimeout(() => {
      lastPushed.current = draftQ;
      setFilters({ q: draftQ });
    }, 200);
    return () => clearTimeout(t);
  }, [draftQ, setFilters]);



  const scopeLabel = useMemo(
    () => `${visible.length} guest${visible.length === 1 ? "" : "s"} in view`,
    [visible.length],
  );

  async function bulkRsvp(status: "yes" | "no" | "maybe") {
    if (visible.length === 0) return;
    const ok = await confirmDialog({
      title: `Set RSVP to "${status}" for ${visible.length} guest${visible.length === 1 ? "" : "s"}?`,
      body: `This applies to the ${scopeLabel} right now, not your whole list. It overwrites their current reply.`,
      confirmLabel: "Update them",
    });
    if (!ok) return;
    for (const g of visible) setRsvp(eventId, g.id, status);
    toast.success(`Updated ${visible.length} guest${visible.length === 1 ? "" : "s"}`);
  }

  async function bulkRemind() {
    const due = visible.filter((g) => {
      const bucket = guestPayBucket(event, g);
      return bucket === "unpaid" || bucket === "partial";
    });
    if (due.length === 0) {
      toast.info("Nobody in view has an outstanding balance.");
      return;
    }
    const ok = await confirmDialog({
      title: `Send a payment reminder to ${due.length} of the ${scopeLabel}?`,
      body: "This is a bulk send limited to the filtered rows above. Guests already at their reminder limit are skipped.",
      confirmLabel: "Send reminders",
    });
    if (!ok) return;
    try {
      // Real delivery first (email queue + SMS outbox). Only guests we actually
      // reached get their reminder counter bumped, so the 3-send cap and the
      // 72h spacing are never spent on someone who heard nothing.
      const summary = await sendPaymentSend({
        eventId,
        guestIds: due.map((g) => g.id),
        kind: "reminder",
      });
      summary.reachedGuestIds.forEach((id) => resendPaymentReminder(eventId, id));
      reportPaymentSend(
        summary,
        `${summary.reachedGuestIds.length} guest${summary.reachedGuestIds.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(toUserMessage(err, "Reminders could not be sent."));
    }
  }

  function exportFiltered() {
    // One comprehensive export: everything the guest submitted (dietary,
    // accessibility, shirt sizes, named plus-ones) plus payment status, built
    // from the same report the owner console uses so the two never drift.
    const ids = new Set(visible.map((g) => g.id));
    const scoped = { ...(event as unknown as Record<string, any>) };
    scoped.guests = ((event as unknown as Record<string, any>).guests ?? []).filter((g: any) =>
      ids.has(g?.id),
    );
    const report = buildGuestReport(scoped, event.id);
    const suffix = active ? "-filtered" : "";
    downloadCsv(`${event.title.replace(/\W+/g, "_")}-guests${suffix}.csv`, guestReportMatrix(report));
    toast.success(`Exported ${visible.length} row${visible.length === 1 ? "" : "s"}`);
  }


  return (
    <div className="space-y-3 rounded-xl border border-ink/10 bg-secondary/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search guests"
          placeholder="Search name, email, phone, plus-one…"
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          className="min-w-[200px] flex-1 rounded-md bg-card px-3 py-2 text-sm ring-1 ring-ink/10 focus:outline-none"
        />

        <select
          aria-label="Sort guests"
          value={filters.sort}
          onChange={(e) => setFilters({ sort: e.target.value as SortKey })}
          className="rounded-md bg-card px-2 py-2 text-[12px] ring-1 ring-ink/10 focus:outline-none"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
        <Chip
          active={filters.preset === "attention"}
          onClick={() => setFilters({ preset: filters.preset === "attention" ? "" : "attention" })}
        >
          Needs attention
        </Chip>
        {active && (
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_GUEST_FILTERS)}
            className="text-[11px] text-muted-foreground underline hover:text-ink"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">RSVP</span>
        <Chip active={selected.length === 0} onClick={() => setFilters({ rsvp: "all", rsvpMore: [] })}>
          Any
        </Chip>
        {(["pending", "yes", "maybe", "no", "waitlisted"] as const).map((v) => (
          <Chip key={v} active={selected.includes(v)} onClick={() => toggleRsvp(v)}>
            {RSVP_CHIP_LABELS[v]}
          </Chip>
        ))}
        {selected.length > 0 && (
          <span className="text-[10px] text-muted-foreground">tap to add or remove</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Party</span>
        {([["", "Any"], ["kids", "With children"], ["pets", "With pets"], ["plusones", "With plus-ones"]] as const).map(
          ([v, label]) => (
            <Chip key={v || "any"} active={filters.has === v} onClick={() => setFilters({ has: v })}>
              {label}
            </Chip>
          ),
        )}
      </div>


      {paymentOn && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment</span>
          {(["all", "unpaid", "partial", "paid", "refunded"] as const).map((v) => (
            <Chip key={v} active={filters.pay === v} onClick={() => setFilters({ pay: v })}>
              {v === "all" ? "Any" : v}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Check-in</span>
        {(["all", "in", "out"] as const).map((v) => (
          <Chip key={v} active={filters.chk === v} onClick={() => setFilters({ chk: v })}>
            {v === "all" ? "Any" : v === "in" ? "Arrived" : "Not arrived"}
          </Chip>
        ))}
        {shirtsOn && (
          <>
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Shirt
            </span>
            <select
              aria-label="Filter by t-shirt size"
              value={filters.size}
              onChange={(e) => setFilters({ size: e.target.value })}
              className="rounded-md bg-card px-2 py-1 text-[11px] ring-1 ring-ink/10 focus:outline-none"
            >
              <option value="">Any</option>
              <option value="none">No size yet</option>
              {SHIRT_SIZES.map((s) => (
                <option key={s} value={s}>
                  {SHIRT_SIZE_LABELS[s]}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-ink/10 pt-2">
        <span className="text-[11px] text-muted-foreground" data-testid="guest-filter-count">
          Showing {visible.length} of {total}
        </span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {canExport ? (
            <button
              type="button"
              onClick={exportFiltered}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium text-ink ring-1 ring-ink/15 hover:bg-card"
            >
              Export these {visible.length} to CSV
            </button>
          ) : null}
          {paymentOn && (
            <button
              type="button"
              onClick={bulkRemind}
              disabled={visible.length === 0}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium text-ink ring-1 ring-ink/15 hover:bg-card disabled:opacity-40"
            >
              Remind these about payment
            </button>
          )}
          {(["yes", "maybe", "no"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => bulkRsvp(s)}
              disabled={visible.length === 0}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium text-ink ring-1 ring-ink/15 hover:bg-card disabled:opacity-40"
            >
              Mark these "{s}"
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Every button in this bar applies to the {scopeLabel} above, never to guests hidden by your filters.
      </p>
    </div>
  );
}
