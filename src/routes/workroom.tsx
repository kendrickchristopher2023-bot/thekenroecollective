import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, KanbanSquare, MessageSquare, Paperclip, Users, CalendarHeart } from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { FlourishDivider, GoldenDots } from "@/components/decor";
import { PM_ADDON_SEAT_LIMITS } from "@/lib/tier-limits";
import { ProjectsFirstRun } from "@/components/projects-first-run";
import { VentureWhatsNewLink } from "@/components/venture-whats-new-link";

/**
 * The Workroom — public marketing landing page for the Projects venture.
 *
 * Mirrors the Events split: `/workroom` is the venture's front door (public,
 * indexable), `/projects` is the signed-in workspace. Linking to `/projects`
 * from here is intentional — the `_authenticated` gate bounces visitors to
 * `/auth?redirect=/projects`, so a Projects-only signup lands back in the
 * workspace instead of the events homepage.
 */
export const Route = createFileRoute("/workroom")({
  head: () => ({
    meta: [
      { title: "Projects — The Workroom | The Kenroe Collective" },
      {
        name: "description",
        content:
          "Kanban boards, tasks, comments, attachments, and collaborator roles. The Kenroe Collective's project workspace — use it on its own or alongside your events.",
      },
      { property: "og:title", content: "Projects — The Workroom | The Kenroe Collective" },
      {
        property: "og:description",
        content:
          "Kanban boards, tasks, comments, attachments, and collaborator roles — a calm project workspace that stands on its own.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://thekenroecollective.com/workroom" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/workroom" }],
  }),
  component: Workroom,
});

const FEATURES = [
  {
    Icon: KanbanSquare,
    title: "Boards that stay readable",
    body: "Four columns, drag to move, color where it earns its place. No ceremony, no sprint theatre.",
  },
  {
    Icon: Users,
    title: "Collaborators with real roles",
    body: "Admin, editor, viewer. Invite by email, revoke in a click. Seats are per project, not per person you've ever met.",
  },
  {
    Icon: MessageSquare,
    title: "Comments where the work is",
    body: "Threaded notes on the task itself, so decisions live next to the thing they decided.",
  },
  {
    Icon: Paperclip,
    title: "Attachments that stick",
    body: "Contracts, floor plans, mockups — attached to the task, not buried in a thread somewhere.",
  },
  {
    Icon: CalendarHeart,
    title: "Optional event linking",
    body: "On a Host or Atelier plan, attach a project to one of your gatherings and cross-link the two. Entirely optional.",
  },
  {
    Icon: CheckCircle2,
    title: "Stands on its own",
    body: "No event required. Plenty of people use the Workroom and never touch the events side at all.",
  },
];

function Workroom() {
  const soloSeats = PM_ADDON_SEAT_LIMITS.postcard;

  return (
    <div className="venture-projects min-h-screen bg-paper font-sans text-ink">
      <SiteNav />

      <main>
        <ProjectsFirstRun />

        {/* Hero */}
        <section className="relative overflow-hidden">
          <GoldenDots className="pointer-events-none absolute -right-24 top-4 h-72 w-72 opacity-30" />
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
            <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-velvet">
              Venture 03 — Projects
            </p>
            <h1 className="mt-5 max-w-[24ch] text-balance font-serif text-4xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
              The Workroom
            </h1>
            <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
              A quiet place to run the work. Boards, tasks, comments, and files — with just
              enough structure to keep a team honest and none of the software that keeps a
              team busy.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                to="/projects"
                className="inline-flex items-center gap-2 rounded-full bg-velvet px-6 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
              >
                Manage projects <span aria-hidden>→</span>
              </Link>
              <Link
                to="/pricing"
                search={{ category: "projects" }}
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium text-velvet ring-1 ring-velvet/25 transition-colors hover:bg-velvet/5"
              >
                See what it costs
              </Link>
              <VentureWhatsNewLink
                tone="cyprus"
                storageKey="kenroe.projects.whatsnew.seen"
                label="What's New in the Workroom"
              />
            </div>

            <p className="mt-5 text-xs text-muted-foreground">
              $5/month or $48/year. Includes {soloSeats} seats on its own — no events
              subscription needed.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-5xl px-6">
          <FlourishDivider className="h-6 w-40 opacity-70" />
        </div>

        {/* Features */}
        <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h2 className="font-serif text-3xl font-medium tracking-tight">What's inside</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ Icon, title, body }) => (
              <div key={title} className="rounded-3xl bg-secondary p-7 ring-1 ring-ink/5">
                <Icon className="h-5 w-5 text-velvet" aria-hidden="true" />
                <h3 className="mt-5 font-serif text-xl font-medium leading-snug">{title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Seats */}
        <section className="border-t border-ink/5 bg-secondary/40">
          <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
            <h2 className="font-serif text-3xl font-medium tracking-tight">Seats</h2>
            <p className="mt-4 max-w-[58ch] text-sm leading-relaxed text-muted-foreground">
              A seat is a person with access to a project — you included. The Workroom
              includes {PM_ADDON_SEAT_LIMITS.postcard} seats per project on its own, {PM_ADDON_SEAT_LIMITS.host} on
              a Host plan, and {PM_ADDON_SEAT_LIMITS.atelier} on Atelier.
            </p>
            <p className="mt-4 max-w-[58ch] text-sm leading-relaxed text-muted-foreground">
              Need more than that? We'd rather talk to you than sell you a tier you don't
              need.{" "}
              <Link to="/contact" className="font-medium text-velvet hover:underline">
                Tell us about your team
              </Link>{" "}
              and we'll sort it out.
            </p>
            <div className="mt-9">
              <Link
                to="/projects"
                className="inline-flex items-center gap-2 rounded-full bg-velvet px-6 py-3 text-sm font-medium text-white transition-transform hover:-translate-y-0.5"
              >
                Start a project <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
