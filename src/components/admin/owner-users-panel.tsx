import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm-dialog";
import { DEMO_ACCOUNT_EMAIL } from "@/lib/demo-mode";
import { AdminAuditLog, SuperAdminUserActions } from "@/components/admin/super-admin-user-actions";
import {
  changeUserTierAsOwner,
  inviteUserAsOwner,
  listUsersAsOwner,
  meIsSuperAdmin,
  setUserRoleAsSuperAdmin,
  type ManagedRole,
  type OwnerTier,
  type OwnerUserRow,
} from "@/lib/owner-users.functions";
import { AdminPaginationBar } from "@/components/admin/admin-table-toolbar";
import { csvFileStem, exportCsv, pageMath } from "@/lib/admin-table";
import { formatStampDate } from "@/lib/datetime";


const TIER_OPTIONS: { id: OwnerTier; label: string }[] = [
  { id: "postcard", label: "Postcard (free)" },
  { id: "whisper", label: "Whisper" },
  { id: "host", label: "Host" },
  { id: "atelier", label: "Atelier" },
];

const TIER_TONE: Record<OwnerTier, string> = {
  postcard: "bg-secondary text-muted-foreground",
  whisper: "bg-sky-100 text-sky-800",
  host: "bg-violet-100 text-violet-800",
  atelier: "bg-emerald-100 text-emerald-800",
};

export function OwnerUsersPanel() {
  const fetchUsers = useServerFn(listUsersAsOwner);
  const inviteFn = useServerFn(inviteUserAsOwner);
  const changeTierFn = useServerFn(changeUserTierAsOwner);
  const checkSuperAdmin = useServerFn(meIsSuperAdmin);
  const setRoleFn = useServerFn(setUserRoleAsSuperAdmin);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);


  const [rows, setRows] = useState<OwnerUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [chip, setChip] = useState<
    "all" | "banned" | "pending" | "staff" | "paying" | "free"
  >("all");
  const [sortBy, setSortBy] = useState<"created_at" | "last_sign_in_at">("created_at");
  const [sortDesc, setSortDesc] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteTier, setInviteTier] = useState<OwnerTier>("postcard");
  const [inviting, setInviting] = useState(false);


  const load = () => {
    setLoading(true);
    fetchUsers()
      .then((r) => {
        const res = r as { rows: OwnerUserRow[]; truncated: boolean };
        setRows(res.rows);
        setTruncated(Boolean(res.truncated));
      })
      .catch((e) => toast.error(e?.message || "Failed to load users"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    checkSuperAdmin()
      .then((r) => setIsSuperAdmin(!!(r as { isSuperAdmin: boolean }).isSuperAdmin))
      .catch(() => setIsSuperAdmin(false));
  }, []);

  const toggleRole = async (row: OwnerUserRow, role: ManagedRole) => {
    const grant = !row.roles.includes(role);
    const who = row.email || row.user_id;
    if (
      !(await confirmDialog({
        title: `${grant ? "Grant" : "Revoke"} the "${role}" role ${grant ? "to" : "from"} ${who}?`,
      }))
    ) {
      return;
    }
    setBusy(row.user_id);
    try {
      const res = await setRoleFn({ data: { userId: row.user_id, role, grant } });
      if ("error" in res) toast.error(res.error);
      else {
        toast.success(`${role} ${grant ? "granted" : "revoked"} for ${who}`);
        load();
      }
    } finally {
      setBusy(null);
    }
  };

  const sendInvite = async () => {
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    setInviting(true);
    try {
      const res = await inviteFn({
        data: {
          email: email.trim(),
          displayName: displayName.trim() || undefined,
          tier: inviteTier,
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if ("error" in res) {
        toast.error(res.error);
      } else {
        toast.success(`Invitation sent to ${email.trim()}`);
        setEmail("");
        setDisplayName("");
        setInviteTier("postcard");
        setInviteOpen(false);
        load();
      }
    } finally {
      setInviting(false);
    }
  };

  const changeTier = async (row: OwnerUserRow, tier: OwnerTier) => {
    if (tier === row.effective_tier) return;
    const who = row.email || row.display_name || row.user_id;
    const direction = tier === "postcard" ? "Downgrade" : "Change plan";
    if (
      !(await confirmDialog({
        title: `${direction} for ${who}?\n\nFrom: ${row.effective_tier}\nTo: ${tier}\n\nAny existing subscription for a different tier will be canceled.`,
      }))
    ) {
      return;
    }
    setBusy(row.user_id);
    try {
      const res = await changeTierFn({ data: { userId: row.user_id, tier } });
      if ("error" in res) {
        toast.error(res.error);
      } else {
        if (res.warnings?.length) toast.warning(res.warnings.join(" · "));
        toast.success(`${who} is now on ${tier}`);
        load();
      }
    } finally {
      setBusy(null);
    }
  };

  const isBanned = (r: OwnerUserRow) =>
    !!r.banned_until && new Date(r.banned_until).getTime() > Date.now();

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = q
      ? rows.filter(
          (r) =>
            r.email?.toLowerCase().includes(q) ||
            r.display_name?.toLowerCase().includes(q) ||
            r.effective_tier.includes(q) ||
            r.roles.some((role) => role.includes(q)),
        )
      : rows;
    if (chip === "banned") list = list.filter(isBanned);
    if (chip === "pending") list = list.filter((r) => !r.confirmed);
    if (chip === "staff")
      list = list.filter((r) =>
        r.roles.some((role) => role === "owner" || role === "admin" || role === "super_admin"),
      );
    if (chip === "paying") list = list.filter((r) => r.active_subscriptions.length > 0);
    if (chip === "free")
      list = list.filter((r) => r.active_subscriptions.length === 0 && r.effective_tier === "postcard");

    return [...list].sort((a, b) => {
      const av = String(a[sortBy] ?? "");
      const bv = String(b[sortBy] ?? "");
      return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
    });
  }, [rows, filter, chip, sortBy, sortDesc]);

  useEffect(() => {
    setOffset(0);
  }, [filter, chip, sortBy, sortDesc, limit]);

  const paged = useMemo(() => visible.slice(offset, offset + limit), [visible, offset, limit]);

  const exportFiltered = () => {
    exportCsv(csvFileStem("users", chip), visible, [
      { header: "User ID", value: (r: OwnerUserRow) => r.user_id },
      { header: "Email", value: (r: OwnerUserRow) => r.email ?? "" },
      { header: "Display name", value: (r: OwnerUserRow) => r.display_name ?? "" },
      { header: "Effective tier", value: (r: OwnerUserRow) => r.effective_tier },
      { header: "Profile tier", value: (r: OwnerUserRow) => r.profile_tier },
      { header: "Roles", value: (r: OwnerUserRow) => r.roles.join(" ") },
      { header: "Confirmed", value: (r: OwnerUserRow) => (r.confirmed ? "yes" : "no") },
      { header: "Banned until", value: (r: OwnerUserRow) => r.banned_until ?? "" },
      { header: "Active subscriptions", value: (r: OwnerUserRow) => r.active_subscriptions.length },
      { header: "Created", value: (r: OwnerUserRow) => r.created_at ?? "" },
      { header: "Last sign in", value: (r: OwnerUserRow) => r.last_sign_in_at ?? "" },
    ]);
    toast.success(`Exported ${visible.length} user${visible.length === 1 ? "" : "s"}`);
  };

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // The demo host is a real login but not a customer — keep it out of totals.
    for (const r of rows) {
      if (r.email?.toLowerCase() === DEMO_ACCOUNT_EMAIL) continue;
      counts[r.effective_tier] = (counts[r.effective_tier] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const toggleSort = (col: "created_at" | "last_sign_in_at") => {
    if (sortBy === col) setSortDesc((v) => !v);
    else {
      setSortBy(col);
      setSortDesc(true);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const CHIPS: { id: typeof chip; label: string }[] = [
    { id: "all", label: "All" },
    { id: "banned", label: "Banned" },
    { id: "pending", label: "Invite pending" },
    { id: "staff", label: "Owners & admins" },
    { id: "paying", label: "Paying" },
    { id: "free", label: "Free" },
  ];


  return (
    <section>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-serif text-2xl">Users</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Invite new accounts by email (they set their own password) and move anyone up or down a
            tier. Works for both Stripe-billed and manually granted plans.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search by email, name, tier, role…"
            className="rounded-full border border-ink/15 bg-paper px-4 py-2 text-xs w-72"
          />
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Per page
            <select
              aria-label="Rows per page"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-full border border-ink/15 bg-paper px-2 py-1.5 text-xs"
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            onClick={exportFiltered}
            disabled={visible.length === 0}
            title="Exports exactly the users matching the current search and filter"
            className="rounded-full bg-secondary px-4 py-2 text-xs font-medium disabled:opacity-50"
          >
            Export CSV
          </button>
          <button onClick={load} className="rounded-full bg-secondary px-4 py-2 text-xs font-medium">
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            onClick={() => setChip(c.id)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium ${
              chip === c.id ? "bg-velvet text-white" : "bg-secondary text-muted-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {visible.length} of {rows.length} users match ·{" "}
          {TIER_OPTIONS.map((t) => `${t.id} ${tierCounts[t.id] ?? 0}`).join(" · ")}
        </span>
      </div>



      {!inviteOpen ? (
        <div className="mt-4">
          <button
            onClick={() => setInviteOpen(true)}
            className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white"
          >
            + Invite a new user
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-violet-50 via-card to-sky-50 p-5 ring-1 ring-ink/5">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-lg">Invite a new user</h3>
            <button onClick={() => setInviteOpen(false)} className="text-xs text-muted-foreground">
              Cancel
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Sends a secure invitation email. The person sets their own password — you never handle it.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs">
              <span className="text-muted-foreground">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="new.host@example.com"
                className="mt-1 w-full rounded border border-ink/15 bg-paper px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Display name (optional)</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded border border-ink/15 bg-paper px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Starting tier</span>
              <select
                value={inviteTier}
                onChange={(e) => setInviteTier(e.target.value as OwnerTier)}
                className="mt-1 w-full rounded border border-ink/15 bg-paper px-3 py-2 text-sm"
              >
                {TIER_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={sendInvite}
              disabled={inviting}
              className="rounded-full bg-velvet px-5 py-2 text-xs font-medium text-white disabled:opacity-40"
            >
              {inviting ? "Sending…" : "Send invitation"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-2xl bg-card ring-1 ring-ink/5">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">User</th>
              <th className="px-4 py-2 text-left">Tier</th>
              <th className="px-4 py-2 text-left">Billing</th>
              <th className="px-4 py-2 text-left">
                <button onClick={() => toggleSort("created_at")} className="uppercase tracking-wider">
                  Joined {sortBy === "created_at" ? (sortDesc ? "▾" : "▴") : ""}
                </button>
              </th>
              <th className="px-4 py-2 text-left">
                <button onClick={() => toggleSort("last_sign_in_at")} className="uppercase tracking-wider">
                  Last sign-in {sortBy === "last_sign_in_at" ? (sortDesc ? "▾" : "▴") : ""}
                </button>
              </th>
              <th className="px-4 py-2 text-right">Change tier</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">No users found.</td></tr>
            )}

            {paged.map((r) => (
              <tr key={r.user_id} className="border-t border-ink/5">
                <td className="px-4 py-3 align-top">
                  <div className="flex items-center gap-2 font-medium">
                    <span>{r.display_name || r.email || "(unknown)"}</span>
                    {r.email?.toLowerCase() === DEMO_ACCOUNT_EMAIL && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        Demo
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{r.email || r.user_id}</span>
                    {r.email && (
                      <button
                        onClick={() => copy(r.email!, "Email")}
                        className="rounded px-1 text-[10px] hover:bg-ink/5"
                        aria-label={`Copy email for ${r.email}`}
                      >
                        copy
                      </button>
                    )}
                    <button
                      onClick={() => copy(r.user_id, "User id")}
                      className="rounded px-1 text-[10px] hover:bg-ink/5"
                      aria-label={`Copy user id for ${r.email || r.user_id}`}
                    >
                      id
                    </button>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.roles.map((role) => (
                      <span key={role} className="rounded-full bg-velvet/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-velvet">
                        {role}
                      </span>
                    ))}
                    {isSuperAdmin && (
                      <>
                        {(["owner", "admin"] as ManagedRole[]).map((role) => (
                          <button
                            key={role}
                            disabled={busy === r.user_id}
                            onClick={() => toggleRole(r, role)}
                            className="rounded-full border border-ink/15 px-2 py-0.5 text-[10px] uppercase tracking-wider disabled:opacity-40"
                          >
                            {r.roles.includes(role) ? `revoke ${role}` : `make ${role}`}
                          </button>
                        ))}
                      </>
                    )}
                    {!r.confirmed && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-800">
                        invite pending
                      </span>
                    )}
                    {r.banned_until && new Date(r.banned_until).getTime() > Date.now() && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-800">
                        banned until {formatStampDate((r.banned_until))}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${TIER_TONE[r.effective_tier]}`}>
                    {r.effective_tier}
                  </span>
                  {r.profile_tier !== r.effective_tier && (
                    <div className="mt-1 text-[10px] text-muted-foreground">profile: {r.profile_tier}</div>
                  )}
                </td>
                <td className="px-4 py-3 align-top text-xs">
                  {r.active_subscriptions.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    r.active_subscriptions.map((s) => (
                      <div key={s.id} className="font-mono text-[11px]">
                        {s.price_id}
                        <span className="ml-1 text-muted-foreground">
                          ({s.manual ? "comped" : "stripe"} · {s.environment})
                        </span>
                        {/* Surface the lapse date so a comped promo can't quietly
                            expire on a host mid-event. */}
                        <span className="ml-1 text-muted-foreground">
                          {s.ends_at
                            ? `· ends ${formatStampDate((s.ends_at))}`
                            : "· no end date"}
                        </span>
                      </div>
                    ))

                  )}
                </td>
                <td className="px-4 py-3 align-top text-xs">
                  {r.created_at ? formatStampDate((r.created_at)) : "—"}
                </td>
                <td className="px-4 py-3 align-top text-xs">
                  {r.last_sign_in_at ? (
                    formatStampDate((r.last_sign_in_at))
                  ) : (
                    <span className="text-muted-foreground">never</span>
                  )}
                </td>

                <td className="px-4 py-3 align-top text-right">
                  <select
                    disabled={busy === r.user_id}
                    value={r.effective_tier}
                    onChange={(e) => changeTier(r, e.target.value as OwnerTier)}
                    className="rounded-full border border-ink/15 bg-paper px-3 py-1 text-[11px] disabled:opacity-40"
                    aria-label={`Change tier for ${r.email || r.user_id}`}
                  >
                    {TIER_OPTIONS.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                  {isSuperAdmin && (
                    <SuperAdminUserActions
                      user={{
                        user_id: r.user_id,
                        email: r.email,
                        banned_until: r.banned_until,
                        display_name: r.display_name,
                        confirmed: r.confirmed,
                      }}

                      onDone={load}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <AdminPaginationBar
          math={pageMath(visible.length, offset, limit)}
          noun="users"
          busy={loading}
          onPrev={() => setOffset(Math.max(0, offset - limit))}
          onNext={() => setOffset(offset + limit)}
          note={
            truncated ? (
              <span className="text-amber-700">
                The account directory is unusually large, so this list may be incomplete. Tell the team.
              </span>
            ) : null
          }
        />
      </div>




      {isSuperAdmin && <AdminAuditLog />}
    </section>
  );
}
