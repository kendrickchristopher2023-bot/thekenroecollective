import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import {
  adminArchiveEvents,
  adminDeleteEvents,
  adminRestoreEvents,
  adminUpdateEvent,
  listAllEventsAdminPage,
  meCanAdminEvents,
} from "@/lib/events-admin.functions";
import type {
  AdminEventDemoFilter,
  AdminEventRow,
  AdminEventSort,
} from "@/lib/events-admin.types";
import { AdminPaginationBar, AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { csvFileStem, exportCsv, pageMath } from "@/lib/admin-table";
import { confirmDialog } from "@/lib/confirm-dialog";
import { formatOwnerId, formatOwnerLabel } from "@/lib/format-owner";
import { OwnerMfaGate } from "@/components/owner-mfa-gate";
import { AdminGuestEditor } from "@/components/admin/admin-guest-editor";
import { formatTimestamp } from "@/lib/datetime";

type Scope = "active" | "archived" | "all";

// JSON.parse's SyntaxError only gives a raw string offset (when it gives one
// at all) — translate that into a line/column an admin can actually use to
// find the typo, instead of a generic "Invalid JSON".
function jsonErrorMessage(e: unknown, source: string): string {
  const message = toUserMessage(e, "Invalid JSON");
  const match = message.match(/position (\d+)/);
  if (!match) return message;
  const pos = Number(match[1]);
  const upToError = source.slice(0, pos);
  const line = upToError.split("\n").length;
  const column = pos - upToError.lastIndexOf("\n");
  return `${message} (line ${line}, column ${column})`;
}

export const Route = createFileRoute("/_authenticated/owner-events")({
  head: () => ({ meta: [{ title: "All events — Owner console" }] }),
  component: () => (
    <OwnerMfaGate>
      <OwnerEventsPage />
    </OwnerMfaGate>
  ),
});

function OwnerEventsPage() {
  const checkAccess = useServerFn(meCanAdminEvents);
  const listFn = useServerFn(listAllEventsAdminPage);
  const updateFn = useServerFn(adminUpdateEvent);
  const archiveFn = useServerFn(adminArchiveEvents);
  const restoreFn = useServerFn(adminRestoreEvents);
  const deleteFn = useServerFn(adminDeleteEvents);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<AdminEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [hostEmail, setHostEmail] = useState("");
  const [scope, setScope] = useState<Scope>("active");
  const [demo, setDemo] = useState<AdminEventDemoFilter>("production");
  const [sort, setSort] = useState<AdminEventSort>("updated_desc");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<AdminEventRow | null>(null);
  const [draftJson, setDraftJson] = useState("");
  const [editTab, setEditTab] = useState<"guests" | "json">("guests");
  const [draftSlug, setDraftSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkAccess()
      .then((r) => setAllowed(r.allowed))
      .catch(() => setAllowed(false));
  }, [checkAccess]);

  type Query = {
    search: string;
    hostEmail: string;
    scope: Scope;
    demo: AdminEventDemoFilter;
    sort: AdminEventSort;
    offset: number;
    limit: number;
  };

  const currentQuery = (): Query => ({ search, hostEmail, scope, demo, sort, offset, limit });

  const load = async (q: Query) => {
    setLoading(true);
    try {
      const res = await listFn({ data: q });
      setRows(res.rows);
      setTotal(res.total);
      setChecked({});
    } catch (e: unknown) {
      toast.error(toUserMessage(e, "Failed to load events"));
    } finally {
      setLoading(false);
    }
  };

  // Any filter change resets to page 1; only `offset` moves the page.
  useEffect(() => {
    if (!allowed) return;
    void load({ search, hostEmail, scope, demo, sort, offset, limit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, search, hostEmail, scope, demo, sort, offset, limit]);

  const resetPage = () => setOffset(0);

  /** CSV always mirrors the active filters, not just the visible page. */
  const exportFiltered = async () => {
    setExporting(true);
    try {
      const res = await listFn({ data: { ...currentQuery(), offset: 0, limit: 500 } });
      exportCsv(
        csvFileStem("events", `${scope}-${demo}`),
        res.rows,
        [
          { header: "Event ID", value: (r: AdminEventRow) => r.id },
          { header: "Title", value: (r: AdminEventRow) => (r.data as { title?: string })?.title ?? "" },
          { header: "Host name", value: (r: AdminEventRow) => (r.data as { hostName?: string })?.hostName ?? "" },
          { header: "Slug", value: (r: AdminEventRow) => r.branded_slug ?? "" },
          { header: "Owner", value: (r: AdminEventRow) => r.owner_display_name ?? "" },
          { header: "Owner email", value: (r: AdminEventRow) => r.owner_email ?? "" },
          { header: "Demo", value: (r: AdminEventRow) => (r.is_demo ? "yes" : "no") },
          { header: "Status", value: (r: AdminEventRow) => (r.archived_at ? "archived" : "active") },
          { header: "Created", value: (r: AdminEventRow) => r.created_at },
          { header: "Updated", value: (r: AdminEventRow) => r.updated_at },
        ],
      );
      if (res.total > res.rows.length) {
        toast.message(`Exported the first ${res.rows.length} of ${res.total} matching events. Narrow the filters to export the rest.`);
      } else {
        toast.success(`Exported ${res.rows.length} event${res.rows.length === 1 ? "" : "s"}`);
      }
    } catch (e: unknown) {
      toast.error(toUserMessage(e, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  // Live updates: when ANY event row changes anywhere in the system,
  // refresh the current view (debounced) so admins see edits, archives,
  // restores, and deletions made by other users in real time.
  const queryRef = useRef<Query>(currentQuery());
  useEffect(() => {
    queryRef.current = { search, hostEmail, scope, demo, sort, offset, limit };
  }, [search, hostEmail, scope, demo, sort, offset, limit]);
  useEffect(() => {
    if (!allowed) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("owner-events-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            void load(queryRef.current);
          }, 350);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);


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
      toast.success(`${label} ${selectedIds.length} event${selectedIds.length === 1 ? "" : "s"}`);
      await load(queryRef.current);
    } catch (e: unknown) {
      toast.error(toUserMessage(e, `Failed to ${label.toLowerCase()}`));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (row: AdminEventRow) => {
    setSelected(row);
    setDraftJson(JSON.stringify(row.data, null, 2));
    setEditTab("guests");
    setDraftSlug(row.branded_slug ?? "");
  };

  const save = async () => {
    if (!selected) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(draftJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Event data must be a JSON object");
      }
    } catch (e: unknown) {
      toast.error(jsonErrorMessage(e, draftJson));
      return;
    }
    if (!parsed.title || typeof parsed.title !== "string" || !parsed.title.trim()) {
      toast.error("Event data needs a non-empty \"title\" — the public event page depends on it.");
      return;
    }
    const before = new Set(Object.keys((selected.data as Record<string, unknown>) ?? {}));
    const after = new Set(Object.keys(parsed));
    const removedKeys = [...before].filter((k) => !after.has(k));
    if (removedKeys.length > 0) {
      const ok = await confirmDialog({
        title: `Remove ${removedKeys.length} field${removedKeys.length === 1 ? "" : "s"} from this event?`,
        body: `This edit deletes: ${removedKeys.join(", ")}. If any of these are used by the public event page, removing them can break it.`,
        confirmLabel: "Save anyway",
        tone: "danger",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      await updateFn({
        data: { id: selected.id, data: parsed, brandedSlug: draftSlug.trim() || null },
      });
      toast.success("Event saved");
      setSelected(null);
      await load(queryRef.current);
    } catch (e: unknown) {
      toast.error(toUserMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
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
      <div className="mx-auto max-w-7xl px-4 py-10 space-y-6 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl sm:text-4xl">
              All events
              <span className="ml-3 inline-block align-middle rounded-full bg-velvet/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-velvet">
                Owner
              </span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse, search, edit, archive, restore, or permanently delete events.
            </p>
          </div>
        </div>

        <AdminTableToolbar
          search={search}
          onSearch={(v) => { setSearch(v); resetPage(); }}
          searchPlaceholder="Search id, slug, title, host…"
          secondarySearch={{
            value: hostEmail,
            onChange: (v) => { setHostEmail(v); resetPage(); },
            placeholder: "Host email contains…",
            ariaLabel: "Host email",
          }}
          chips={[
            {
              label: "Status",
              value: scope,
              options: SCOPES.map((sc) => ({ value: sc.id, label: sc.label })),
              onChange: (v: Scope) => { setScope(v); resetPage(); },
            },
            {
              label: "Data",
              value: demo,
              options: [
                { value: "production", label: "Production" },
                { value: "demo", label: "Demo" },
                { value: "all", label: "Both" },
              ],
              onChange: (v: AdminEventDemoFilter) => { setDemo(v); resetPage(); },
            },
          ]}
          sort={{
            value: sort,
            options: [
              { value: "updated_desc", label: "Updated (newest)" },
              { value: "updated_asc", label: "Updated (oldest)" },
              { value: "created_desc", label: "Created (newest)" },
              { value: "created_asc", label: "Created (oldest)" },
              { value: "title_asc", label: "Title A–Z" },
              { value: "title_desc", label: "Title Z–A" },
            ],
            onChange: (v: AdminEventSort) => { setSort(v); resetPage(); },
          }}
          pageSize={limit}
          onPageSize={(n) => { setLimit(n); resetPage(); }}
          onExport={() => void exportFiltered()}
          exportLabel={exporting ? "Exporting…" : "Export CSV"}
          exportDisabled={exporting || loading}
          busy={loading}
          onRefresh={() => void load(queryRef.current)}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">


          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              {selectedIds.length} selected
            </span>
            {scope !== "archived" && (
              <button
                disabled={busy || selectedIds.length === 0}
                onClick={() =>
                  runBulk(archiveFn, "Archived", "Move {n} event(s) to archive?")
                }
                className="rounded-md border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/40"
              >
                Archive selected
              </button>
            )}
            {scope !== "active" && (
              <button
                disabled={busy || selectedIds.length === 0}
                onClick={() =>
                  runBulk(restoreFn, "Restored", "Restore {n} event(s) from archive?")
                }
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
                    "Permanently DELETE {n} archived event(s)? This cannot be undone.",
                  )
                }
                className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-red-700 disabled:opacity-40 hover:bg-red-100"
              >
                Delete forever
              </button>
            )}
          </div>
        </div>

        {/* Mobile: card list */}
        <div className="space-y-2 sm:hidden">
          {loading && (
            <div className="rounded-lg border bg-white p-6 text-center text-sm text-muted-foreground">Loading…</div>
          )}
          {!loading && rows.length === 0 && (
            <div className="rounded-lg border bg-white p-6 text-center text-sm text-muted-foreground">No events found.</div>
          )}
          {!loading && rows.map((row) => {
            const d = row.data as { title?: string; hostName?: string };
            const isArchived = Boolean(row.archived_at);
            return (
              <div key={row.id} className={`rounded-lg border bg-white p-4 ${isArchived ? "opacity-70" : ""}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(checked[row.id])}
                    onChange={(e) => setChecked((prev) => ({ ...prev, [row.id]: e.target.checked }))}
                    className="mt-1.5 h-5 w-5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1 break-anywhere text-base font-semibold">{d.title ?? "(untitled)"}</div>
                      {isArchived ? (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-800">Archived</span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-800">Active</span>
                      )}
                      {row.is_demo && (
                        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-800">Demo</span>
                      )}
                    </div>
                    {d.hostName && (
                      <div className="mt-0.5 text-xs text-muted-foreground">Host: {d.hostName}</div>
                    )}
                    <div className="mt-1 break-anywhere text-xs text-muted-foreground">
                      {row.branded_slug ? <>slug: <span className="text-ink">{row.branded_slug}</span> · </> : null}
                      {formatOwnerLabel(row.owner_display_name, row.owner_email, row.user_id, "unowned")}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Updated {formatTimestamp((row.updated_at))}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-sm">
                      <Link to="/events/$eventId" params={{ eventId: row.id }} className="min-h-11 rounded-full bg-secondary px-4 py-1.5 font-medium text-velvet">Open</Link>
                      <button onClick={() => openEdit(row)} className="min-h-11 rounded-full bg-secondary px-4 py-1.5 font-medium text-velvet">Edit</button>
                      {isArchived ? (
                        <>
                          <button
                            onClick={() => restoreFn({ data: { ids: [row.id] } }).then(() => { toast.success("Restored"); void load(queryRef.current); }).catch((e) => toast.error(toUserMessage(e, "Failed")))}
                            className="min-h-11 rounded-full bg-emerald-50 px-4 py-1.5 font-medium text-emerald-700 ring-1 ring-emerald-200"
                          >Restore</button>
                          <button
                            onClick={async () => {
                              if (!(await confirmDialog({ title: "Permanently delete this event? This cannot be undone." }))) return;
                              deleteFn({ data: { ids: [row.id] } }).then(() => { toast.success("Deleted"); void load(queryRef.current); }).catch((e) => toast.error(toUserMessage(e, "Failed")));
                            }}
                            className="min-h-11 rounded-full bg-rose-50 px-4 py-1.5 font-medium text-rose-600 ring-1 ring-rose-200"
                          >Delete forever</button>
                        </>
                      ) : (
                        <button
                          onClick={() => archiveFn({ data: { ids: [row.id] } }).then(() => { toast.success("Archived"); void load(queryRef.current); }).catch((e) => toast.error(toUserMessage(e, "Failed")))}
                          className="min-h-11 rounded-full bg-amber-50 px-4 py-1.5 font-medium text-amber-700 ring-1 ring-amber-200"
                        >Archive</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop/tablet: table */}
        <div className="hidden overflow-x-auto rounded-lg border bg-white sm:block">
          <table className="w-full text-sm">
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
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Slug</th>
                <th className="px-4 py-2">Owner</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No events found.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => {
                  const d = row.data as { title?: string; hostName?: string };
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
                        <div className="font-medium">{d.title ?? "(untitled)"}</div>
                        {d.hostName && (
                          <div className="text-xs text-muted-foreground">Host: {d.hostName}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{row.branded_slug ?? "—"}</td>
                      <td className="px-4 py-2">
                        <div>{row.owner_display_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.owner_email ?? formatOwnerId(row.user_id, "unowned")}
                        </div>
                      </td>
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
                        {row.is_demo && (
                          <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-800">
                            Demo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <Link
                          to="/events/$eventId"
                          params={{ eventId: row.id }}
                          className="text-xs text-velvet hover:underline mr-3"
                        >
                          Open
                        </Link>
                        <button
                          onClick={() => openEdit(row)}
                          className="text-xs text-velvet hover:underline mr-3"
                        >
                          Edit
                        </button>
                        {isArchived ? (
                          <>
                            <button
                              onClick={() =>
                                restoreFn({ data: { ids: [row.id] } })
                                  .then(() => {
                                    toast.success("Restored");
                                    void load(queryRef.current);
                                  })
                                  .catch((e) =>
                                    toast.error(toUserMessage(e, "Failed")),
                                  )
                              }
                              className="text-xs text-emerald-700 hover:underline mr-3"
                            >
                              Restore
                            </button>
                            <button
                              onClick={async () => {
                                if (!(await confirmDialog({ title: "Permanently delete this event? This cannot be undone." }))) return;
                                deleteFn({ data: { ids: [row.id] } })
                                  .then(() => {
                                    toast.success("Deleted");
                                    void load(queryRef.current);
                                  })
                                  .catch((e) =>
                                    toast.error(toUserMessage(e, "Failed")),
                                  );
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
                                  void load(queryRef.current);
                                })
                                .catch((e) =>
                                  toast.error(toUserMessage(e, "Failed")),
                                )
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
          noun="events"
          busy={loading}
          onPrev={() => setOffset(Math.max(0, offset - limit))}
          onNext={() => setOffset(offset + limit)}
        />

        <p className="text-xs text-muted-foreground">
          Archive is a soft delete — restore any time. Permanent deletion is only available from the Archive view.
        </p>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div>
                <h2 className="font-serif text-xl">Edit event</h2>
                <p className="text-xs text-muted-foreground font-mono">{selected.id}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-1 border-b px-5">
              {(["guests", "json"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setEditTab(t)}
                  className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium ${
                    editTab === t ? "border-velvet text-velvet" : "border-transparent text-muted-foreground"
                  }`}
                >
                  {t === "guests" ? "Guests" : "Raw JSON"}
                </button>
              ))}
            </div>
            <div className="overflow-auto px-5 py-4 space-y-3">
              <label className="block text-xs font-medium uppercase tracking-wider">
                Branded slug
              </label>
              <input
                value={draftSlug}
                onChange={(e) => setDraftSlug(e.target.value)}
                placeholder="(none)"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              {editTab === "guests" ? (
                <AdminGuestEditor json={draftJson} onChange={setDraftJson} />
              ) : (
                <>
                  <label className="block text-xs font-medium uppercase tracking-wider pt-2">
                    Event data (JSON)
                  </label>
                  <textarea
                    value={draftJson}
                    onChange={(e) => setDraftJson(e.target.value)}
                    spellCheck={false}
                    className="w-full h-[50vh] rounded-md border px-3 py-2 font-mono text-xs"
                  />
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <button
                onClick={() => setSelected(null)}
                className="rounded-md border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-md bg-velvet px-4 py-2 text-sm text-white hover:bg-velvet/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  );
}
