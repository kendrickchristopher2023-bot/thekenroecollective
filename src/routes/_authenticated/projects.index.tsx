import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SkeletonCardGrid } from "@/components/skeletons";
import { useEffect, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { supabase } from "@/integrations/supabase/client";
import { formatEventDate, useEvents } from "@/lib/events-store";
import { LanguagePicker } from "@/components/language-picker";
import { useLanguage, type LangCode } from "@/lib/i18n";
import { getEntitlements, type Entitlements } from "@/lib/entitlements-client";
import { usePreviewTier } from "@/lib/preview-tier";
import { EmptyState } from "@/components/empty-state";
import { FolderKanban } from "lucide-react";
import { PM_ADDON_SEAT_LIMITS } from "@/lib/tier-limits";
import { formatStampDate } from "@/lib/datetime";


export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({ meta: [{ title: "Projects — The Kenroe Collective" }] }),
  component: ProjectsList,
});

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  event_id: string | null;
  archived_at: string | null;
  updated_at: string;
};

const PROJECT_DRAFT_KEY = "kenroes:new-project-draft";

type ProjectDraft = {
  name: string;
  description: string;
  eventId: string;
  color: string;
  language: LangCode;
  creating: boolean;
};

function loadProjectDraft(): Partial<ProjectDraft> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PROJECT_DRAFT_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeProjectDraft(d: ProjectDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROJECT_DRAFT_KEY, JSON.stringify(d));
  } catch {}
}

function clearProjectDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROJECT_DRAFT_KEY);
  } catch {}
}

function ProjectsList() {
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [eventId, setEventId] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [language, setLanguage] = useState<LangCode>("en");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const events = useEvents();
  const navigate = useNavigate();
  const { lang: userLang, t } = useLanguage();
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const previewTier = usePreviewTier();
  const ownerAccess = !!entitlements && entitlements.isOwner;
  const canUseProjects = !!entitlements && (ownerAccess || entitlements.hasProjectManagement);
  const canAttachEvent =
    canUseProjects &&
    !!entitlements &&
    (ownerAccess || entitlements.tier === "atelier" || entitlements.tier === "host");
  const planLapsed = !!entitlements && !canUseProjects;

  useEffect(() => {
    // Restore draft once on mount so cancelled checkouts / subscription
    // changes / accidental navigations never lose typed project details.
    const d = loadProjectDraft();
    if (d.name) setName(d.name);
    if (d.description) setDescription(d.description);
    if (d.eventId) setEventId(d.eventId);
    if (d.color) setColor(d.color);
    if (d.language) setLanguage(d.language as LangCode);
    if (d.creating) setCreating(true);
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    setLanguage((prev) => prev || userLang);
  }, [userLang, draftLoaded]);

  useEffect(() => {
    if (!draftLoaded) return;
    const t = window.setTimeout(() => {
      writeProjectDraft({ name, description, eventId, color, language, creating });
    }, 250);
    return () => window.clearTimeout(t);
  }, [draftLoaded, name, description, eventId, color, language, creating]);

  useEffect(() => {
    let alive = true;
    getEntitlements().then((ent) => {
      if (alive) setEntitlements(ent);
    }).catch(() => {
      if (alive) setEntitlements(null);
    });
    return () => { alive = false; };
  }, [previewTier]);


  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("pm_projects")
      .select("id,name,description,color,event_id,archived_at,updated_at")
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    setRows((data as ProjectRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createProject() {
    if (!name.trim() || !canUseProjects) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await (supabase as any)
      .from("pm_projects")
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        event_id: canAttachEvent ? eventId || null : null,
        color,
        language,
        owner_user_id: u.user.id,
      })
      .select("id")
      .single();
    if (error || !data) return;
    setName("");
    setDescription("");
    setEventId("");
    setCreating(false);
    clearProjectDraft();
    navigate({ to: "/projects/$projectId", params: { projectId: data.id } });
  }

  return (
    <div className="venture-projects min-h-screen bg-paper">
      <SiteNav />
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 flex items-end justify-between">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
                Project Management
              </span>
              <h1 className="font-serif text-4xl font-medium">Your Projects</h1>
              <p className="text-sm text-muted-foreground">
                Simple, elegant project tracking — built to live alongside your events.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={!entitlements || !canUseProjects}
              className="inline-flex items-center rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
            >
              + New Project
            </button>
          </div>

          {creating && (
            <div className="mb-8 rounded-2xl bg-card p-6 ring-1 ring-ink/5">
              {planLapsed && (
                <div className="mb-4 rounded-xl bg-velvet/5 px-4 py-3 text-xs ring-1 ring-velvet/20">
                  <span className="font-medium text-ink">Your plan needs a boost to publish projects.</span>{" "}
                  Your draft is saved here — <Link to="/pricing" search={{ category: "projects" }} className="underline">choose a plan</Link> and we'll
                  bring you right back to finish creating it.
                </div>
              )}
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Project name
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProject()}
                placeholder="e.g. Spring Gala 2026"
                className="mt-2 w-full rounded-lg border border-ink/10 bg-paper px-4 py-2.5 text-sm focus:border-velvet focus:outline-none"
              />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Attach to event
                  <select
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                    disabled={!canAttachEvent}
                    className="mt-2 w-full rounded-lg border border-ink/10 bg-paper px-4 py-2.5 text-sm normal-case tracking-normal text-ink focus:border-velvet focus:outline-none"
                  >
                    <option value="">No event yet</option>
                    {events.map((event) => {
                      const d = formatEventDate(event.date, event.timezone);
                      return <option key={event.id} value={event.id}>{event.title} — {d.long}</option>;
                    })}
                  </select>
                  {!canAttachEvent && (
                    <span className="mt-1 block text-[11px] normal-case tracking-normal text-muted-foreground">
                      Event integration requires Host or Atelier. Postcard and Whisper with the Project Management add-on get standalone projects — upgrade to link them to events.
                    </span>
                  )}
                </label>
                <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Project color
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="mt-2 h-[42px] w-full rounded-lg border border-ink/10 bg-paper p-1"
                  />
                </label>
              </div>
              <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("pm.language")}
                <div className="mt-2">
                  <LanguagePicker value={language} onChange={(next: LangCode) => setLanguage(next)} />
                </div>
              </label>
              <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Project notes
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Internal notes, budget context, vendor reminders…"
                  className="mt-2 w-full rounded-lg border border-ink/10 bg-paper px-4 py-2.5 text-sm normal-case tracking-normal text-ink focus:border-velvet focus:outline-none"
                />
              </label>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={!canUseProjects}
                  onClick={createProject}
                  className="rounded-full bg-velvet px-4 py-2 text-xs font-medium text-white hover:opacity-90"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setName("");
                    setDescription("");
                    setEventId("");
                  }}
                  className="rounded-full bg-secondary px-4 py-2 text-xs font-medium hover:bg-secondary/70"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <SkeletonCardGrid cards={6} aspect="aspect-[3/2]" />
          ) : !canUseProjects ? (
            <div className="rounded-2xl bg-card p-12 text-center ring-1 ring-ink/5">
              <h3 className="font-serif text-2xl">Unlock Project Management</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                The Workroom is a standalone add-on on every plan — including Atelier — for $5/mo (or $48/yr). No event plan required: unlimited projects, tasks and attachments, {PM_ADDON_SEAT_LIMITS.postcard} collaborator seats ({PM_ADDON_SEAT_LIMITS.atelier} on Atelier). Attaching a project to an event is the one part that needs a Host or Atelier event plan.
              </p>
              <Link
                to="/pricing"
                search={{ category: "projects" }}
                className="mt-5 inline-flex rounded-full bg-velvet px-5 py-2 text-xs font-medium text-white hover:opacity-90"
              >
                Go to Project Management pricing
              </Link>
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Projects are shared workspaces for tasks, deadlines, files, and comments — perfect for planning a wedding, a launch, or a team initiative."
              cta={{ label: "Create your first project", onClick: () => setCreating(true) }}
              tips={[
                "Invite collaborators by email — they get their own login.",
                "Attach files, leave comments, and track status on a Kanban board.",
                "Set a color and cover image so each project feels distinct.",
              ]}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((p) => (
                <Link
                  key={p.id}
                  to="/projects/$projectId"
                  params={{ projectId: p.id }}
                  className="group rounded-2xl bg-card p-6 ring-1 ring-ink/5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div
                    className="mb-4 h-1.5 w-12 rounded-full"
                    style={{ backgroundColor: p.color ?? "#3B82F6" }}
                  />
                  <h3 className="font-serif text-xl font-medium">{p.name}</h3>
                  {p.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                  <p className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
                    Updated {formatStampDate((p.updated_at))}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
