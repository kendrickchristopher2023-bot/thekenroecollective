import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { SiteNav } from "@/components/site-nav";
import {
  adminArchiveProjects,
  adminDeleteProjects,
  adminGetProjectDetail,
  adminRemoveProjectMember,
  adminRestoreProjects,
  adminTransferProjectOwner,
  adminUpdateProject,
  listAllProjectsAdminPage,
  meCanAdminProjects,
  type AdminProjectDetail,
} from "@/lib/projects-admin.functions";
import type {
  AdminProjectLinked,
  AdminProjectRow,
  AdminProjectSort,
} from "@/lib/projects-admin.types";
import { AdminPaginationBar, AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { csvFileStem, exportCsv, pageMath } from "@/lib/admin-table";
import { confirmDialog } from "@/lib/confirm-dialog";
import { formatOwnerId } from "@/lib/format-owner";
import { OwnerMfaGate } from "@/components/owner-mfa-gate";
import { formatStampDate, formatTimestamp } from "@/lib/datetime";

type Scope = "active" | "archived" | "all";

export const Route = createFileRoute("/_authenticated/owner-projects")({
  head: () => ({ meta: [{ title: "All projects — Owner console" }] }),
  component: () => (
    <OwnerMfaGate>
      <OwnerProjectsPage />
    </OwnerMfaGate>
  ),
});

function OwnerProjectsPage() {
  const checkAccess = useServerFn(meCanAdminProjects);
  const listFn = useServerFn(listAllProjectsAdminPage);
  const updateFn = useServerFn(adminUpdateProject);
  const archiveFn = useServerFn(adminArchiveProjects);
  const restoreFn = useServerFn(adminRestoreProjects);
  const deleteFn = useServerFn(adminDeleteProjects);
  const detailFn = useServerFn(adminGetProjectDetail);
  const removeMemberFn = useServerFn(adminRemoveProjectMember);
  const transferFn = useServerFn(adminTransferProjectOwner);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<AdminProjectRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [linked, setLinked] = useState<AdminProjectLinked>("all");
  const [sort, setSort] = useState<AdminProjectSort>("updated_desc");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<AdminProjectRow | null>(null);
  const [detail, setDetail] = useState<AdminProjectDetail | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftColor, setDraftColor] = useState("");
  const [draftEventId, setDraftEventId] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkAccess()
      .then((r) => setAllowed(r.allowed))
      .catch(() => setAllowed(false));
  }, [checkAccess]);

  type Query = {
    search: string;
    ownerEmail: string;
    scope: Scope;
    linked: AdminProjectLinked;
    sort: AdminProjectSort;
    offset: number;
    limit: number;
  };

  const currentQuery = (): Query => ({ search, ownerEmail, scope, linked, sort, offset, limit });

  const load = async (q: Query = currentQuery()) => {
    setLoading(true);
    try {
      const res = await listFn({ data: q });
      setRows(res.rows);
      setTotal(res.total);
      setChecked({});
    } catch (e: unknown) {
      toast.error(toUserMessage(e, "Failed to load projects"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!allowed) return;
    void load({ search, ownerEmail, scope, linked, sort, offset, limit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, search, ownerEmail, scope, linked, sort, offset, limit]);

  const resetPage = () => setOffset(0);

  /** CSV mirrors the active filters, not just the page on screen. */
  const exportFiltered = async () => {
    setExporting(true);
    try {
      const res = await listFn({ data: { ...currentQuery(), offset: 0, limit: 500 } });
      exportCsv(csvFileStem("projects", scope), res.rows, [
        { header: "Project ID", value: (r: AdminProjectRow) => r.id },
        { header: "Name", value: (r: AdminProjectRow) => r.name },
        { header: "Owner", value: (r: AdminProjectRow) => r.owner_display_name ?? "" },
        { header: "Owner email", value: (r: AdminProjectRow) => r.owner_email ?? "" },
        { header: "Linked event", value: (r: AdminProjectRow) => r.event_id ?? "" },
        { header: "Tasks", value: (r: AdminProjectRow) => r.task_count },
        { header: "Members", value: (r: AdminProjectRow) => r.member_count },
        { header: "Status", value: (r: AdminProjectRow) => (r.archived_at ? "archived" : "active") },
        { header: "Created", value: (r: AdminProjectRow) => r.created_at },
        { header: "Updated", value: (r: AdminProjectRow) => r.updated_at },
      ]);
      if (res.total > res.rows.length) {
        toast.message(`Exported the first ${res.rows.length} of ${res.total} matching projects. Narrow the filters to export the rest.`);
      } else {
        toast.success(`Exported ${res.rows.length} project${res.rows.length === 1 ? "" : "s"}`);
      }
    } catch (e: unknown) {
      toast.error(toUserMessage(e, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  const selectedIds = useMemo(
    () => Object.entries(checked).filter(([, v]) => v).map(([k]) => k),
    [checked],
  );
  const allChecked = rows.length > 0 && selectedIds.length === rows.length;
  const someChecked = selectedIds.length > 0 && !allChecked;

  const toggleAll = () => {
    if (allChecked || someChecked) setChecked({});
    else setChecked(Object.fromEntries(rows.map((r) => [r.id, true])));
  };

  const runBulk = async (
    fn: (args: { data: { ids: string[] } }) => Promise<unknown>,
    label: string,
    confirmMsg?: string,
  ) => {
    if (selectedIds.length === 0) return;
    if (confirmMsg && !(await confirmDialog({ title: confirmMsg.replace("{n}", String(selectedIds.length)), tone: "danger" }))) return;
    setBusy(true);
    try {
      await fn({ data: { ids: selectedIds } });
      toast.success(`${label} ${selectedIds.length} project${selectedIds.length === 1 ? "" : "s"}`);
      await load();
    } catch (e: unknown) {
      toast.error(toUserMessage(e, `Failed to ${label.toLowerCase()}`));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = async (row: AdminProjectRow) => {
    setSelected(row);
    setDraftName(row.name);
    setDraftDesc(row.description ?? "");
    setDraftColor(row.color ?? "");
    setDraftEventId(row.event_id ?? "");
    setTransferTo("");
    setDetail(null);
    try {
      const d = await detailFn({ data: { id: row.id } });
      setDetail(d);
    } catch (e: unknown) {
      toast.error(toUserMessage(e, "Failed to load detail"));
    }
  };

  const save = async () => {
    if (!selected) return;
    if (!draftName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      await updateFn({
        data: {
          id: selected.id,
          name: draftName.trim(),
          description: draftDesc.trim() || null,
          color: draftColor.trim() || null,
          eventId: draftEventId.trim() || null,
        },
      });
      toast.success("Project saved");
      setSelected(null);
      await load();
    } catch (e: unknown) {
      toast.error(toUserMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!selected) return;
    if (!(await confirmDialog({ title: "Remove this member from the project?" }))) return;
    try {
      await removeMemberFn({ data: { projectId: selected.id, userId } });
      toast.success("Member removed");
      const d = await detailFn({ data: { id: selected.id } });
      setDetail(d);
    } catch (e: unknown) {
      toast.error(toUserMessage(e, "Failed"));
    }
  };

  const transferOwner = async () => {
    if (!selected || !transferTo.trim()) return;
    if (!(await confirmDialog({ title: "Transfer ownership to this user? This cannot be undone here." }))) return;
    try {
      await transferFn({ data: { projectId: selected.id, newOwnerUserId: transferTo.trim() } });
      toast.success("Ownership transferred");
      setSelected(null);
      await load();
    } catch (e: unknown) {
      toast.error(toUserMessage(e, "Failed"));
    }
  };

  if (allowed === null) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <h1 className="font-serif text-3xl">Owner / admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This area is restricted to site owners and admins.
          </p>
          <p className="mt-6 text-xs">
            <Link to="/owner" search={{ tab: undefined }} className="text-muted-foreground hover:underline">
              Back to owner console
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const SCOPES: { id: Scope; label: string }[] = [
    { id: "active", label: "Active" },
    { id: "archived", label: "Archive" },
    { id: "all", label: "All" },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-7xl px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl">
              All projects
              <span className="ml-3 align-middle rounded-full bg-velvet/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-velvet">
                Owner
              </span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse, search, edit, archive, restore, transfer ownership, manage members, or permanently delete projects.
            </p>
          </div>
        </div>

        <AdminTableToolbar
          search={search}
          onSearch={(v) => { setSearch(v); resetPage(); }}
          searchPlaceholder="Search id, name, description, event id…"
          secondarySearch={{
            value: ownerEmail,
            onChange: (v) => { setOwnerEmail(v); resetPage(); },
            placeholder: "Owner email contains…",
            ariaLabel: "Owner email",
          }}
          chips={[
            {
              label: "Status",
              value: scope,
              options: SCOPES.map((sc) => ({ value: sc.id, label: sc.label })),
              onChange: (v: Scope) => { setScope(v); resetPage(); },
            },
            {
              label: "Event link",
              value: linked,
              options: [
                { value: "all", label: "Any" },
                { value: "linked", label: "Linked" },
                { value: "unlinked", label: "Not linked" },
              ],
              onChange: (v: AdminProjectLinked) => { setLinked(v); resetPage(); },
            },
          ]}
          sort={{
            value: sort,
            options: [
              { value: "updated_desc", label: "Updated (newest)" },
              { value: "updated_asc", label: "Updated (oldest)" },
              { value: "created_desc", label: "Created (newest)" },
              { value: "created_asc", label: "Created (oldest)" },
              { value: "name_asc", label: "Name A–Z" },
              { value: "name_desc", label: "Name Z–A" },
            ],
            onChange: (v: AdminProjectSort) => { setSort(v); resetPage(); },
          }}
          pageSize={limit}
          onPageSize={(n) => { setLimit(n); resetPage(); }}
          onExport={() => void exportFiltered()}
          exportLabel={exporting ? "Exporting…" : "Export CSV"}
          exportDisabled={exporting || loading}
          busy={loading}
          onRefresh={() => void load()}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{selectedIds.length} selected</span>
            {scope !== "archived" && (
              <button
                disabled={busy || selectedIds.length === 0}
                onClick={() => runBulk(archiveFn, "Archived", "Move {n} project(s) to archive?")}
                className="rounded-md border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/40"
              >
                Archive selected
              </button>
            )}
            {scope !== "active" && (
              <button
                disabled={busy || selectedIds.length === 0}
                onClick={() => runBulk(restoreFn, "Restored", "Restore {n} project(s) from archive?")}
                className="rounded-md border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/40"
              >
                Restore selected
              </button>
            )}
            {scope === "archived" && (
              <button
                disabled={busy || selectedIds.length === 0}
                onClick={() =>
                  runBulk(
                    deleteFn,
                    "Permanently deleted",
                    "Permanently DELETE {n} archived project(s) along with all tasks, comments, and attachments? This cannot be undone.",
                  )
                }
                className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-red-700 disabled:opacity-40 hover:bg-red-100"
              >
                Delete forever
              </button>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-white overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-2">Project</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Event</th>
                <th className="px-4 py-2">Tasks</th>
                <th className="px-4 py-2">Members</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                    No projects found.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => {
                  const isArchived = Boolean(row.archived_at);
                  return (
                    <tr
                      key={row.id}
                      className={`border-t hover:bg-muted/30 ${isArchived ? "opacity-70" : ""}`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(checked[row.id])}
                          onChange={(e) =>
                            setChecked((prev) => ({ ...prev, [row.id]: e.target.checked }))
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {row.color && (
                            <span
                              className="inline-block h-3 w-3 rounded-full border"
                              style={{ background: row.color }}
                            />
                          )}
                          <div className="font-medium">{row.name}</div>
                        </div>
                        {row.description && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {row.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div>{row.owner_display_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.owner_email ?? formatOwnerId(row.owner_user_id)}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {row.event_id ? (
                          <Link
                            to="/events/$eventId"
                            params={{ eventId: row.event_id }}
                            className="text-velvet hover:underline"
                          >
                            {row.event_id.slice(0, 10)}…
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">{row.task_count}</td>
                      <td className="px-4 py-2 text-xs">{row.member_count}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {formatTimestamp((row.updated_at))}
                      </td>
                      <td className="px-4 py-2">
                        {isArchived ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800">
                            Archived
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-800">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: row.id }}
                          className="text-xs text-velvet hover:underline mr-3"
                        >
                          Open
                        </Link>
                        <button
                          onClick={() => openEdit(row)}
                          className="text-xs text-velvet hover:underline mr-3"
                        >
                          Manage
                        </button>
                        {isArchived ? (
                          <>
                            <button
                              onClick={() =>
                                restoreFn({ data: { ids: [row.id] } })
                                  .then(() => {
                                    toast.success("Restored");
                                    void load();
                                  })
                                  .catch((e) => toast.error(toUserMessage(e, "Failed")))
                              }
                              className="text-xs text-emerald-700 hover:underline mr-3"
                            >
                              Restore
                            </button>
                            <button
                              onClick={async () => {
                                if (
                                  !(await confirmDialog({
                                    title: "Permanently delete this project?",
                                    body: "All tasks, comments, and attachments will be removed. This cannot be undone.",
                                    confirmLabel: "Yes, delete forever",
                                    tone: "danger",
                                  }))
                                )
                                  return;
                                deleteFn({ data: { ids: [row.id] } })
                                  .then(() => {
                                    toast.success("Deleted");
                                    void load();
                                  })
                                  .catch((e) => toast.error(toUserMessage(e, "Failed")));
                              }}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Delete forever
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() =>
                              archiveFn({ data: { ids: [row.id] } })
                                .then(() => {
                                  toast.success("Archived");
                                  void load();
                                })
                                .catch((e) => toast.error(toUserMessage(e, "Failed")))
                            }
                            className="text-xs text-amber-700 hover:underline"
                          >
                            Archive
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        <AdminPaginationBar
          math={pageMath(total, offset, limit)}
          noun="projects"
          busy={loading}
          onPrev={() => setOffset(Math.max(0, offset - limit))}
          onNext={() => setOffset(offset + limit)}
        />

        <p className="text-xs text-muted-foreground">
          Archive is a soft delete — restore any time. Permanent deletion is only available from the Archive view and removes all related tasks, comments, and attachments.
        </p>

      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div>
                <h2 className="font-serif text-xl">Manage project</h2>
                <p className="text-xs text-muted-foreground font-mono">{selected.id}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="overflow-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider">Name</label>
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wider">Color</label>
                  <input
                    value={draftColor}
                    onChange={(e) => setDraftColor(e.target.value)}
                    placeholder="#a78bfa"
                    className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider">Description</label>
                <textarea
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider">
                  Linked event id (optional)
                </label>
                <input
                  value={draftEventId}
                  onChange={(e) => setDraftEventId(e.target.value)}
                  placeholder="(none)"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono"
                />
              </div>

              <div className="border-t pt-3">
                <h3 className="text-sm font-semibold">Members ({detail?.members.length ?? "—"})</h3>
                {!detail && <p className="text-xs text-muted-foreground mt-1">Loading…</p>}
                {detail && (
                  <ul className="mt-2 divide-y rounded-md border">
                    {detail.members.map((m) => (
                      <li
                        key={m.user_id}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="font-medium">
                            {m.display_name ?? m.email ?? m.user_id.slice(0, 8)}
                            <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                              {m.role}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {m.email ?? m.user_id}
                          </div>
                        </div>
                        {m.role !== "owner" && (
                          <button
                            onClick={() => removeMember(m.user_id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t pt-3">
                <h3 className="text-sm font-semibold">Transfer ownership</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Enter the new owner's user id (UUID). The current owner becomes detached unless re-invited.
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    placeholder="user uuid"
                    className="flex-1 rounded-md border px-3 py-2 text-xs font-mono"
                  />
                  <button
                    onClick={transferOwner}
                    disabled={!transferTo.trim()}
                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 disabled:opacity-40 hover:bg-amber-100"
                  >
                    Transfer
                  </button>
                </div>
              </div>

              <div className="border-t pt-3">
                <h3 className="text-sm font-semibold">Tasks ({detail?.tasks.length ?? "—"})</h3>
                {detail && detail.tasks.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">No tasks.</p>
                )}
                {detail && detail.tasks.length > 0 && (
                  <div className="mt-2 max-h-56 overflow-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-left uppercase tracking-wider">
                        <tr>
                          <th className="px-2 py-1">Title</th>
                          <th className="px-2 py-1">Status</th>
                          <th className="px-2 py-1">Due</th>
                          <th className="px-2 py-1">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.tasks.map((t) => (
                          <tr key={t.id} className="border-t">
                            <td className="px-2 py-1">{t.title}</td>
                            <td className="px-2 py-1">{t.status}</td>
                            <td className="px-2 py-1">{t.due_date ?? "—"}</td>
                            <td className="px-2 py-1 text-muted-foreground">
                              {formatStampDate((t.updated_at))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <button
                onClick={() => setSelected(null)}
                className="rounded-md border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-md bg-velvet px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-velvet/90"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
