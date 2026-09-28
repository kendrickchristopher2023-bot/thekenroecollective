import { toUserMessage } from "@/lib/user-error";
import { formatDateOnly } from "@/lib/date-only";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { AiPackagesPanel } from "@/components/ai-packages-panel";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicEvent, formatEventDate, normalizeEvent, rsvpCounts, useEvents, type KEvent } from "@/lib/events-store";
import { isShowcaseEvent, SHOWCASE_EVENT_ID } from "@/lib/showcase";
import { EventLinkingUpgradeModal } from "@/components/projects-access-gate";
import { PM_ADDON_SEAT_LIMITS } from "@/lib/tier-limits";
import { getEntitlements, type Entitlements } from "@/lib/entitlements-client";
import { usePreviewTier } from "@/lib/preview-tier";
import { LanguagePicker } from "@/components/language-picker";
import { useLanguage, languageLabel, type LangCode } from "@/lib/i18n";
import { createPmInvite, listPmInvites, cancelPmInvite, getProjectMemberProfiles, resendPmInvite } from "@/lib/pm-invites.functions";
import { getProjectLinkedEvent, importTimelineToProject, type LinkedEventLabel } from "@/lib/pm-events.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm-dialog";
import { formatStampDate, formatStampTime, formatTimestamp } from "@/lib/datetime";

// Project ↔ Event linking is integrated with Host and Atelier. Postcard and
// Whisper with the Project Management add-on get standalone project management
// only — they cannot link projects to events.
function useCanLinkEvents() {
  const [state, setState] = useState<{ loading: boolean; canLink: boolean; ent: Entitlements | null }>(
    { loading: true, canLink: false, ent: null },
  );
  const previewTier = usePreviewTier();
  useEffect(() => {
    let active = true;
    getEntitlements()
      .then((ent) => {
        if (!active) return;
        const canLink =
          (ent.isOwner && !ent.previewing) || ent.tier === "atelier" || ent.tier === "host";
        setState({ loading: false, canLink, ent });
      })
      .catch(() => active && setState({ loading: false, canLink: false, ent: null }));
    return () => {
      active = false;
    };
  }, [previewTier]);
  return state;
}

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({ meta: [{ title: "Project — The Kenroe Collective" }] }),
  component: ProjectDetail,
});


type Project = {
  id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  color: string | null;
  event_id: string | null;
  language: string | null;
  archived_at: string | null;
};


type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  notes: string | null;
  color: string | null;
  status: TaskStatus;
  assignee_user_id: string | null;
  due_date: string | null;
  position: number;
  created_at: string;
};

type Member = {
  id: string;
  user_id: string;
  role: "admin" | "editor" | "viewer";
};

type Comment = {
  id: string;
  task_id: string;
  author_user_id: string;
  body: string;
  created_at: string;
};

type Attachment = {
  id: string;
  task_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploader_user_id: string;
  created_at: string;
};

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
];

const TASK_COLORS = [
  { value: "#3B82F6", label: "Blue" },
  { value: "#8B5CF6", label: "Violet" },
  { value: "#10B981", label: "Green" },
  { value: "#F59E0B", label: "Gold" },
  { value: "#EF4444", label: "Red" },
  { value: "#64748B", label: "Slate" },
];

type TaskDraft = {
  title: string;
  status: TaskStatus;
  description?: string;
  notes?: string;
  due_date?: string | null;
  color?: string | null;
  assignee_user_id?: string | null;
  files?: File[];
};

async function uploadTaskFiles(projectId: string, taskId: string, userId: string, files: File[]) {
  await Promise.all(
    files.map(async (file) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const path = `${projectId}/${taskId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from("pm-attachments").upload(path, file);
      if (error) return;
      await supabase.from("pm_task_attachments").insert({
        task_id: taskId,
        uploader_user_id: userId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
    }),
  );
}

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const events = useEvents();
  const fetchProjectLinkedEvent = useServerFn(getProjectLinkedEvent);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [showMembers, setShowMembers] = useState(false);

  // Kanban's drag-and-drop only works with a mouse — default touch/narrow
  // viewports to List, which has a directly visible status picker per row.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setView("list");
    }
  }, []);

  const isOwner = !!meId && !!project && project.owner_user_id === meId;
  const myRole: "admin" | "editor" | "viewer" | null = useMemo(() => {
    if (!meId) return null;
    if (isOwner) return "admin";
    const m = members.find((x) => x.user_id === meId);
    return m?.role ?? null;
  }, [meId, members, isOwner]);
  const canEdit = myRole === "admin" || myRole === "editor";
  // A board can be linked to the public sample wedding (the demo boards are),
  // which is never in anyone's own events list. Fetch its public shape instead
  // so the link and the run-of-show import still work for that one event.
  const [showcaseEvent, setShowcaseEvent] = useState<KEvent | null>(null);
  // An event the viewer does not own comes back as a minimal label only
  // (id, title, date, timezone). It is used for the dropdown label and the
  // badge; the Live data panel and timeline import keep using the full
  // event and stay limited to the viewer's own events and the sample wedding.
  const [foreignLinkedEvent, setForeignLinkedEvent] = useState<LinkedEventLabel | null>(null);
  const linkedIsShowcase = isShowcaseEvent(project?.event_id);
  useEffect(() => {
    if (!linkedIsShowcase) return;
    let cancelled = false;
    void fetchPublicEvent(SHOWCASE_EVENT_ID).then((ev) => {
      if (!cancelled && ev) setShowcaseEvent(ev);
    });
    return () => {
      cancelled = true;
    };
  }, [linkedIsShowcase]);
  useEffect(() => {
    if (!project?.event_id) {
      setForeignLinkedEvent(null);
      return;
    }
    if (events.some((event) => event.id === project.event_id)) return;
    if (linkedIsShowcase) return;
    let active = true;
    void fetchProjectLinkedEvent({ data: { projectId } }).then((ev) => {
      if (!active) return;
      setForeignLinkedEvent(ev ?? null);
    });
    return () => {
      active = false;
    };
  }, [project?.event_id, projectId, events, linkedIsShowcase]);
  // Full event, only when the viewer owns it or it is the public sample wedding.
  const linkedEvent = useMemo(
    () =>
      events.find((event) => event.id === project?.event_id) ??
      (linkedIsShowcase ? showcaseEvent : null),
    [events, project?.event_id, linkedIsShowcase, showcaseEvent],
  );
  const linkedEventTitle = linkedEvent?.title ?? foreignLinkedEvent?.title ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setMeId(u.user?.id ?? null);

    const { data: p } = await (supabase as any)
      .from("pm_projects")
      .select("id,owner_user_id,name,description,color,event_id,language,archived_at")
      .eq("id", projectId)
      .maybeSingle();
    setProject((p as Project) ?? null);

    const { data: t } = await supabase
      .from("pm_tasks")
      .select("id,project_id,title,description,notes,color,status,assignee_user_id,due_date,position,created_at")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    setTasks((t as Task[]) ?? []);

    const { data: m } = await supabase
      .from("pm_project_members")
      .select("id,user_id,role")
      .eq("project_id", projectId);
    setMembers((m as Member[]) ?? []);

    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTask(draft: TaskDraft) {
    if (!draft.title.trim() || !meId) return;
    const max = Math.max(0, ...tasks.filter((t) => t.status === draft.status).map((t) => t.position));
    const { data, error } = await supabase
      .from("pm_tasks")
      .insert({
        project_id: projectId,
        title: draft.title.trim(),
        description: draft.description?.trim() || null,
        notes: draft.notes?.trim() || null,
        color: draft.color || null,
        due_date: draft.due_date || null,
        assignee_user_id: draft.assignee_user_id || null,
        status: draft.status,
        position: max + 1,
        created_by: meId,
      })
      .select("id,project_id,title,description,notes,color,status,assignee_user_id,due_date,position,created_at")
      .single();
    if (!error && data) {
      setTasks((cur) => [...cur, data as Task]);
      if (draft.files?.length) await uploadTaskFiles(projectId, data.id, meId, draft.files);
    }
  }

  async function updateProject(patch: Partial<Project>) {
    if (!canEdit) return;
    setProject((current) => (current ? { ...current, ...patch } : current));
    await (supabase as any).from("pm_projects").update(patch).eq("id", projectId);
  }

  async function moveTask(taskId: string, status: TaskStatus) {
    setTasks((cur) => cur.map((t) => (t.id === taskId ? { ...t, status } : t)));
    await supabase.from("pm_tasks").update({ status }).eq("id", taskId);
  }

  async function updateTask(taskId: string, patch: Partial<Task>) {
    setTasks((cur) => cur.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
    if (openTask?.id === taskId) setOpenTask({ ...openTask, ...patch });
    await supabase.from("pm_tasks").update(patch).eq("id", taskId);
  }

  async function deleteTask(taskId: string) {
    setTasks((cur) => cur.filter((t) => t.id !== taskId));
    setOpenTask(null);
    await supabase.from("pm_tasks").delete().eq("id", taskId);
  }

  async function archiveProject() {
    if (!(await confirmDialog({ title: "Archive this project?" }))) return;
    await supabase.from("pm_projects").update({ archived_at: new Date().toISOString() }).eq("id", projectId);
    navigate({ to: "/projects" });
  }

  if (loading) {
    return (
      <div className="venture-projects min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-7xl px-6 py-20 text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="venture-projects min-h-screen bg-paper">
        <SiteNav />
        <div className="mx-auto max-w-7xl px-6 py-20">
          <h1 className="font-serif text-3xl">Project not found</h1>
          <Link to="/projects" className="mt-4 inline-block text-sm text-velvet hover:underline">
            ← Back to projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="venture-projects min-h-screen bg-paper">
      <SiteNav />
      <section className="border-b border-ink/5 py-10">
        <div className="mx-auto max-w-7xl px-6">
          <Link to="/projects" className="text-xs text-velvet hover:underline">
            ← All projects
          </Link>
          <div className="mt-4 flex items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: project.color ?? "#3B82F6" }}
                />
                <h1 className="font-serif text-4xl">{project.name}</h1>
              </div>
              {project.description && (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{project.description}</p>
              )}
              {linkedEvent && linkedIsShowcase && (
                <Link
                  to="/invite/$eventId"
                  params={{ eventId: SHOWCASE_EVENT_ID }}
                  className="mt-3 inline-flex rounded-full bg-velvet/10 px-3 py-1 text-xs font-medium text-velvet hover:bg-velvet/15"
                >
                  Linked to {linkedEvent.title} →
                </Link>
              )}
              {linkedEvent && !linkedIsShowcase && (
                <Link
                  to="/events/$eventId"
                  params={{ eventId: linkedEvent.id }}
                  className="mt-3 inline-flex rounded-full bg-velvet/10 px-3 py-1 text-xs font-medium text-velvet hover:bg-velvet/15"
                >
                  Linked to {linkedEvent.title} →
                </Link>
              )}
              {!linkedEvent && foreignLinkedEvent && (
                <span className="mt-3 inline-flex rounded-full bg-velvet/10 px-3 py-1 text-xs font-medium text-velvet">
                  Linked to {foreignLinkedEvent.title}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full bg-secondary p-1">
                {(["kanban", "list"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                      view === v ? "bg-paper text-ink shadow-sm" : "text-muted-foreground"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowMembers(true)}
                className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/70"
              >
                Members ({members.length + 1})
              </button>
              <button
                type="button"
                onClick={() => document.getElementById("project-packages-menus")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90"
              >
                Packages & Menus
              </button>
              {isOwner && (
                <button
                  onClick={archiveProject}
                  className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/70"
                >
                  Archive
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="py-10">
        <div className="mx-auto max-w-7xl space-y-6 px-6">
          <ProjectSettings
            project={project}
            events={events}
            linkedEvent={linkedEvent}
            linkedEventTitle={linkedEventTitle}
            canEdit={canEdit}
            onUpdate={updateProject}
          />
          {linkedEvent && (
            <EventIntegrationPanel
              event={linkedEvent}
              tasks={tasks}
              canEdit={canEdit}
              projectId={projectId}
              onImported={load}
            />
          )}
          {view === "kanban" ? (
            <KanbanBoard
              tasks={tasks}
              canEdit={canEdit}
              onAdd={addTask}
              onMove={moveTask}
              onOpen={setOpenTask}
            />
          ) : (
            <TaskList tasks={tasks} canEdit={canEdit} onAdd={addTask} onOpen={setOpenTask} onMove={moveTask} />
          )}
        </div>
      </section>

      {openTask && (
        <TaskDrawer
          task={openTask}
          canEdit={canEdit}
          meId={meId}
          projectId={projectId}
          members={members}
          ownerId={project.owner_user_id}
          onClose={() => setOpenTask(null)}
          onUpdate={updateTask}
          onDelete={deleteTask}
        />
      )}

      {showMembers && (
        <MembersDrawer
          projectId={projectId}
          members={members}
          isOwner={isOwner}
          ownerId={project.owner_user_id}
          onClose={() => setShowMembers(false)}
          onChanged={load}
        />
      )}

      <section id="project-packages-menus" className="scroll-mt-24 border-t border-ink/5 bg-secondary/20 py-10">
        <div className="mx-auto max-w-5xl px-6">
          <AiPackagesPanel projectId={projectId} />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function ProjectSettings({
  project,
  events,
  linkedEvent,
  linkedEventTitle,
  canEdit,
  onUpdate,
}: {
  project: Project;
  events: ReturnType<typeof useEvents>;
  linkedEvent: ReturnType<typeof useEvents>[number] | null;
  linkedEventTitle: string | null;
  canEdit: boolean;
  onUpdate: (patch: Partial<Project>) => void;
}) {
  const [draftDescription, setDraftDescription] = useState(project.description ?? "");
  const { canLink, loading: accessLoading, ent } = useCanLinkEvents();
  const [upsellOpen, setUpsellOpen] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    setDraftDescription(project.description ?? "");
  }, [project.id, project.description]);

  const lockEvents = !accessLoading && !canLink;

  return (
    <>
      <div className="grid gap-4 rounded-2xl bg-card p-5 ring-1 ring-ink/5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl">{t("pm.notes")}</h2>
              <p className="text-xs text-muted-foreground">Notes live with the project; task-specific notes live inside each task.</p>
            </div>
            {canEdit && (
              <input
                type="color"
                value={project.color ?? "#3B82F6"}
                onChange={(e) => onUpdate({ color: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded-md border border-ink/10 bg-paper p-1"
                aria-label="Project color"
              />
            )}
          </div>
          <textarea
            disabled={!canEdit}
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            onBlur={() => draftDescription !== (project.description ?? "") && onUpdate({ description: draftDescription })}
            rows={3}
            placeholder="Add internal project notes, budget reminders, vendor context, or production details…"
            className="mt-3 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm focus:border-velvet focus:outline-none disabled:opacity-70"
          />
          <div className="mt-4">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("pm.language")}</label>
            <div className="mt-2">
              <LanguagePicker
                disabled={!canEdit}
                value={project.language ?? "en"}
                onChange={(next: LangCode) => onUpdate({ language: next })}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Currently: {languageLabel(project.language ?? "en")}
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-secondary/40 p-4">
          <h3 className="font-serif text-lg">{t("pm.eventIntegration")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {lockEvents
              ? "Event integration is available on Host and Atelier. Postcard and Whisper with the Project Management add-on get standalone projects only — upgrade to link them to events."
              : "Attach this project to an event so both systems can cross-link."}
          </p>
          <div
            onClick={() => {
              if (lockEvents) setUpsellOpen(true);
            }}
            className={lockEvents ? "cursor-pointer" : undefined}
          >
            <select
              disabled={!canEdit || lockEvents}
              value={project.event_id ?? ""}
              onChange={(e) => onUpdate({ event_id: e.target.value || null })}
              className="mt-3 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              <option value="">No event attached</option>
              {project.event_id && !events.some((event) => event.id === project.event_id) && (
                <option value={project.event_id}>{linkedEventTitle || "Linked event"}</option>
              )}
              {events.map((event, idx) => {
                const d = formatEventDate(event.date, event.timezone);
                return (
                  <option key={`${event.id}-${idx}`} value={event.id}>
                    {event.title} — {d.long}
                  </option>
                );
              })}
            </select>
          </div>
          {lockEvents && (
            <button
              onClick={() => setUpsellOpen(true)}
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-velvet/10 px-3 py-1 text-[11px] font-medium text-velvet hover:bg-velvet/20"
            >
              ✦ Upgrade to link projects to events
            </button>
          )}
          {linkedEvent && !lockEvents && events.some((event) => event.id === linkedEvent.id) && (
            <Link
              to="/events/$eventId"
              params={{ eventId: linkedEvent.id }}
              className="mt-3 inline-block text-xs font-medium text-velvet hover:underline"
            >
              {t("pm.openLinkedEvent")}
            </Link>
          )}
        </div>
      </div>
      <EventLinkingUpgradeModal open={upsellOpen} onClose={() => setUpsellOpen(false)} />
    </>
  );
}

function EventIntegrationPanel({
  event,
  tasks,
  canEdit,
  projectId,
  onImported,
}: {
  event: KEvent;
  tasks: Task[];
  canEdit: boolean;
  projectId: string;
  onImported: () => void | Promise<void>;
}) {
  const counts = rsvpCounts(event);
  const dateLabel = formatEventDate(event.date, event.timezone).long;
  const checkIns = event.checkIns?.length ?? 0;
  const timeline = event.timelineBlocks ?? [];
  const hosts = event.hosts ?? [];
  const { canLink, loading: accessLoading } = useCanLinkEvents();
  const [importing, setImporting] = useState(false);
  const [importedAt, setImportedAt] = useState<string | null>(null);
  const importFn = useServerFn(importTimelineToProject);

  // Tasks already imported from this event's timeline are tagged in notes.
  const importedKeys = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      const m = (t.notes ?? "").match(/event-timeline:([^\s\]]+)/);
      if (m) set.add(m[1]);
    });
    return set;
  }, [tasks]);

  const pending = timeline.filter((b) => !importedKeys.has(b.id));
  const locked = !accessLoading && !canLink;

  async function importTimeline() {
    if (!canEdit || pending.length === 0 || locked) return;
    setImporting(true);
    try {
      const res = await importFn({
        data: {
          projectId,
          eventId: event.id,
          eventDate: event.date ?? null,
          blocks: pending.map((b) => ({
            id: b.id,
            title: b.title,
            time: b.time ?? null,
            notes: b.notes ?? null,
            owner: b.owner ?? null,
            vendor: b.vendor ?? null,
          })),
        },
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setImportedAt(formatStampTime(new Date()));
      toast.success(`Imported ${res.imported} timeline block${res.imported === 1 ? "" : "s"}.`);
      await onImported();
    } catch (err) {
      toast.error(toUserMessage(err, "Import failed"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-ink/5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-velvet">Event integration</p>
          <h2 className="mt-1 font-serif text-xl">Live data from {event.title}</h2>
          <p className="text-xs text-muted-foreground">{dateLabel}{event.venue ? ` · ${event.venue}` : ""}</p>
        </div>
        <Link
          to="/events/$eventId"
          params={{ eventId: event.id }}
          className="rounded-full bg-velvet/10 px-3 py-1.5 text-xs font-medium text-velvet hover:bg-velvet/20"
        >
          Open event →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Guests" value={counts.total} />
        <Stat label="Yes" value={counts.yes} />
        <Stat label="Pending" value={counts.pending} />
        <Stat label="Checked-in" value={checkIns} />
        <Stat label="Hosts" value={hosts.length} />
      </div>

      {locked ? (
        <div className="mt-5 rounded-xl bg-velvet/5 p-4 ring-1 ring-velvet/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-base text-velvet">Integration locked</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                The project is attached to this event, but importing the timeline into tasks and
                pulling live data both require an Atelier plan or the Studio bundle.
              </p>
            </div>
            <Link
              to="/pricing"
              className="shrink-0 rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-paper hover:opacity-90"
            >
              See plans
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-secondary/40 p-4">
            <h3 className="font-serif text-base">Timeline → Tasks</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Pull the event's run-of-show into this board so production work and the timeline stay in sync.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-muted-foreground">
                {timeline.length} block{timeline.length === 1 ? "" : "s"} on the event ·{" "}
                <strong className="text-ink">{pending.length}</strong> not yet imported
              </span>
              <button
                disabled={!canEdit || pending.length === 0 || importing}
                onClick={importTimeline}
                className="rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importing ? "Importing…" : pending.length === 0 ? "All imported" : `Import ${pending.length} as tasks`}
              </button>
              {importedAt && <span className="text-muted-foreground">Last import {importedAt}</span>}
            </div>
          </div>
          <div className="rounded-xl bg-secondary/40 p-4">
            <h3 className="font-serif text-base">At a glance</h3>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {hosts.length > 0 && <li>Hosts: {hosts.map((h) => h.name).join(", ")}</li>}
              {event.giftFund?.enabled && <li>Gift fund active{event.giftFund.label ? ` — ${event.giftFund.label}` : ""}</li>}
              {event.seatingTables && event.seatingTables.length > 0 && (
                <li>{event.seatingTables.length} seating table{event.seatingTables.length === 1 ? "" : "s"}</li>
              )}
              {event.thankYouCards && event.thankYouCards.length > 0 && (
                <li>{event.thankYouCards.length} thank-you card{event.thankYouCards.length === 1 ? "" : "s"} drafted</li>
              )}
              {timeline.length === 0 && <li>No timeline blocks yet — add them on the event page.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-serif text-xl text-ink">{value}</div>
    </div>
  );
}




function KanbanBoard({
  tasks,
  canEdit,
  onAdd,
  onMove,
  onOpen,
}: {
  tasks: Task[];
  canEdit: boolean;
  onAdd: (draft: TaskDraft) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  onOpen: (t: Task) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id);
        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              if (canEdit && dragId) e.preventDefault();
            }}
            onDrop={() => {
              if (canEdit && dragId) {
                onMove(dragId, col.id);
                setDragId(null);
              }
            }}
            className="flex flex-col rounded-2xl bg-card p-4 ring-1 ring-ink/5"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {col.label}
              </h3>
              <span className="text-xs text-muted-foreground">{colTasks.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {colTasks.map((t) => (
                <button
                  key={t.id}
                  draggable={canEdit}
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => onOpen(t)}
                  className="cursor-pointer rounded-lg bg-paper p-3 text-left text-sm ring-1 ring-ink/5 transition hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color ?? "#3B82F6" }} />
                    <div className="min-w-0">
                      <div className="font-medium">{t.title}</div>
                      {(t.description || t.notes) && (
                        <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {t.notes || t.description}
                        </div>
                      )}
                    </div>
                  </div>
                  {t.due_date && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Due {formatDateOnly(t.due_date)}
                    </div>
                  )}
                </button>
              ))}
              {canEdit && <AddTaskComposer status={col.id} compact onAdd={onAdd} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddTaskComposer({
  status = "todo",
  compact = false,
  onAdd,
}: {
  status?: TaskStatus;
  compact?: boolean;
  onAdd: (draft: TaskDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(status);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [color, setColor] = useState(TASK_COLORS[0].value);
  const [files, setFiles] = useState<File[]>([]);

  function reset() {
    setTitle("");
    setTaskStatus(status);
    setNotes("");
    setDueDate("");
    setColor(TASK_COLORS[0].value);
    setFiles([]);
    setOpen(false);
  }

  function submit() {
    if (!title.trim()) return;
    onAdd({ title, status: taskStatus, notes, due_date: dueDate || null, color, files });
    reset();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={compact ? "mt-1 rounded-lg border border-dashed border-ink/15 px-3 py-2 text-xs text-muted-foreground hover:border-velvet hover:text-velvet" : "rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white hover:opacity-90"}
      >
        + New task
      </button>
    );
  }
  return (
    <div className="rounded-xl bg-paper p-3 ring-1 ring-ink/10">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === "Escape") reset();
        }}
        placeholder="Task title…"
        className="w-full rounded-md border border-ink/10 bg-secondary/40 px-3 py-2 text-sm focus:outline-none"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={compact ? 2 : 3}
        placeholder="Notes…"
        className="mt-2 w-full rounded-md border border-ink/10 bg-secondary/40 px-3 py-2 text-sm focus:outline-none"
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {!compact && (
          <select value={taskStatus} onChange={(e) => setTaskStatus(e.target.value as TaskStatus)} className="rounded-md border border-ink/10 bg-paper px-3 py-2 text-xs">
            {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-md border border-ink/10 bg-paper px-3 py-2 text-xs" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {TASK_COLORS.map((c) => (
          <button key={c.value} type="button" onClick={() => setColor(c.value)} title={c.label} className={`h-5 w-5 rounded-full ring-offset-2 ${color === c.value ? "ring-2 ring-ink" : "ring-1 ring-ink/10"}`} style={{ backgroundColor: c.value }} />
        ))}
        <label className="ml-auto cursor-pointer rounded-full bg-secondary px-3 py-1 text-[11px] font-medium hover:bg-secondary/70">
          Attach files
          <input type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
      </div>
      {files.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">{files.length} file{files.length === 1 ? "" : "s"} selected</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={submit} className="rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-white">Add</button>
        <button type="button" onClick={reset} className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/70">Cancel</button>
      </div>
    </div>
  );
}

function TaskList({
  tasks,
  canEdit,
  onAdd,
  onOpen,
  onMove,
}: {
  tasks: Task[];
  canEdit: boolean;
  onAdd: (draft: TaskDraft) => void;
  onOpen: (t: Task) => void;
  onMove: (id: string, s: TaskStatus) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-ink/5">
      {canEdit && (
        <div className="flex justify-end border-b border-ink/5 bg-secondary/30 p-4">
          <AddTaskComposer onAdd={onAdd} />
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-secondary/50 text-left text-[10px] uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Color</th>
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Notes</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Due</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-t border-ink/5 hover:bg-paper/50">
              <td className="px-4 py-3">
                <span className="block h-3 w-3 rounded-full" style={{ backgroundColor: t.color ?? "#3B82F6" }} />
              </td>
              <td
                className="cursor-pointer px-4 py-3 font-medium"
                onClick={() => onOpen(t)}
              >
                {t.title}
              </td>
              <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                <span className="line-clamp-2">{t.notes || t.description || "—"}</span>
              </td>
              <td className="px-4 py-3">
                {canEdit ? (
                  <select
                    value={t.status}
                    onChange={(e) => onMove(t.id, e.target.value as TaskStatus)}
                    className="rounded-md border border-ink/10 bg-paper px-2 py-1 text-xs"
                  >
                    {COLUMNS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs">{COLUMNS.find((c) => c.id === t.status)?.label}</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {t.due_date ? formatDateOnly(t.due_date) : "—"}
              </td>
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                No tasks yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TaskDrawer({
  task,
  canEdit,
  meId,
  projectId,
  members,
  ownerId,
  onClose,
  onUpdate,
  onDelete,
}: {
  task: Task;
  canEdit: boolean;
  meId: string | null;
  projectId: string;
  members: Member[];
  ownerId: string;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [notes, setNotes] = useState(task.notes ?? "");
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [color, setColor] = useState(task.color ?? TASK_COLORS[0].value);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, { display_name: string | null; email: string | null }>>({});

  useEffect(() => {
    getProjectMemberProfiles({ data: { project_id: projectId } })
      .then(setProfiles)
      .catch(() => setProfiles({}));
  }, [projectId]);

  function memberLabel(userId: string): string {
    const p = profiles[userId];
    return p?.display_name || p?.email || `${userId.slice(0, 8)}…`;
  }

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
    setNotes(task.notes ?? "");
    setDueDate(task.due_date ?? "");
    setColor(task.color ?? TASK_COLORS[0].value);
    (async () => {
      const [c, a] = await Promise.all([
        supabase
          .from("pm_task_comments")
          .select("id,task_id,author_user_id,body,created_at")
          .eq("task_id", task.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("pm_task_attachments")
          .select("id,task_id,storage_path,file_name,mime_type,size_bytes,uploader_user_id,created_at")
          .eq("task_id", task.id)
          .order("created_at", { ascending: true }),
      ]);
      setComments((c.data as Comment[]) ?? []);
      setAttachments((a.data as Attachment[]) ?? []);
    })();
  }, [task.id, task.title, task.description, task.notes, task.color, task.due_date]);

  async function saveField(patch: Partial<Task>) {
    if (!canEdit) return;
    onUpdate(task.id, patch);
  }

  async function addComment() {
    if (!newComment.trim() || !meId) return;
    const { data } = await supabase
      .from("pm_task_comments")
      .insert({ task_id: task.id, author_user_id: meId, body: newComment.trim() })
      .select("id,task_id,author_user_id,body,created_at")
      .single();
    if (data) setComments((c) => [...c, data as Comment]);
    setNewComment("");
  }

  async function uploadFile(file: File) {
    if (!meId) return;
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const path = `${projectId}/${task.id}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("pm-attachments").upload(path, file);
    if (!upErr) {
      const { data } = await supabase
        .from("pm_task_attachments")
        .insert({
          task_id: task.id,
          uploader_user_id: meId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        })
        .select("id,task_id,storage_path,file_name,mime_type,size_bytes,uploader_user_id,created_at")
        .single();
      if (data) setAttachments((a) => [...a, data as Attachment]);
    }
    setUploading(false);
  }

  async function downloadAttachment(att: Attachment) {
    const { data } = await supabase.storage.from("pm-attachments").createSignedUrl(att.storage_path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <button className="flex-1 bg-ink/30" onClick={onClose} aria-label="Close" />
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-paper shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink/5 px-6 py-4">
          <p className="text-[10px] uppercase tracking-widest text-velvet">Task</p>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-ink">
            Close
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Title</label>
            <input
              disabled={!canEdit}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title !== task.title && saveField({ title })}
              className="mt-1 w-full bg-transparent font-serif text-2xl focus:outline-none disabled:opacity-70"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</label>
              <select
                disabled={!canEdit}
                value={task.status}
                onChange={(e) => saveField({ status: e.target.value as TaskStatus })}
                className="mt-1 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm"
              >
                {COLUMNS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Due date</label>
              <input
                disabled={!canEdit}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                onBlur={() => saveField({ due_date: dueDate || null })}
                className="mt-1 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Assignee</label>
              <select
                disabled={!canEdit}
                value={task.assignee_user_id ?? ""}
                onChange={(e) => saveField({ assignee_user_id: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                <option value={ownerId}>Owner · {memberLabel(ownerId)}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.user_id}>
                    {m.role} · {memberLabel(m.user_id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Color code</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TASK_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => {
                      setColor(c.value);
                      saveField({ color: c.value });
                    }}
                    title={c.label}
                    className={`h-6 w-6 rounded-full ring-offset-2 disabled:opacity-60 ${color === c.value ? "ring-2 ring-ink" : "ring-1 ring-ink/10"}`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Description</label>
            <textarea
              disabled={!canEdit}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== (task.description ?? "") && saveField({ description })}
              rows={4}
              className="mt-1 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm focus:border-velvet focus:outline-none"
              placeholder="Add details…"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Notes</label>
            <textarea
              disabled={!canEdit}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== (task.notes ?? "") && saveField({ notes })}
              rows={5}
              className="mt-1 w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm focus:border-velvet focus:outline-none"
              placeholder="Add private notes, context, vendor details, budget reminders, or follow-up items…"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Attachments
              </label>
              {canEdit && (
                <label className="cursor-pointer text-xs text-velvet hover:underline">
                  {uploading ? "Uploading…" : "+ Upload photos/files"}
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      files.forEach((f) => uploadFile(f));
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            {attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No attachments yet.</p>
            ) : (
              <ul className="space-y-1">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => downloadAttachment(a)}
                      className="text-xs text-velvet hover:underline"
                    >
                      {a.mime_type?.startsWith("image/") ? "🖼️" : "📎"} {a.file_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Comments
            </label>
            <ul className="mt-2 space-y-2">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-secondary/50 p-3 text-sm">
                  <p className="text-[10px] text-muted-foreground">
                    {formatTimestamp((c.created_at))}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
            {canEdit && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addComment()}
                  placeholder="Add a comment…"
                  className="flex-1 rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm"
                />
                <button
                  onClick={addComment}
                  className="rounded-full bg-velvet px-3 py-1.5 text-xs font-medium text-white"
                >
                  Send
                </button>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="border-t border-ink/5 pt-4">
              <button
                onClick={async () => {
                  if (await confirmDialog({ title: "Delete this task?" })) onDelete(task.id);
                }}
                className="text-xs text-red-600 hover:underline"
              >
                Delete task
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MembersDrawer({
  projectId,
  members,
  isOwner,
  ownerId,
  onClose,
  onChanged,
}: {
  projectId: string;
  members: Member[];
  isOwner: boolean;
  ownerId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer" | "admin">("editor");
  const [profiles, setProfiles] = useState<Record<string, { display_name: string | null; email: string | null }>>({});
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const previewTier = usePreviewTier();

  useEffect(() => {
    getProjectMemberProfiles({ data: { project_id: projectId } })
      .then(setProfiles)
      .catch(() => setProfiles({}));
  }, [projectId]);

  useEffect(() => {
    let active = true;
    getEntitlements()
      .then((e) => { if (active) setEnt(e); })
      .catch(() => {});
    return () => { active = false; };
  }, [previewTier]);

  function memberLabel(userId: string): string {
    const p = profiles[userId];
    return p?.display_name || p?.email || `${userId.slice(0, 8)}…`;
  }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [invites, setInvites] = useState<
    Array<{
      id: string;
      email: string;
      role: string;
      token: string;
      expires_at: string;
      accepted_at: string | null;
    }>
  >([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    try {
      const rows = await listPmInvites({ data: { project_id: projectId } });
      setInvites((rows as any) ?? []);
    } catch {
      // ignore (non-admin)
    }
  }, [projectId]);

  useEffect(() => {
    if (isOwner) loadInvites();
  }, [isOwner, loadInvites]);

  async function invite() {
    setErr(null);
    setBusy(true);
    try {
      const trimmed = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
        setErr("Please enter a valid email address.");
        return;
      }
      const res: any = await createPmInvite({ data: { project_id: projectId, email: trimmed, role } });
      setEmail("");
      await loadInvites();
      if (res?.emailed) {
        toast.success(`Invite emailed to ${trimmed}`);
      } else {
        toast.message("Invite created", {
          description: "We couldn't send the email — copy the link below and share it directly.",
        });
      }
    } catch (e: any) {
      setErr(e?.message ?? "Could not create invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function resendInvite(id: string, email: string) {
    try {
      const res: any = await resendPmInvite({ data: { invite_id: id } });
      await loadInvites();
      toast.success(res?.emailed ? `Invite re-sent to ${email}` : "Expiry extended — copy the link to share.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not resend invitation.");
    }
  }

  async function cancelInvite(id: string) {
    if (!(await confirmDialog({ title: "Cancel this invitation?" }))) return;
    try {
      await cancelPmInvite({ data: { invite_id: id } });
      await loadInvites();
    } catch {
      // noop
    }
  }

  function copyInviteLink(token: string, id: string) {
    const url = `${window.location.origin}/projects/accept-invite/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
    });
  }

  async function removeMember(id: string) {
    if (!(await confirmDialog({ title: "Remove this member?" }))) return;
    await supabase.from("pm_project_members").delete().eq("id", id);
    onChanged();
  }

  async function changeRole(id: string, newRole: Member["role"]) {
    await supabase.from("pm_project_members").update({ role: newRole }).eq("id", id);
    onChanged();
  }

  const pending = invites.filter((i) => !i.accepted_at);

  return (
    <div className="fixed inset-0 z-50 flex">
      <button className="flex-1 bg-ink/30" onClick={onClose} aria-label="Close" />
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-paper shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink/5 px-6 py-4">
          <p className="text-[10px] uppercase tracking-widest text-velvet">Members</p>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-ink">
            Close
          </button>
        </div>
        <div className="space-y-6 px-6 py-6">
          <div>
            <p className="text-sm font-medium">Owner</p>
            <p className="mt-1 text-xs text-muted-foreground">{memberLabel(ownerId)} (you are admin)</p>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Team ({members.length})</p>
            {members.length === 0 ? (
              <p className="text-xs text-muted-foreground">No members yet.</p>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between rounded-lg bg-secondary/50 p-3"
                  >
                    <div className="text-xs">{memberLabel(m.user_id)}</div>
                    <div className="flex items-center gap-2">
                      {isOwner ? (
                        <select
                          value={m.role}
                          onChange={(e) => changeRole(m.id, e.target.value as Member["role"])}
                          className="rounded-md border border-ink/10 bg-paper px-2 py-1 text-xs"
                        >
                          <option value="admin">Admin</option>
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        <span className="text-xs capitalize">{m.role}</span>
                      )}
                      {isOwner && (
                        <button
                          onClick={() => removeMember(m.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isOwner && (() => {
            // Seat calculation. Uses viewer's entitlements as a proxy for the
            // project owner (server enforces the real number). Owner + members
            // + pending invites all count as seats.
            const pendingCount = pending.length;
            const seatsUsed = 1 + members.length + pendingCount;
            let seatLimit = 0;
            if (ent) {
              if (ent.isOwner && !ent.previewing) seatLimit = PM_ADDON_SEAT_LIMITS.atelier;
              else if (ent.hasPmAddon) seatLimit = PM_ADDON_SEAT_LIMITS[ent.tier];
            }
            const hasPmAccess = seatLimit > 0;
            const atLimit = hasPmAccess && seatsUsed >= seatLimit;
            const seatCopy = (() => {
              if (!ent) return null;
              if (ent.isOwner && !ent.previewing)
                return `${PM_ADDON_SEAT_LIMITS.atelier} project seats (owner)`;
              if (ent.hasPmAddon) {
                return `${PM_ADDON_SEAT_LIMITS[ent.tier]} seats included with your Project Management add-on`;
              }
              return null;
            })();
            return (
            <div className="border-t border-ink/5 pt-4">
              <p className="mb-1 text-sm font-medium">Invite by email</p>
              {hasPmAccess ? (
                <div className="mb-3">
                  <p className="text-[11px] font-medium text-ink/80">
                    {seatsUsed} of {seatLimit} seats used
                  </p>
                  {seatCopy && (
                    <p className="text-[11px] text-muted-foreground">{seatCopy}</p>
                  )}
                  {atLimit && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Every seat on this project is taken. Remove a collaborator to free one,
                      or{" "}
                      <Link to="/contact" className="text-velvet underline underline-offset-2">
                        tell us about your team
                      </Link>{" "}
                      and we'll open up more.
                    </p>
                  )}
                </div>
              ) : (
                <div className="mb-3 rounded-lg border border-amber-400/40 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                  <p className="font-medium">Project Management add-on required</p>
                  <p className="mt-0.5">
                    Add Projects for $5/mo to invite collaborators ({PM_ADDON_SEAT_LIMITS.postcard} seats,
                    or {PM_ADDON_SEAT_LIMITS.atelier} on Atelier).{" "}
                    <Link to="/pricing" className="underline underline-offset-2">
                      See pricing
                    </Link>
                  </p>
                </div>
              )}
              <p className="mb-3 text-[11px] text-muted-foreground">
                Send an invite to someone's email. They'll create an account (or sign in) and join automatically.
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm"
                disabled={!hasPmAccess || atLimit}
              />
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className="rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs"
                  disabled={!hasPmAccess || atLimit}
                >
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  disabled={busy || !email.trim() || !hasPmAccess || atLimit}
                  onClick={invite}
                  title={atLimit ? "Seat limit reached" : undefined}
                  className="rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  Send invite
                </button>
              </div>
              {err && <p className="mt-2 text-xs text-red-600">{err}</p>}

              {pending.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2 text-xs font-medium">Pending invitations ({pending.length})</p>
                  <ul className="space-y-2">
                    {pending.map((inv) => {
                      const expired = new Date(inv.expires_at) < new Date();
                      return (
                        <li key={inv.id} className="rounded-lg bg-secondary/40 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">{inv.email}</p>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                {inv.role}
                                {expired ? (
                                  <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700">
                                    EXPIRED
                                  </span>
                                ) : (
                                  <> · expires {formatStampDate((inv.expires_at))}</>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {expired ? (
                                <button
                                  onClick={() => resendInvite(inv.id, inv.email)}
                                  className="rounded-full bg-paper px-3 py-1 text-[11px] font-medium ring-1 ring-ink/10 hover:bg-velvet hover:text-white"
                                >
                                  Resend
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => resendInvite(inv.id, inv.email)}
                                    className="text-[11px] text-muted-foreground hover:text-ink hover:underline"
                                    title="Re-send the invite email"
                                  >
                                    Resend
                                  </button>
                                  <button
                                    onClick={() => copyInviteLink(inv.token, inv.id)}
                                    className="rounded-full bg-paper px-3 py-1 text-[11px] font-medium ring-1 ring-ink/10 hover:bg-velvet hover:text-white"
                                  >
                                    {copiedId === inv.id ? "Copied!" : "Copy link"}
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => cancelInvite(inv.id)}
                                className="text-[11px] text-red-600 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    We email each invite automatically. Use "Copy link" if you'd rather share it yourself. Invites expire in 14 days.
                  </p>
                </div>
              )}
            </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

