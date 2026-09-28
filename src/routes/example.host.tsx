// The read-only host view of the showcase wedding.
//
// A first-time host (signed out, or signed in with no events yet) can see what
// a finished dashboard looks like without anything being real: RSVP counts,
// the guest list, the bring list, the photo wall, the song and the reading,
// and the run of show. Every control is visibly disabled and nothing here can
// send, export, invite, regenerate, duplicate or download.
//
// The page never appears in anyone's own events list or counts: it reads the
// fictional showcase row through its own server function and nothing else.
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarHeart,
  Camera,
  Clock3,
  Music4,
  Lock,
  MessageCircleHeart,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { GlobalErrorFallback } from "@/components/global-error-fallback";
import { fetchExampleHostView, recordShowcaseInteraction } from "@/lib/showcase.functions";
import { getInvitePerformance } from "@/lib/invite-narration.functions";
import { clockLabel, EXAMPLE_NOTE, type ExampleHostView } from "@/lib/example-host-view";
import { SHOWCASE_EVENT_ID } from "@/lib/showcase";
import { formatEventDate } from "@/lib/datetime";
import { useAuthReady } from "@/hooks/use-auth-ready";

const TITLE = "A finished example, the host's view | The Kenroe Collective";
const DESCRIPTION =
  "See what a finished event looks like from the host's side: RSVPs, guests, the bring list, the photo wall, the song and the run of show. Everyone here is invented.";

export const Route = createFileRoute("/example/host")({
  loader: async () => {
    const { view } = (await fetchExampleHostView()) as { view: ExampleHostView | null };
    return { view };
  },
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExampleHostPage,
  errorComponent: GlobalErrorFallback,
  notFoundComponent: Missing,
});

function Missing() {
  return (
    <main className="min-h-screen bg-paper px-6 py-20 text-center text-ink">
      <h1 className="font-serif text-3xl">The example is resting</h1>
      <p className="mt-3 text-sm text-muted-foreground">Try again in a moment.</p>
    </main>
  );
}

const STATUS_LABEL: Record<ExampleHostView["guests"][number]["status"], string> = {
  yes: "Confirmed",
  maybe: "Maybe",
  no: "Declined",
  pending: "No response",
  waitlisted: "Waitlisted",
};

const STATUS_TONE: Record<ExampleHostView["guests"][number]["status"], string> = {
  yes: "bg-sage/20 text-ink",
  maybe: "bg-amber-100 text-amber-900",
  no: "bg-ink/5 text-ink/60",
  pending: "bg-ink/5 text-ink/70",
  waitlisted: "bg-blossom/15 text-ink",
};

/** A control that looks like the real one but is switched off, with a reason. */
function DisabledAction({ children }: { children: string }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={EXAMPLE_NOTE}
      className="inline-flex min-h-[36px] cursor-not-allowed items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-ink/45 ring-1 ring-ink/10"
    >
      <Lock className="h-3 w-3" aria-hidden />
      {children}
    </button>
  );
}

function ExampleNote() {
  return (
    <p className="text-xs text-muted-foreground" data-testid="example-note">
      {EXAMPLE_NOTE}
    </p>
  );
}

function Card({
  icon: Icon,
  title,
  actions,
  children,
}: {
  icon: typeof Users;
  title: string;
  actions?: string[];
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-ink/10 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-serif text-xl text-ink">
          <Icon className="h-5 w-5 text-velvet" aria-hidden />
          {title}
        </h2>
        {actions?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {actions.map((a) => (
              <DisabledAction key={a}>{a}</DisabledAction>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ExampleHostPage() {
  const { view } = Route.useLoaderData();
  const { user } = useAuthReady();
  const fired = useRef(false);
  const [reading, setReading] = useState<{ url: string | null; voice: string | null; seconds: number } | null>(null);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    try {
      void recordShowcaseInteraction({ data: { kind: "example_host_view" } } as never);
    } catch {
      // Counting is never allowed to break the page.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perf = (await getInvitePerformance({ data: { eventId: SHOWCASE_EVENT_ID } } as never)) as {
          narration?: { url: string | null; voiceLabel: string | null; seconds: number };
        };
        if (cancelled || !perf?.narration) return;
        setReading({
          url: perf.narration.url,
          voice: perf.narration.voiceLabel,
          seconds: perf.narration.seconds,
        });
      } catch {
        if (!cancelled) setReading({ url: null, voice: null, seconds: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!view) return <Missing />;

  const when = formatEventDate(view.date, view.timezone);
  const trackCreate = () => {
    try {
      void recordShowcaseInteraction({ data: { kind: "example_create" } } as never);
    } catch {
      // Never block navigation on a counter.
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteNav />

      {/* The back bar: where this came from, and where to go next. */}
      <div className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-ink px-4 py-2 text-center text-xs text-white print:hidden">
        <span>This is a finished example.</span>
        <Link
          to="/invite/$eventId"
          params={{ eventId: SHOWCASE_EVENT_ID }}
          search={{ from: "events" } as never}
          className="font-medium underline underline-offset-2"
        >
          See the invitation
        </Link>
        {user ? (
          <Link to="/events" className="font-medium underline underline-offset-2">
            Back to my events
          </Link>
        ) : (
          <Link to="/gatherings" className="font-medium underline underline-offset-2">
            Back to Gatherings
          </Link>
        )}
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-velvet">Example event</p>
            <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">{view.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {when.full}
              {view.venue ? ` · ${view.venue}` : ""}
            </p>
            {view.hosts.length ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Hosted by {view.hosts.map((h) => h.name).join(" and ")}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-ink/80" data-testid="example-note-top">
              {EXAMPLE_NOTE}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/events/new"
              onClick={trackCreate}
              className="inline-flex min-h-[44px] items-center rounded-full bg-velvet px-5 text-sm font-medium text-white hover:opacity-90"
            >
              Create your own event
            </Link>
          </div>
        </header>

        <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Host actions, switched off in the example">
          {["Send invitations", "Invite a co-host", "Duplicate", "Export", "Download"].map((a) => (
            <DisabledAction key={a}>{a}</DisabledAction>
          ))}
        </div>

        {/* RSVP counts */}
        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="RSVP counts">
          {[
            ["Invited", view.counts.invited],
            ["Confirmed", view.counts.yes],
            ["Maybe", view.counts.maybe],
            ["Declined", view.counts.no],
            ["No response", view.counts.pending],
          ].map(([label, n]) => (
            <div key={String(label)} className="rounded-2xl border border-ink/10 bg-white p-4">
              <p className="text-2xl font-semibold text-ink">{n}</p>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            </div>
          ))}
        </section>
        <p className="mt-2 text-xs text-muted-foreground">
          {view.counts.attendees} expected in the room ({view.counts.adults} adults, {view.counts.children}{" "}
          children) · {view.counts.dietary} dietary notes
          {view.capacity ? ` · room for ${view.capacity}` : ""}
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card icon={Users} title="Guest list" actions={["Add guest", "Message", "Export"]}>
            <ul className="divide-y divide-ink/5">
              {view.guests.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {g.name}
                      {g.plusOnes.length ? (
                        <span className="text-ink/50"> + {g.plusOnes.join(", ")}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Party of {g.party}
                      {g.table ? ` · ${g.table}` : ""}
                      {g.dietary ? ` · ${g.dietary}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_TONE[g.status]}`}>
                    {STATUS_LABEL[g.status]}
                  </span>
                </li>
              ))}
            </ul>
            <ExampleNote />
          </Card>

          <div className="space-y-6">
            <Card icon={UtensilsCrossed} title="Bring list" actions={["Add item", "Print"]}>
              {view.bring.length ? (
                <ul className="space-y-2 text-sm">
                  {view.bring.map((b) => (
                    <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-ink">
                        {b.title}
                        {b.note ? <span className="text-ink/50"> · {b.note}</span> : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {b.claimedBy.length ? b.claimedBy.join(", ") : `${b.slots} still open`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No bring list on this event.</p>
              )}
              <ExampleNote />
            </Card>

            <Card icon={Music4} title="The song and the reading" actions={["Compose again", "Download"]}>
              <div className="space-y-4 text-sm">
                {view.song ? (
                  <div>
                    <p className="font-medium text-ink">
                      {view.song.title}
                      {view.song.artist ? <span className="text-ink/50"> · {view.song.artist}</span> : null}
                    </p>
                    <audio controls preload="none" src={view.song.url} className="mt-2 w-full" controlsList="nodownload" />
                  </div>
                ) : null}
                {view.voiceNote ? (
                  <div>
                    <p className="font-medium text-ink">A note from the hosts</p>
                    <audio controls preload="none" src={view.voiceNote.url} className="mt-2 w-full" controlsList="nodownload" />
                  </div>
                ) : null}
                <div>
                  <p className="font-medium text-ink">
                    The invitation, read aloud
                    {reading?.voice ? <span className="text-ink/50"> · {reading.voice}</span> : null}
                  </p>
                  {reading === null ? (
                    <p className="mt-1 text-xs text-muted-foreground">Finding the reading…</p>
                  ) : reading.url ? (
                    <audio controls preload="none" src={reading.url} className="mt-2 w-full" controlsList="nodownload" />
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      The reading plays from the invitation itself.
                    </p>
                  )}
                </div>
              </div>
              <ExampleNote />
            </Card>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card icon={Camera} title="Photo wall" actions={["Upload", "Download all"]}>
            {view.photos.length ? (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {view.photos.map((p) => (
                  <li key={p.id} className="overflow-hidden rounded-xl bg-ink/5">
                    <img
                      src={p.url}
                      alt={p.label ? `Shared by ${p.label}` : "A photo from the example event"}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No photos yet.</p>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageCircleHeart className="h-3.5 w-3.5" aria-hidden />
              {view.wishes} well wishes · {view.comments} comments
            </p>
            <ExampleNote />
          </Card>

          <Card icon={Clock3} title="Run of show" actions={["Add block", "Share with vendors"]}>
            {view.runOfShow.length ? (
              <ol className="space-y-2 text-sm">
                {view.runOfShow.map((b) => (
                  <li key={b.id} className="flex gap-3">
                    <span className="w-20 shrink-0 font-medium tabular-nums text-ink">{clockLabel(b.time)}</span>
                    <span className="min-w-0">
                      <span className="text-ink">{b.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {b.durationMin ? ` · ${b.durationMin} min` : ""}
                        {b.owner ? ` · ${b.owner}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No timeline on this event.</p>
            )}
            <ExampleNote />
          </Card>
        </div>

        {view.tables.length ? (
          <div className="mt-6">
            <Card icon={CalendarHeart} title="Seating" actions={["Edit seating", "Print place cards"]}>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {view.tables.map((t) => (
                  <li key={t.id} className="rounded-2xl border border-ink/10 p-3 text-sm">
                    <p className="font-medium text-ink">
                      {t.label} <span className="text-ink/50">· {t.seated.length} of {t.capacity}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{t.seated.join(", ") || "Nobody seated yet"}</p>
                  </li>
                ))}
              </ul>
              <ExampleNote />
            </Card>
          </div>
        ) : null}

        <div className="mt-10 rounded-3xl border border-velvet/20 bg-velvet/5 p-6 text-center">
          <p className="font-serif text-2xl text-ink">{EXAMPLE_NOTE}</p>
          <Link
            to="/events/new"
            onClick={trackCreate}
            className="mt-4 inline-flex min-h-[44px] items-center rounded-full bg-velvet px-6 text-sm font-medium text-white hover:opacity-90"
          >
            Create your own event
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
