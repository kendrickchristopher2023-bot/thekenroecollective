import { toUserMessage } from "@/lib/user-error";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Users } from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { SkeletonPanel } from "@/components/skeletons";
import { EmptyState } from "@/components/empty-state";

import {
  listContacts,
  upsertContact,
  deleteContact,
  hasContactsAccess,
  importContactsCsv,
  exportContactsCsv,
  listGroups,
  createGroup,
  addToGroup,
  setContactEmailPref,
  findContactDuplicates,
  mergeContacts,
  sendContactBroadcast,
  bulkTagContacts,
  bulkDeleteContacts,
  listBroadcasts,
} from "@/lib/contacts.functions";

import { confirmDialog, promptDialog } from "@/lib/confirm-dialog";
import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { formatTimestamp } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/contacts/")({
  head: () => ({
    meta: [
      { title: "Contacts — The Kenroe Collective" },
      { name: "description", content: "Your Atelier contacts directory: reusable guests, groups, and event history." },
    ],
  }),
  component: ContactsPage,
});

type Contact = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  source: string;
  created_at: string;
  email_opt_out?: boolean;
};
type Group = { id: string; name: string; color: string | null };

function ContactsPage() {
  const gate = useServerFn(hasContactsAccess);
  const fetchAll = useServerFn(listContacts);
  const save = useServerFn(upsertContact);
  const del = useServerFn(deleteContact);
  const importCsv = useServerFn(importContactsCsv);
  const exportCsv = useServerFn(exportContactsCsv);
  const loadGroups = useServerFn(listGroups);
  const addGroup = useServerFn(createGroup);
  const putInGroup = useServerFn(addToGroup);
  const setEmailPref = useServerFn(setContactEmailPref);
  const findDupes = useServerFn(findContactDuplicates);
  const doMerge = useServerFn(mergeContacts);
  const doBroadcast = useServerFn(sendContactBroadcast);
  const doBulkTag = useServerFn(bulkTagContacts);
  const doBulkDelete = useServerFn(bulkDeleteContacts);
  const loadBroadcasts = useServerFn(listBroadcasts);

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"contacts" | "broadcasts">("contacts");
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [dupeGroups, setDupeGroups] = useState<any[] | null>(null);
  const [dupeOpen, setDupeOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [allTagsSource, setAllTagsSource] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());


  useEffect(() => {
    gate().then((r) => setAllowed(r.allowed)).catch(() => setAllowed(false));
  }, []);

  const refresh = () => {
    fetchAll({ data: { search: search || undefined, tag: tagFilter || undefined, groupId: groupFilter || undefined } })
      .then((r) => setContacts(r.contacts as Contact[]));
    loadGroups().then((r) => setGroups(r.groups as Group[]));
  };

  // Separate, always-unfiltered fetch so the tag filter bar doesn't collapse
  // to just the active tag once one is selected (allTags was previously
  // derived from the already-tag-filtered `contacts` list). Only refetches
  // when the tag set could actually change, not on every search keystroke.
  const refreshTags = () => {
    fetchAll({ data: {} }).then((r) => setAllTagsSource(r.contacts as Contact[]));
  };

  const refreshBroadcasts = () => {
    loadBroadcasts().then((r) => setBroadcasts((r as any).broadcasts || [])).catch(() => setBroadcasts([]));
  };

  useEffect(() => {
    if (allowed) refresh();
  }, [allowed, search, tagFilter, groupFilter]);

  useEffect(() => {
    if (allowed) refreshTags();
  }, [allowed]);

  useEffect(() => {
    if (allowed && tab === "broadcasts") refreshBroadcasts();
  }, [allowed, tab]);


  const allTags = useMemo(() => {
    const s = new Set<string>();
    allTagsSource.forEach((c) => (c.tags || []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [allTagsSource]);

  if (allowed === null) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-5xl px-6 py-12"><SkeletonPanel /></div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-lg px-6 py-20 text-center">
          <div className="rounded-3xl bg-card p-10 ring-1 ring-ink/5">
            <div className="text-3xl">✦</div>
            <h1 className="mt-4 font-serif text-3xl">Contacts is an Atelier feature</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Keep a reusable directory of guests, tag them, group them, and pull them into any event.
              Available on the Atelier tier.
            </p>
            <Link
              to="/pricing"
              className="mt-6 inline-flex rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white"
            >
              See Atelier pricing →
            </Link>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  async function saveContact() {
    if (!editing) return;
    setBusy(true);
    try {
      await save({ data: editing as any });
      toast.success(editing.id ? "Updated" : "Contact added");
      setEditing(null);
      refresh();
    } catch (e) {
      toast.error(toUserMessage(e, "Failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onImport(file: File) {
    const text = await file.text();
    try {
      const r = await importCsv({ data: { csv: text } });
      const capNote = (r as any).capped ? " · file capped at daily limit" : "";
      toast.success(`Imported ${r.inserted} contact${r.inserted === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} skipped)` : ""}${capNote}`);
      refresh();
    } catch (e) {
      toast.error(toUserMessage(e, "Import failed"));
    }
  }

  async function onExport() {
    const r = await exportCsv();
    const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-6xl xl:max-w-7xl px-6 py-10 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl">Contacts</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your Atelier directory of people. Reuse them across events, tag, group, and track history.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setEditing({ display_name: "", email: "", phone: "", tags: [] })}
              className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white"
            >
              + Add contact
            </button>
            <label className="rounded-full bg-secondary px-4 py-2 text-xs cursor-pointer">
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onImport(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button onClick={onExport} className="rounded-full bg-secondary px-4 py-2 text-xs">Export CSV</button>
            <button
              onClick={async () => {
                setDupeOpen(true);
                setDupeGroups(null);
                try {
                  const r = await findDupes();
                  setDupeGroups(r.groups || []);
                } catch (e) {
                  toast.error(toUserMessage(e, "Failed"));
                  setDupeOpen(false);
                }
              }}
              className="rounded-full bg-secondary px-4 py-2 text-xs"
            >
              Find duplicates
            </button>
            <button
              onClick={() => setBroadcastOpen(true)}
              className="rounded-full bg-velvet/90 px-4 py-2 text-xs font-medium text-white"
            >
              ✉ Send broadcast
            </button>
          </div>
        </header>

        <div className="flex gap-1 border-b border-ink/10">
          {(["contacts", "broadcasts"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize ${tab === t ? "border-b-2 border-velvet text-velvet" : "text-muted-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "contacts" && (
          <>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="min-w-64 flex-1 rounded-full border border-ink/10 bg-paper px-4 py-2 text-sm"
          />
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setTagFilter(null)}
                className={`rounded-full px-3 py-1 text-xs ${!tagFilter ? "bg-velvet text-white" : "bg-secondary"}`}
              >
                All
              </button>
              {allTags.map((t) => (
                <button
                  key={t}
                  onClick={() => setTagFilter(t === tagFilter ? null : t)}
                  className={`rounded-full px-3 py-1 text-xs ${t === tagFilter ? "bg-velvet text-white" : "bg-secondary"}`}
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-card p-3 ring-1 ring-ink/5">
          <div className="text-xs font-medium text-muted-foreground">Groups</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {groups.length === 0 && (
              <span className="text-xs text-muted-foreground">No groups yet — create one to organize contacts.</span>
            )}
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setGroupFilter(g.id === groupFilter ? null : g.id)}
                className={`rounded-full px-3 py-1 text-xs ${g.id === groupFilter ? "bg-velvet text-white" : "bg-secondary"}`}
              >
                {g.name}
              </button>
            ))}
            <button
              onClick={async () => {
                const name = await promptDialog({ title: "New group name", confirmLabel: "Create" });
                if (!name) return;
                await addGroup({ data: { name } });
                refresh();
              }}
              className="rounded-full bg-velvet/10 px-3 py-1 text-xs text-velvet"
            >
              + New group
            </button>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-velvet/10 px-4 py-3 text-sm">
            <span className="font-medium text-velvet">{selected.size} selected</span>
            <button
              onClick={async () => {
                const tag = await promptDialog({ title: "Add tag to selected contacts", confirmLabel: "Add" });
                if (!tag) return;
                await doBulkTag({ data: { ids: Array.from(selected), addTags: [tag.trim()] } });
                toast.success(`Tagged ${selected.size} contacts`);
                setSelected(new Set());
                refresh();
                refreshTags();
              }}
              className="rounded-full bg-card px-3 py-1 text-xs"
            >Add tag</button>
            <button
              onClick={async () => {
                const tag = await promptDialog({ title: "Remove tag from selected contacts", confirmLabel: "Remove" });
                if (!tag) return;
                await doBulkTag({ data: { ids: Array.from(selected), removeTags: [tag.trim()] } });
                toast.success("Tag removed");
                setSelected(new Set());
                refresh();
                refreshTags();
              }}
              className="rounded-full bg-card px-3 py-1 text-xs"
            >Remove tag</button>
            <button
              onClick={async () => {
                if (groups.length === 0) {
                  toast.error("Create a group first, then add contacts to it.");
                  return;
                }
                const names = groups.map((g) => g.name).join(", ");
                const name = await promptDialog({
                  title: "Add selected contacts to group",
                  body: `Existing groups: ${names}`,
                  confirmLabel: "Add",
                });
                if (!name) return;
                const group = groups.find((g) => g.name.toLowerCase() === name.trim().toLowerCase());
                if (!group) {
                  toast.error(`No group named "${name}" — check spelling or create it first.`);
                  return;
                }
                await putInGroup({ data: { groupId: group.id, contactIds: Array.from(selected) } });
                toast.success(`Added ${selected.size} contact${selected.size === 1 ? "" : "s"} to ${group.name}`);
                setSelected(new Set());
                refresh();
              }}
              className="rounded-full bg-card px-3 py-1 text-xs"
            >Add to group</button>
            <button
              onClick={() => setBroadcastOpen(true)}
              className="rounded-full bg-velvet px-3 py-1 text-xs text-white"
            >Broadcast to selection</button>
            <button
              onClick={async () => {
                if (!(await confirmDialog({ title: `Delete ${selected.size} contacts?`, body: "This cannot be undone." }))) return;
                await doBulkDelete({ data: { ids: Array.from(selected) } });
                toast.success(`Deleted ${selected.size} contacts`);
                setSelected(new Set());
                refresh();
                refreshTags();
              }}
              className="rounded-full bg-red-500 px-3 py-1 text-xs text-white"
            >Delete</button>
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto text-xs text-muted-foreground hover:underline"
            >Clear</button>
          </div>
        )}

        {/* Mobile: card list (visible below sm) */}
        <div className="space-y-2 sm:hidden">
          {contacts.map((c) => (
            <div key={c.id} className="rounded-2xl bg-card p-4 ring-1 ring-ink/5">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={(e) => {
                    setSelected((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(c.id); else next.delete(c.id);
                      return next;
                    });
                  }}
                  className="mt-1.5 h-5 w-5 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: c.id }}
                    className="block break-anywhere text-base font-semibold text-ink hover:text-velvet"
                  >
                    {c.display_name}
                  </Link>
                  {c.email && (
                    <div className="mt-0.5 break-anywhere text-sm text-muted-foreground">{c.email}</div>
                  )}
                  {c.phone && (
                    <div className="mt-0.5 text-sm text-muted-foreground">{c.phone}</div>
                  )}
                  {(c.tags || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(c.tags || []).map((t) => (
                        <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">#{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    <button onClick={() => setEditing(c)} className="min-h-11 rounded-full bg-secondary px-4 py-1.5 font-medium text-velvet">Edit</button>
                    <button
                      onClick={async () => {
                        if (!(await confirmDialog({ title: "Delete contact?", body: c.display_name }))) return;
                        await del({ data: { id: c.id } });
                        refresh();
                      }}
                      className="min-h-11 rounded-full bg-rose-50 px-4 py-1.5 font-medium text-rose-600 ring-1 ring-rose-200"
                    >
                      Delete
                    </button>
                    <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={!!c.email_opt_out}
                        onChange={async (e) => {
                          try {
                            await setEmailPref({ data: { id: c.id, emailOptOut: e.target.checked } });
                            refresh();
                          } catch (err) {
                            toast.error(toUserMessage(err, "Failed"));
                          }
                        }}
                      />
                      No email
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {contacts.length === 0 && (
            <EmptyState
              icon={Users}
              title="No contacts yet"
              description="Contacts are your reusable guest book. Add people once, then pull them into any event."
              cta={{ label: "Add a contact", onClick: () => setEditing({ display_name: "", email: "", phone: "", tags: [] }) }}
              tips={[
                "Have a spreadsheet? Use Import CSV at the top of this page.",
                "Tag people (family, work, neighbors) to send to a group later.",
              ]}
            />
          )}

        </div>

        {/* Desktop / tablet: table (sm and up) */}
        <div className="hidden overflow-x-auto rounded-2xl bg-card ring-1 ring-ink/5 sm:block">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={contacts.length > 0 && selected.size === contacts.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(contacts.map((c) => c.id)) : new Set())}
                  />
                </th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Tags</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-t border-ink/5">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={(e) => {
                        setSelected((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.add(c.id); else next.delete(c.id);
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to="/contacts/$contactId"
                      params={{ contactId: c.id }}
                      className="text-ink hover:text-velvet hover:underline"
                    >
                      {c.display_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags || []).map((t) => (
                        <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">#{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <label className="mr-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={!!c.email_opt_out}
                        onChange={async (e) => {
                          try {
                            await setEmailPref({ data: { id: c.id, emailOptOut: e.target.checked } });
                            refresh();
                          } catch (err) {
                            toast.error(toUserMessage(err, "Failed"));
                          }
                        }}
                      />
                      No email
                    </label>
                    <button onClick={() => setEditing(c)} className="text-xs text-velvet hover:underline">Edit</button>
                    <button
                      onClick={async () => {
                        if (!(await confirmDialog({ title: "Delete contact?", body: c.display_name }))) return;
                        await del({ data: { id: c.id } });
                        refresh();
                      }}
                      className="ml-3 text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
                    <EmptyState
                      icon={Users}
                      title="No contacts yet"
                      description="Contacts are your reusable guest book. Add people once, then pull them into any event."
                      cta={{ label: "Add a contact", onClick: () => setEditing({ display_name: "", email: "", phone: "", tags: [] }) }}
                      tips={[
                        "Have a spreadsheet? Use Import CSV at the top of this page.",
                        "Tag people (family, work, neighbors) to send to a group later.",
                      ]}
                    />
                  </td>
                </tr>
              )}

            </tbody>
          </table>
        </div>
          </>
        )}

        {tab === "broadcasts" && (
          broadcasts.length === 0 ? (
            <EmptyState
              icon={Send}
              title="No broadcasts yet"
              description="Send one message to a whole group of contacts at once. Every send shows up here with delivery counts."
              cta={{ label: "Back to contacts", onClick: () => setTab("contacts") }}
              tips={[
                "Tag your contacts first, then send to just that tag.",
                'Anyone marked "No email" is skipped automatically.',
              ]}
            />
          ) : (
          <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-ink/5">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Sent</th>
                  <th className="px-4 py-2">Subject</th>
                  <th className="px-4 py-2">Filter</th>
                  <th className="px-4 py-2 text-right">Recipients</th>
                  <th className="px-4 py-2 text-right">Queued</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b) => (
                  <tr key={b.id} className="border-t border-ink/5">
                    <td className="px-4 py-3 text-muted-foreground">{formatTimestamp((b.sent_at))}</td>
                    <td className="px-4 py-3 font-medium">{b.subject}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{b.filter_tag ? `#${b.filter_tag}` : "all"}</td>
                    <td className="px-4 py-3 text-right">{b.recipient_count}</td>
                    <td className="px-4 py-3 text-right text-velvet">{b.queued_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )

        )}
      </div>


      {editing && (
        <EditContactModal
          contact={editing}
          busy={busy}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={saveContact}
        />
      )}

      {dupeOpen && (
        <DuplicatesModal
          groups={dupeGroups}
          onClose={() => setDupeOpen(false)}
          onMerge={async (primaryId, mergeIds) => {
            try {
              const r = await doMerge({ data: { primaryId, mergeIds } });
              toast.success(`Merged ${r.merged} contact${r.merged === 1 ? "" : "s"}`);
              const fresh = await findDupes();
              setDupeGroups(fresh.groups || []);
              refresh();
            } catch (e) {
              toast.error(toUserMessage(e, "Merge failed"));
            }
          }}
        />
      )}

      {broadcastOpen && (
        <BroadcastModal
          allTags={allTags}
          selectedCount={selected.size}
          onClose={() => setBroadcastOpen(false)}
          onSend={async (payload) => {
            try {
              const withIds = selected.size > 0
                ? { ...payload, ids: Array.from(selected) }
                : payload;
              const r = await doBroadcast({ data: withIds });
              toast.success(
                payload.dryRun
                  ? `${r.recipients} recipient${r.recipients === 1 ? "" : "s"} would receive this`
                  : `Queued ${r.queued} email${r.queued === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} skipped` : ""}`,
              );
              if (!payload.dryRun) {
                setBroadcastOpen(false);
                setSelected(new Set());
              }
              return r;
            } catch (e) {
              toast.error(toUserMessage(e, "Failed"));
              throw e;
            }
          }}
        />
      )}


      <SiteFooter />
    </div>
  );
}

function EditContactModal({
  contact,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  contact: Partial<Contact>;
  busy: boolean;
  onChange: (c: Partial<Contact>) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const dialogRef = useDialogA11y(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-2xl">{contact.id ? "Edit contact" : "Add contact"}</h2>
        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-muted-foreground">Name *</span>
            <input
              value={contact.display_name || ""}
              onChange={(e) => onChange({ ...contact, display_name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Email</span>
            <input
              type="email"
              value={contact.email || ""}
              onChange={(e) => onChange({ ...contact, email: e.target.value })}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Phone</span>
            <input
              value={contact.phone || ""}
              onChange={(e) => onChange({ ...contact, phone: e.target.value })}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Tags (comma-separated)</span>
            <input
              value={(contact.tags || []).join(", ")}
              onChange={(e) => onChange({ ...contact, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full bg-secondary px-4 py-2 text-xs">Cancel</button>
          <button
            disabled={busy}
            onClick={onSave}
            className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

type DupeContact = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  source: string;
  created_at: string;
};
type DupeGroup = { key: string; kind: "name" | "email" | "phone"; contacts: DupeContact[] };

function DuplicatesModal({
  groups,
  onClose,
  onMerge,
}: {
  groups: DupeGroup[] | null;
  onClose: () => void;
  onMerge: (primaryId: string, mergeIds: string[]) => Promise<void>;
}) {
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const dialogRef = useDialogA11y(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-paper shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink/5 px-6 py-4">
          <h2 className="font-serif text-2xl">Duplicate contacts</h2>
          <button onClick={onClose} className="rounded-full bg-secondary px-3 py-1 text-xs">Close</button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
          {groups === null && (
            <div className="py-12 text-center text-sm text-muted-foreground">Scanning…</div>
          )}
          {groups && groups.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No duplicates found. Your directory is clean.
            </div>
          )}
          {groups && groups.map((g) => {
            const gid = g.kind + ":" + g.key;
            const primaryId = primaryByGroup[gid] || g.contacts[0].id;
            const mergeIds = g.contacts.filter((c) => c.id !== primaryId).map((c) => c.id);
            return (
              <div key={gid} className="rounded-xl bg-card p-3 ring-1 ring-ink/5">
                <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Match by {g.kind}: <span className="text-ink">{g.key}</span>
                </div>
                <div className="space-y-2">
                  {g.contacts.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-secondary/40">
                      <input
                        type="radio"
                        name={`primary-${gid}`}
                        checked={primaryId === c.id}
                        onChange={() => setPrimaryByGroup((p) => ({ ...p, [gid]: c.id }))}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{c.display_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.email || "no email"} · {c.phone || "no phone"} · {c.source}
                        </div>
                        {c.tags && c.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.tags.map((t) => (
                              <span key={t} className="rounded-full bg-secondary px-2 py-0.5 text-[11px]">#{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    disabled={busyKey === gid || mergeIds.length === 0}
                    onClick={async () => {
                      setBusyKey(gid);
                      try {
                        await onMerge(primaryId, mergeIds);
                      } finally {
                        setBusyKey(null);
                      }
                    }}
                    className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {busyKey === gid ? "Merging…" : `Merge ${mergeIds.length} into selected`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type BroadcastPayload = {
  subject: string;
  body: string;
  tag?: string | null;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  dryRun?: boolean;
};

function BroadcastModal({
  allTags,
  selectedCount,
  onClose,
  onSend,
}: {
  allTags: string[];
  selectedCount?: number;
  onClose: () => void;
  onSend: (payload: BroadcastPayload) => Promise<{ queued: number; skipped: number; recipients: number }>;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<string>("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const scopedToSelection = (selectedCount || 0) > 0;
  const dialogRef = useDialogA11y(onClose);

  const build = (dryRun: boolean): BroadcastPayload => ({
    subject,
    body,
    tag: scopedToSelection ? null : (tag || null),
    ctaUrl: ctaUrl.trim() || null,
    ctaLabel: ctaLabel.trim() || null,
    dryRun,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-paper p-6 shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-2xl">Send broadcast</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {scopedToSelection
            ? `Sending only to your ${selectedCount} selected contact${selectedCount === 1 ? "" : "s"}. Opted-out contacts are excluded.`
            : "Emails your contacts. Opted-out contacts and those without an email are automatically excluded. Limits: 200/hour, 500/day."}
        </p>



        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-muted-foreground">Filter by tag (optional)</span>
            <select
              value={tag}
              onChange={(e) => { setTag(e.target.value); setPreview(null); }}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-paper px-3 py-2"
            >
              <option value="">All contacts</option>
              {allTags.map((t) => (
                <option key={t} value={t}>#{t}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Subject *</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Message *</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              maxLength={8000}
              className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">Button URL (optional)</span>
              <input
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Button label</span>
              <input
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="RSVP"
                className="mt-1 w-full rounded-lg border border-ink/15 px-3 py-2"
              />
            </label>
          </div>
        </div>

        {preview !== null && (
          <div className="mt-4 rounded-xl bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
            This will reach <strong className="text-ink">{preview}</strong> contact{preview === 1 ? "" : "s"}.
          </div>
        )}

        <div className="mt-6 flex justify-between gap-2">
          <button onClick={onClose} className="rounded-full bg-secondary px-4 py-2 text-xs">Cancel</button>
          <div className="flex gap-2">
            <button
              disabled={busy || !subject.trim() || !body.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await onSend(build(true));
                  setPreview(r.recipients);
                } catch { /* toast handled */ }
                finally { setBusy(false); }
              }}
              className="rounded-full bg-secondary px-4 py-2 text-xs disabled:opacity-50"
            >
              Preview count
            </button>
            <button
              disabled={busy || !subject.trim() || !body.trim()}
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `Send this broadcast${preview !== null ? ` to ${preview} contact${preview === 1 ? "" : "s"}` : ""}?`,
                  confirmLabel: "Send",
                  tone: "info",
                });
                if (!ok) return;
                setBusy(true);
                try { await onSend(build(false)); }
                catch { /* toast handled */ }
                finally { setBusy(false); }
              }}
              className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
