import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SuperAdminUserEdit } from "@/components/admin/super-admin-user-edit";
import {
  banUserAsSuperAdmin,
  getUserDeletionPreflight,
  hardDeleteUserAsSuperAdmin,
  listAuditLog,
  softDeleteUserAsSuperAdmin,
  unbanUserAsSuperAdmin,
  type AuditEntry,
  type BanDuration,
  type DeletionPreflight,
} from "@/lib/super-admin.functions";
import { formatTimestamp } from "@/lib/datetime";

const BAN_OPTIONS: { id: BanDuration; label: string }[] = [
  { id: "24h", label: "24 hours" },
  { id: "168h", label: "7 days" },
  { id: "720h", label: "30 days" },
  { id: "permanent", label: "Permanent" },
];

type TargetUser = {
  user_id: string;
  email: string | null;
  banned_until: string | null;
  display_name?: string | null;
  confirmed?: boolean;
};

/** Super-admin-only edit / ban / delete controls for one row in the Users table. */
export function SuperAdminUserActions({
  user,
  onDone,
}: {
  user: TargetUser;
  onDone: () => void;
}) {
  const banFn = useServerFn(banUserAsSuperAdmin);
  const unbanFn = useServerFn(unbanUserAsSuperAdmin);
  const preflightFn = useServerFn(getUserDeletionPreflight);
  const softDeleteFn = useServerFn(softDeleteUserAsSuperAdmin);
  const hardDeleteFn = useServerFn(hardDeleteUserAsSuperAdmin);

  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<null | "ban" | "delete" | "edit">(null);
  const [duration, setDuration] = useState<BanDuration>("permanent");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [preflight, setPreflight] = useState<DeletionPreflight | null>(null);

  const banned =
    !!user.banned_until && new Date(user.banned_until).getTime() > Date.now();
  const emailMatches =
    !!user.email && typed.trim().toLowerCase() === user.email.toLowerCase();

  // Closing always resets the panel so reopening starts clean, and never
  // interrupts an in-flight request.
  const closePanel = () => {
    if (busy) return;
    setMode(null);
    setTyped("");
    setDuration("permanent");
    setPreflight(null);
  };

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, busy]);

  const openDelete = async () => {
    setMode("delete");
    setTyped("");
    setPreflight(null);
    try {
      const res = await preflightFn({ data: { userId: user.user_id } });
      setPreflight(res as DeletionPreflight);
    } catch (e: any) {
      toast.error(e?.message || "Failed to check account footprint");
    }
  };

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      const res = await fn();
      if (res && "error" in res) toast.error(res.error);
      else {
        toast.success(res?.message || "Done");
        setMode(null);
        setTyped("");
        setPreflight(null);
        onDone();
      }
    } catch (e: any) {
      toast.error(e?.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const PanelHeader = ({ title, tone }: { title: string; tone: string }) => (
    <div className="flex items-start justify-between gap-2">
      <p className={`text-[11px] font-medium ${tone}`}>{title}</p>
      <button
        type="button"
        disabled={busy}
        onClick={closePanel}
        aria-label={`Close ${title}`}
        className="rounded-full px-1.5 text-[11px] text-muted-foreground hover:bg-ink/5 disabled:opacity-40"
      >
        ✕
      </button>
    </div>
  );

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => {
            const next = !menuOpen;
            setMenuOpen(next);
            if (!next) closePanel();
          }}
          className="rounded-full border border-ink/15 px-2 py-0.5 text-[10px] font-medium"
          aria-expanded={menuOpen}
        >
          Manage {menuOpen ? "▴" : "▾"}
        </button>

        {menuOpen && (
          <>
            <button
              disabled={busy}
              onClick={() => (mode === "edit" ? closePanel() : setMode("edit"))}
              className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium disabled:opacity-40"
            >
              Edit
            </button>
            {banned ? (
              <button
                disabled={busy}
                onClick={() => run(() => unbanFn({ data: { userId: user.user_id } }))}
                className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 disabled:opacity-40"
              >
                Unban
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => {
                  if (mode === "ban") closePanel();
                  else {
                    setMode("ban");
                    setTyped("");
                  }
                }}
                className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 disabled:opacity-40"
              >
                Ban
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => (mode === "delete" ? closePanel() : openDelete())}
              className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800 disabled:opacity-40"
            >
              Delete
            </button>
          </>
        )}
      </div>

      {mode === "edit" && (
        <SuperAdminUserEdit
          user={{
            user_id: user.user_id,
            email: user.email,
            display_name: user.display_name ?? null,
            confirmed: user.confirmed ?? true,
          }}
          onDone={onDone}
          onClose={closePanel}
        />
      )}

      {mode === "ban" && (
        <div className="mt-2 rounded-xl bg-amber-50 p-3 text-left ring-1 ring-amber-200">
          <PanelHeader title="Ban account" tone="text-amber-900" />
          <p className="mt-1 text-[11px] text-amber-900">
            Bans block sign-in and revoke sessions. No data is touched — reversible at any time.
          </p>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value as BanDuration)}
            aria-label="Ban duration"
            className="mt-2 w-full rounded border border-ink/15 bg-paper px-2 py-1 text-xs"
          >
            {BAN_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          <label className="mt-2 block text-[11px] text-amber-900">
            Type <span className="font-mono">{user.email}</span> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 w-full rounded border border-ink/15 bg-paper px-2 py-1 text-xs"
              autoComplete="off"
            />
          </label>
          <button
            disabled={busy || !emailMatches}
            onClick={() =>
              run(() =>
                banFn({ data: { userId: user.user_id, confirmEmail: typed, duration } }),
              )
            }
            className="mt-2 w-full rounded-full bg-amber-600 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
          >
            {busy ? "Working…" : "Ban this account"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={closePanel}
            className="mt-1 w-full rounded-full border border-amber-300 px-3 py-1.5 text-[11px] font-medium text-amber-900 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      )}

      {mode === "delete" && (
        <div className="mt-2 rounded-xl bg-red-50 p-3 text-left ring-1 ring-red-200">
          <PanelHeader title="Delete account" tone="text-red-900" />
          {!preflight ? (
            <p className="mt-1 text-[11px] text-red-900">Checking account footprint…</p>
          ) : (
            <>
              <ul className="mt-1 space-y-0.5 text-[11px] text-red-900">
                <li>Active events: {preflight.activeEvents} (archived: {preflight.archivedEvents})</li>
                <li>
                  Vendor profiles: {preflight.vendorProfiles} · reviews received:{" "}
                  {preflight.vendorReviewsReceived}
                </li>
                <li>Open RFQ threads: {preflight.openRfqThreads}</li>
                <li>Shared projects: {preflight.sharedProjects}</li>
                <li>
                  Active subscriptions: {preflight.activeSubscriptions} · passes:{" "}
                  {preflight.activePasses}
                </li>
                <li>Contacts: {preflight.contacts}</li>
              </ul>

              {preflight.blockers.length > 0 ? (
                <div className="mt-2 space-y-1">
                  <p className="text-[11px] font-medium text-red-900">
                    Resolve these before deleting:
                  </p>
                  {preflight.blockers.map((b) => (
                    <p key={b} className="text-[11px] text-red-800">• {b}</p>
                  ))}
                </div>
              ) : (
                <>
                  <p className="mt-2 text-[11px] text-red-900">
                    Reversible delete archives their events, anonymizes the profile, removes their
                    contacts, permanently bans sign-in, and schedules permanent removal in 30 days.
                  </p>
                  <label className="mt-2 block text-[11px] text-red-900">
                    Type <span className="font-mono">{user.email}</span> to confirm
                    <input
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      className="mt-1 w-full rounded border border-ink/15 bg-paper px-2 py-1 text-xs"
                      autoComplete="off"
                    />
                  </label>
                  <button
                    disabled={busy || !emailMatches}
                    onClick={() =>
                      run(() =>
                        softDeleteFn({ data: { userId: user.user_id, confirmEmail: typed } }),
                      )
                    }
                    className="mt-2 w-full rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
                  >
                    {busy ? "Working…" : "Delete (reversible for 30 days)"}
                  </button>
                  {preflight.activeEvents +
                    preflight.archivedEvents +
                    preflight.vendorProfiles +
                    preflight.openRfqThreads +
                    preflight.sharedProjects +
                    preflight.activeSubscriptions ===
                    0 && (
                    <button
                      disabled={busy || !emailMatches}
                      onClick={() =>
                        run(() =>
                          hardDeleteFn({ data: { userId: user.user_id, confirmEmail: typed } }),
                        )
                      }
                      className="mt-1 w-full rounded-full border border-red-400 px-3 py-1.5 text-[11px] font-medium text-red-700 disabled:opacity-40"
                    >
                      Delete now (irreversible)
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={closePanel}
                className="mt-1 w-full rounded-full border border-red-300 px-3 py-1.5 text-[11px] font-medium text-red-900 disabled:opacity-40"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}


/** Super-admin-only audit trail of privileged actions. */
export function AdminAuditLog() {
  const fetchLog = useServerFn(listAuditLog);
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchLog()
      .then((r) => setRows(r as AuditEntry[]))
      .catch((e: any) => toast.error(e?.message || "Failed to load audit log"))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <div className="mt-6 rounded-2xl bg-card p-4 ring-1 ring-ink/5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-velvet"
      >
        {open ? "Hide" : "Show"} admin audit log
      </button>
      {open && (
        <div className="mt-3 overflow-hidden rounded-xl ring-1 ring-ink/5">
          <table className="w-full text-xs">
            <thead className="bg-secondary/50 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Actor</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Target</th>
                <th className="px-3 py-2 text-left">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No entries yet.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-ink/5">
                  <td className="px-3 py-2">{formatTimestamp((r.created_at))}</td>
                  <td className="px-3 py-2">{r.actor_email || "—"}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{r.action}</td>
                  <td className="px-3 py-2">{r.target_email || "—"}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                    {r.details ? JSON.stringify(r.details) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
