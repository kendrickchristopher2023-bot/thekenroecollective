/**
 * The master guest report panel: one place a host gets every fact about their
 * event. Filters, sub-reports, CSV and a printable PDF, all off one builder so
 * the numbers agree with the seating chart and the payment itemisation.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  buildMasterReport,
  masterPeopleMatrix,
  masterReportMatrix,
  MASTER_STATUS_LABELS,
  type MasterGuestRow,
  type MasterReport,
  type MasterStatusKey,
} from "@/lib/master-guest-report";
import { exportMasterReportPdf } from "@/lib/master-report-pdf";
import { getHostMasterReportData } from "@/lib/host-report.functions";
import { getInviteOpens } from "@/lib/invite-opens.functions";
import { buildGuestOpenStatuses, type GuestOpenStatus, type InviteOpenRow } from "@/lib/invite-opens";
import { formatTimestamp } from "@/lib/datetime";
import { sendEventInvites } from "@/lib/events-invites.functions";
import { confirmDialog } from "@/lib/confirm-dialog";
import type { KEvent } from "@/lib/events-store";

type View =
  | "master"
  | "nonresponders"
  | "opened"
  | "dietary"
  | "shirts"
  | "payments"
  | "contact"
  | "emergency";

const VIEWS: { key: View; label: string }[] = [
  { key: "master", label: "Master guest report" },
  { key: "nonresponders", label: "Non-responders" },
  { key: "opened", label: "Opened, no answer" },
  { key: "dietary", label: "Dietary summary" },
  { key: "shirts", label: "T-shirt tally" },
  { key: "payments", label: "Payments" },
  { key: "contact", label: "Contact sheet" },
  { key: "emergency", label: "Emergency contacts" },
];

const STATUS_KEYS: MasterStatusKey[] = ["yes", "maybe", "pending", "waitlisted", "no"];

function openLabel(s: GuestOpenStatus | undefined) {
  if (!s || s.state === "untracked") return "Not tracked";
  if (s.state === "never") return "Not opened";
  return s.openCount > 1 ? `Opened ${s.openCount}×` : "Opened";
}


function csvEscape(v: string | number) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function money(n: number) {
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

function Tile({
  label,
  value,
  active,
  activeNote,
  onClick,
  accent,
}: {
  label: string;
  value: string | number;
  active?: boolean;
  activeNote?: string;
  onClick?: () => void;
  accent?: boolean;
}) {
  const base = `min-h-[44px] rounded-lg p-3 text-left ring-1 transition ${
    active
      ? "bg-velvet text-white ring-velvet shadow-sm"
      : accent
        ? "bg-ink text-white ring-ink/10 hover:opacity-90"
        : "bg-secondary/40 ring-ink/5 hover:bg-secondary"
  }`;
  const sub = active || accent ? "text-white/75" : "text-muted-foreground";
  const body = (
    <>
      <div className="text-lg font-medium">{value}</div>
      <div className={`text-[10px] uppercase tracking-widest ${sub}`}>{label}</div>
      {active ? (
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider">{activeNote ?? "Filtering ✓"}</div>
      ) : null}
    </>
  );
  if (!onClick) return <div className={base}>{body}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={!!active} className={base}>
      {body}
    </button>
  );
}

export function MasterGuestReportPanel({ event, eventId }: { event: KEvent; eventId: string }) {
  const [view, setView] = useState<View>("master");
  const [statuses, setStatuses] = useState<MasterStatusKey[]>([]);
  const [q, setQ] = useState("");
  const [serverData, setServerData] = useState<Record<string, any> | null>(null);
  const [access, setAccess] = useState<"checking" | "verified" | "local">("checking");
  const [busy, setBusy] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  // Server-verified fetch: public.can_edit_event decides, not a hidden button.
  useEffect(() => {
    let alive = true;
    setAccess("checking");
    getHostMasterReportData({ data: { eventId } })
      .then((res) => {
        if (!alive) return;
        setServerData(res.data);
        setAccess("verified");
      })
      .catch(() => {
        if (!alive) return;
        setAccess("local");
      });
    return () => {
      alive = false;
    };
  }, [eventId]);

  // Invitation opens (host-only, verified server-side by can_edit_event).
  const [openRows, setOpenRows] = useState<InviteOpenRow[] | null>(null);
  const [eventCreatedAt, setEventCreatedAt] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getInviteOpens({ data: { eventId } })
      .then((res) => {
        if (!alive) return;
        setOpenRows(res.rows);
        setEventCreatedAt(res.eventCreatedAt);
      })
      .catch(() => alive && setOpenRows([]));
    return () => {
      alive = false;
    };
  }, [eventId]);


  // Server JSON is authoritative when available; the local event is the offline
  // fallback. Both go through the same builder, so totals cannot drift.
  const source = useMemo<KEvent>(
    () => (serverData ? ({ ...(serverData as any), id: eventId } as KEvent) : event),
    [serverData, event, eventId],
  );
  const full = useMemo(() => buildMasterReport(source), [source]);

  // Guest id -> open status. "Not tracked" for events predating tracking, so a
  // host never chases someone who may well have opened the invitation.
  const opens = useMemo(
    () => buildGuestOpenStatuses(full.rows.map((r) => r.id), openRows ?? [], eventCreatedAt),
    [full.rows, openRows, eventCreatedAt],
  );
  // The highest-value list a host has: they saw it, and something stopped them.
  const openedNoAnswer = useMemo(
    () => full.nonResponders.filter((r) => opens.get(r.id)?.state === "opened"),
    [full.nonResponders, opens],
  );


  const filtered = useMemo<MasterReport>(() => {
    const needle = q.trim().toLowerCase();
    const rows = full.rows.filter((r) => {
      if (statuses.length && !statuses.includes(r.status)) return false;
      if (!needle) return true;
      return [r.name, r.email, r.phone, ...r.members.map((m) => m.name)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    if (rows.length === full.rows.length) return full;
    // Rebuild totals for the filtered slice so the tiles always describe what is
    // on screen and what an export would contain.
    const t = { ...full.totals };
    t.guests = rows.length;
    t.invited = rows.length;
    t.confirmed = rows.filter((r) => r.status === "yes").length;
    t.maybe = rows.filter((r) => r.status === "maybe").length;
    t.declined = rows.filter((r) => r.status === "no").length;
    t.pending = rows.filter((r) => r.status === "pending").length;
    t.waitlisted = rows.filter((r) => r.status === "waitlisted").length;
    const yes = rows.filter((r) => r.status === "yes");
    t.adults = yes.reduce((n, r) => n + r.adults, 0);
    t.children = yes.reduce((n, r) => n + r.children, 0);
    t.pets = yes.reduce((n, r) => n + r.pets, 0);
    t.attendees = yes.reduce((n, r) => n + r.headcount, 0);
    t.seats = yes.reduce((n, r) => n + r.seatCount, 0);
    t.checkedIn = rows.filter((r) => r.checkedIn).length;
    const billable = rows.filter((r) => r.status !== "no");
    t.owed = billable.reduce((n, r) => n + r.owed, 0);
    t.paid = billable.reduce((n, r) => n + r.paid, 0);
    t.outstanding = billable.reduce((n, r) => n + r.balance, 0);
    return { ...full, rows, totals: t, nonResponders: rows.filter((r) => r.status === "pending") };
  }, [full, statuses, q]);

  const filterNote = useMemo(() => {
    const parts: string[] = [];
    if (statuses.length) parts.push(statuses.map((s) => MASTER_STATUS_LABELS[s]).join(" + "));
    if (q.trim()) parts.push(`search "${q.trim()}"`);
    return parts.length ? `Filtered: ${parts.join(", ")}` : "";
  }, [statuses, q]);

  function toggleStatus(s: MasterStatusKey) {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s]));
  }

  const slug = (event.title || "event").replace(/\W+/g, "_");

  function exportCsv() {
    downloadCsv(
      `${slug}-master-guest-report.csv`,
      masterReportMatrix(
        filtered,
        openRows === null ? undefined : new Map(filtered.rows.map((r) => [r.id, openLabel(opens.get(r.id))])),
      ),
    );

    toast.success(`Exported ${filtered.rows.length} guest rows`);
  }

  function exportPeopleCsv() {
    downloadCsv(`${slug}-每-person.csv`.replace("每", "per"), masterPeopleMatrix(filtered));
  }

  function exportPdf() {
    exportMasterReportPdf(source, filtered, { filterNote });
    toast.success("Printable guest report downloaded");
  }

  async function copyEmails(rows: MasterGuestRow[]) {
    const emails = rows.map((r) => r.email).filter(Boolean);
    if (!emails.length) {
      toast.error("No email addresses on these guests");
      return;
    }
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      toast.success(`Copied ${emails.length} email addresses`);
    } catch {
      toast.error("Your browser blocked the clipboard. Export the CSV instead.");
    }
  }

  /**
   * Shows exactly who is about to be emailed before anything leaves. Email is
   * not recallable, so a bulk reminder is never a single click.
   */
  async function confirmResend(rows: MasterGuestRow[], label: string): Promise<boolean> {
    const sample = rows.slice(0, 5).map((r) => r.name || r.email).join(", ");
    return confirmDialog({
      title: `Resend the invitation to ${rows.length} ${label}?`,
      body: `${sample}${rows.length > 5 ? ` and ${rows.length - 5} more` : ""}. Everyone keeps their own personal link, so any answer already given stays attached. Email cannot be recalled once sent.`,
      confirmLabel: `Resend to ${rows.length}`,
      tone: "info",
    });
  }

  async function sendResend(rows: MasterGuestRow[], label: string) {
    const withEmail = rows.filter((r) => r.email);
    if (!withEmail.length) {
      toast.error("No email addresses on these guests");
      return;
    }
    if (!(await confirmResend(withEmail, label))) return;
    setBusy(true);
    try {
      const res = await sendEventInvites({
        data: { eventId, resend: true, guestIds: withEmail.map((r) => r.id) },
      });
      toast.success(`Reminder sent to ${res.sent} guest${res.sent === 1 ? "" : "s"}`);
    } catch {
      toast.error("Could not send reminders. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remindRows(rows: MasterGuestRow[]) {
    await sendResend(rows, rows.length === 1 ? "guest" : "guests");
  }

  async function remindNonResponders() {
    const rows = full.nonResponders.filter((r) => r.email);
    if (!rows.length) {
      toast.error("Every guest with an email address has already responded");
      return;
    }
    await sendResend(rows, rows.length === 1 ? "non-responder" : "non-responders");
  }

  const f = full.flags;

  return (
    <div className="rounded-xl border border-ink/5 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl">Master guest report</h3>
          <p className="text-xs text-muted-foreground">
            Every fact about every guest, in one place. Downloads follow the filters you set here.
          </p>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          {access === "verified" ? "Host access verified" : access === "checking" ? "Verifying access…" : "Offline copy"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Invited" value={filtered.totals.invited} />
        {STATUS_KEYS.map((s) => (
          <Tile
            key={s}
            label={MASTER_STATUS_LABELS[s]}
            value={
              s === "yes"
                ? filtered.totals.confirmed
                : s === "maybe"
                  ? filtered.totals.maybe
                  : s === "no"
                    ? filtered.totals.declined
                    : s === "waitlisted"
                      ? filtered.totals.waitlisted
                      : filtered.totals.pending
            }
            active={statuses.includes(s)}
            onClick={() => toggleStatus(s)}
          />
        ))}
        <Tile label="Adults" value={filtered.totals.adults} />
        {f.kids ? <Tile label="Children" value={filtered.totals.children} /> : null}
        {f.pets ? <Tile label="Pets" value={filtered.totals.pets} /> : null}
        <Tile label="Total attendees" value={filtered.totals.attendees} accent />
        {f.seating ? <Tile label="Seats needed" value={filtered.totals.seats} /> : null}
        <Tile label="Checked in" value={filtered.totals.checkedIn} />
        {openedNoAnswer.length > 0 ? (
          <Tile
            label="Opened, no answer"
            value={openedNoAnswer.length}
            accent
            onClick={() => setView("opened")}
          />
        ) : null}

      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search any guest or plus-one"
          aria-label="Search the master report"
          className="min-h-[44px] flex-1 rounded-lg bg-secondary/50 px-3 text-sm ring-1 ring-ink/10 focus:outline-none focus:ring-velvet"
        />
        {(statuses.length > 0 || q.trim()) && (
          <button
            type="button"
            onClick={() => {
              setStatuses([]);
              setQ("");
            }}
            className="min-h-[44px] rounded-full bg-ink px-4 text-xs font-medium text-white hover:bg-velvet"
          >
            Clear filters
          </button>
        )}
      </div>
      {filterNote ? (
        <p className="mt-2 rounded-lg bg-velvet/10 px-3 py-2 text-[11px] font-medium text-velvet">
          {filterNote} · {filtered.rows.length} of {full.rows.length} guests · downloads use this view
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-ink/10 pt-3">
        {VIEWS.filter((v) => (v.key === "shirts" ? f.shirts : v.key === "payments" ? f.payments : true)).map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            aria-pressed={view === v.key}
            className={`min-h-[36px] rounded-full px-3 py-1.5 text-[11px] font-medium transition ${
              view === v.key ? "bg-velvet text-white" : "text-muted-foreground ring-1 ring-ink/15 hover:text-ink"
            }`}
          >
            {v.label}
            {v.key === "nonresponders" && full.nonResponders.length > 0 ? ` (${full.nonResponders.length})` : ""}
            {v.key === "opened" && openedNoAnswer.length > 0 ? ` (${openedNoAnswer.length})` : ""}

          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={exportCsv}
          className="min-h-[44px] rounded-full bg-ink px-4 text-xs font-medium text-white hover:bg-velvet"
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={exportPeopleCsv}
          className="min-h-[44px] rounded-full px-4 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary"
        >
          Download per-person CSV
        </button>
        <button
          type="button"
          onClick={exportPdf}
          className="min-h-[44px] rounded-full px-4 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary"
        >
          Download printable PDF
        </button>
      </div>

      <div className="mt-4">
        {view === "master" ? (
          <MasterTable report={filtered} openRow={openRow} setOpenRow={setOpenRow} />
        ) : view === "nonresponders" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/40 p-3">
              <p className="text-sm">
                <span className="font-medium">{full.nonResponders.length}</span> guest
                {full.nonResponders.length === 1 ? " has" : "s have"} not answered yet.
              </p>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copyEmails(full.nonResponders)}
                  className="min-h-[44px] rounded-full px-4 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-card"
                >
                  Copy their emails
                </button>
                <button
                  type="button"
                  onClick={remindNonResponders}
                  disabled={busy}
                  className="min-h-[44px] rounded-full bg-velvet px-4 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send them a reminder"}
                </button>
              </div>
            </div>
            <SimpleTable
              columns={["Guest", "Email", "Phone", "Invitation"]}
              rows={full.nonResponders.map((r) => [
                r.name,
                r.email || "—",
                r.phone || "—",
                openLabel(opens.get(r.id)),
              ])}
              empty="Everyone has responded."
            />
          </div>
        ) : view === "opened" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/40 p-3">
              <p className="text-sm">
                <span className="font-medium">{openedNoAnswer.length}</span> guest
                {openedNoAnswer.length === 1 ? " opened" : "s opened"} their invitation and never answered. They saw it,
                so something stopped them. A nudge here usually lands.
              </p>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copyEmails(openedNoAnswer)}
                  className="min-h-[44px] rounded-full px-4 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-card"
                >
                  Copy their emails
                </button>
                <button
                  type="button"
                  onClick={() => remindRows(openedNoAnswer)}
                  disabled={busy || openedNoAnswer.length === 0}
                  className="min-h-[44px] rounded-full bg-velvet px-4 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send them a reminder"}
                </button>
              </div>
            </div>
            <SimpleTable
              columns={["Guest", "Email", "Phone", "First opened", "Last opened", "Times"]}
              rows={openedNoAnswer.map((r) => {
                const s = opens.get(r.id);
                return [
                  r.name,
                  r.email || "—",
                  r.phone || "—",
                  formatTimestamp(s?.firstOpenedAt),
                  formatTimestamp(s?.lastOpenedAt),
                  String(s?.openCount ?? 0),
                ];
              })}
              empty={
                openRows === null
                  ? "Loading invitation opens…"
                  : "Nobody has opened their invitation without answering."
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Only you and your co-hosts can see this. Opens are counted when a guest opens their personal invitation
              link, not from any email tracking pixel. Mail scanners, link previews and your own previews are excluded,
              and invitations sent before tracking started show as "Not tracked".
            </p>
          </div>
        ) : view === "dietary" ? (

          <div className="space-y-3">
            <div className="rounded-xl bg-secondary/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Totals for your caterer</p>
              {filtered.dietaryAggregate.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {full.dietaryAggregate.map((d) => (
                    <span key={d.label} className="rounded-full bg-card px-3 py-1 text-[11px] font-medium ring-1 ring-ink/10">
                      {d.count} {d.label.toLowerCase()}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No dietary notes submitted yet.</p>
              )}
              <button
                type="button"
                onClick={() =>
                  downloadCsv(`${slug}-dietary-summary.csv`, [
                    ["Requirement", "People"],
                    ...full.dietaryAggregate.map((d) => [d.label, d.count]),
                    [],
                    ["Other notes", ""],
                    ...full.dietaryFreeText.map((d) => [d.name, d.note]),
                  ])
                }
                className="mt-3 min-h-[44px] rounded-full px-4 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-card"
              >
                Download caterer CSV
              </button>
            </div>
            <SimpleTable
              columns={["Person", "Party", "Dietary / allergies", "Accessibility"]}
              rows={filtered.rows.flatMap((r) =>
                r.members
                  .filter((m) => m.dietary || m.accessibility)
                  .map((m) => [m.name, r.name, m.dietary || "—", m.accessibility || "—"]),
              )}
              empty="No dietary or accessibility notes yet."
            />
          </div>
        ) : view === "shirts" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 rounded-xl bg-secondary/40 p-3">
              {full.shirtTally.length ? (
                full.shirtTally.map((s) => (
                  <span key={s.label} className="rounded-full bg-card px-3 py-1 text-[11px] font-medium ring-1 ring-ink/10">
                    {s.label} ×{s.count}
                  </span>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No sizes recorded yet.</p>
              )}
              {full.shirtsMissing > 0 ? (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-900">
                  {full.shirtsMissing} still missing a size
                </span>
              ) : null}
            </div>
            <SimpleTable
              columns={["Person", "Party", "Size"]}
              rows={filtered.rows.flatMap((r) =>
                r.members.filter((m) => m.shirt).map((m) => [m.name, r.name, m.shirt]),
              )}
              empty="No shirt sizes yet."
            />
          </div>
        ) : view === "payments" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Tile label="Billed" value={money(filtered.totals.owed)} />
              <Tile label="Collected" value={money(filtered.totals.paid)} accent />
              <Tile label="Outstanding" value={money(filtered.totals.outstanding)} />
            </div>
            <SimpleTable
              columns={["Guest", "Status", "Owed", "Paid", "Balance"]}
              rows={filtered.rows
                .filter((r) => r.owed > 0)
                .map((r) => [r.name, r.payStatus, money(r.owed), money(r.paid), money(r.balance)])}
              empty="Nobody is billed for this event."
            />
          </div>
        ) : view === "contact" ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => copyEmails(filtered.rows)}
              className="min-h-[44px] rounded-full px-4 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-secondary"
            >
              Copy every email in this view
            </button>
            <SimpleTable
              columns={["Guest", "Phone", "Email", "Party"]}
              rows={filtered.rows.map((r) => [r.name, r.phone || "—", r.email || "—", String(r.headcount)])}
              empty="No guests in this view."
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
              The RSVP form does not collect a separate emergency contact today, so this page lists each party's own
              phone number and anyone travelling with them. Say the word and we will add an emergency-contact field to
              the RSVP form.
            </div>
            <SimpleTable
              columns={["Party", "Phone", "People in party", "Accessibility / medical notes"]}
              rows={filtered.rows
                .filter((r) => r.status === "yes")
                .map((r) => [
                  r.name,
                  r.phone || "—",
                  r.members.filter((m) => m.role !== "Pet").map((m) => m.name).join(", "),
                  r.accessibility || r.dietary || "—",
                ])}
              empty="No confirmed guests yet."
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SimpleTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: (string | number)[][];
  empty: string;
}) {
  if (rows.length === 0) return <p className="p-4 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-ink/10">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead className="bg-secondary/60 text-[10px] uppercase tracking-widest text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-ink/5">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  {cell === "" ? "—" : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MasterTable({
  report,
  openRow,
  setOpenRow,
}: {
  report: MasterReport;
  openRow: string | null;
  setOpenRow: (v: string | null) => void;
}) {
  if (report.rows.length === 0) return <p className="p-4 text-sm text-muted-foreground">No guests match this view.</p>;
  const f = report.flags;
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-ink/10">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-secondary/60 text-[10px] uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">Guest</th>
            <th className="px-3 py-2 font-semibold">RSVP</th>
            <th className="px-3 py-2 font-semibold">Party</th>
            <th className="px-3 py-2 font-semibold">Contact</th>
            {f.seating ? <th className="px-3 py-2 font-semibold">Table</th> : null}
            {f.payments ? <th className="px-3 py-2 font-semibold">Balance</th> : null}
            <th className="px-3 py-2 font-semibold">Arrived</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {report.rows.map((r) => {
            const open = openRow === r.id;
            return (
              <Fragment key={r.id}>
                <tr className="border-t border-ink/5">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">{r.statusLabel}</td>
                  <td className="px-3 py-2">
                    {r.headcount} {r.headcount === 1 ? "person" : "people"}
                    <span className="block text-[11px] text-muted-foreground">
                      {r.adults} adult{r.adults === 1 ? "" : "s"}
                      {f.kids ? `, ${r.children} child${r.children === 1 ? "" : "ren"}` : ""}
                      {r.pets ? `, ${r.pets} pet${r.pets === 1 ? "" : "s"}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[12px]">
                    {r.phone || "—"}
                    <span className="block text-muted-foreground">{r.email || "—"}</span>
                  </td>
                  {f.seating ? <td className="px-3 py-2">{r.table || "—"}</td> : null}
                  {f.payments ? (
                    <td className="px-3 py-2">
                      {r.owed > 0 ? `${money(r.balance)} of ${money(r.owed)}` : "—"}
                      <span className="block text-[11px] text-muted-foreground">{r.payStatus}</span>
                    </td>
                  ) : null}
                  <td className="px-3 py-2">{r.checkedIn ? "yes" : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setOpenRow(open ? null : r.id)}
                      className="min-h-[44px] px-2 text-[11px] font-medium text-velvet underline"
                      aria-expanded={open}
                    >
                      {open ? "Hide details" : "All details"}
                    </button>
                  </td>
                </tr>
                {open ? (
                  <tr className="border-t border-ink/5 bg-secondary/30">
                    <td colSpan={9} className="px-3 py-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                            Everyone in this party
                          </p>
                          <ul className="mt-1 space-y-1 text-[12px]">
                            {r.members.map((m, i) => (
                              <li key={i}>
                                <span className="font-medium">{m.name}</span>{" "}
                                <span className="text-muted-foreground">({m.role})</span>
                                {m.shirt ? ` · shirt ${m.shirt}` : ""}
                                {m.dietary ? ` · ${m.dietary}` : ""}
                                {m.accessibility ? ` · ${m.accessibility}` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <dl className="space-y-1 text-[12px]">
                          <Detail k="Dietary / allergies" v={r.dietary} />
                          <Detail k="Accessibility needs" v={r.accessibility} />
                          {f.shirts ? <Detail k="T-shirt sizes" v={r.shirtSizes} /> : null}
                          {f.seating ? <Detail k="Seats (incl. pets)" v={String(r.seatCount)} /> : null}
                          {f.payments ? (
                            <Detail k="Payments" v={`owed ${money(r.owed)} · paid ${money(r.paid)} · ${r.payStatus}`} />
                          ) : null}
                          <Detail k="Host notes" v={r.notes} />
                        </dl>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-40 shrink-0 text-muted-foreground">{k}</dt>
      <dd>{v || "—"}</dd>
    </div>
  );
}
