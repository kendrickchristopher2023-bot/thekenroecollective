import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { duplicateEvent, formatEventDate, rsvpCounts, sharedEventRole, useEvents } from "@/lib/events-store";
import { isShowcaseEvent } from "@/lib/showcase";
import { eventTimeInVenueZone } from "@/lib/event-time";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { useGuestNoteCounts } from "@/hooks/use-guest-notes";
import { useMyEventsRealtime } from "@/hooks/use-event-realtime";
import { AiRecommendations } from "@/components/ai-recommendations";
import { EventHealth } from "@/components/event-health";
import { QuickActions } from "@/components/quick-actions";
import { EmptyState as SharedEmptyState } from "@/components/empty-state";
import { CalendarHeart, Copy, Search } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/events/")({
  head: () => ({
    meta: [
      { title: "Your Gatherings — The Kenroe Collective" },
      { name: "description", content: "Access your dashboard to manage upcoming gatherings, guest lists, RSVPs, and invitations in one place." },
      { property: "og:title", content: "Your Gatherings — The Kenroe Collective" },
      { property: "og:description", content: "Manage upcoming gatherings, guest lists, RSVPs, and invitations in one beautifully simple dashboard." },
      { property: "og:url", content: "https://thekenroecollective.com/events" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/events" }],
  }),
  component: EventsDashboard,
});

function EventsDashboard() {
  const { ready, user } = useAuthReady();
  const navigate = useNavigate();
  const events = useEvents();
  useMyEventsRealtime();
  const [query, setQuery] = useState("");
  // Your own events lead; events shared WITH you follow, clearly labelled, so
  // it's never ambiguous which ones are yours.
  const sorted = [...events]
    .filter((e) => !!e?.id)
    .sort((a, b) => {
      const sa = sharedEventRole(a.id) ? 1 : 0;
      const sb = sharedEventRole(b.id) ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return +new Date(a.date) - +new Date(b.date);
    });
  const eventIds = useMemo(() => sorted.map((e) => e.id), [sorted.map((e) => e.id).join(",")]);
  const guestNotes = useGuestNoteCounts(eventIds);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((e) => {
      const hay = `${e.title ?? ""} ${e.seriesName ?? ""} ${e.venue ?? ""} ${e.address ?? ""} ${e.date ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, query]);

  function onDuplicate(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const copy = duplicateEvent(id);
    if (!copy) {
      toast.error("Couldn't duplicate this event.");
      return;
    }
    toast.success("Event duplicated. Adjust the date and details.");
    navigate({ to: "/events/$eventId", params: { eventId: copy.id } });
  }

  useEffect(() => {
    if (ready && !user) {
      navigate({ to: "/auth", search: { redirect: "/events" } as never, replace: true });
    }
  }, [ready, user, navigate]);

  if (!ready || !user) {
    return (
      <div className="min-h-screen bg-paper">
        <SiteNav />
        <section className="py-20">
          <div className="mx-auto max-w-7xl px-6 text-center">
            <p className="text-sm text-muted-foreground">Sign in to view your gatherings…</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
                Host Dashboard
              </span>
              <h1 className="font-serif text-4xl font-medium">Your Upcoming Gatherings</h1>
              <p className="text-sm text-muted-foreground">
                Active orchestration for the season.
              </p>
            </div>
            <Link
              to="/events/new"
              data-tour="create-event"
              className="inline-flex items-center self-start rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 sm:self-auto"
            >
              + New Event
            </Link>

          </div>

          <QuickActions />
          <EventHealth events={sorted} />
          <AiRecommendations events={sorted} />

          {sorted.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2 rounded-full bg-card px-4 py-2 ring-1 ring-ink/10 shadow-sm">
                <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(ev) => setQuery(ev.target.value)}
                  placeholder="Search by title, venue, address, or date…"
                  aria-label="Search your events"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-xs text-muted-foreground hover:text-ink"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {filtered.length === 0 ? (
                <div className="rounded-xl bg-card p-6 text-center ring-1 ring-ink/5">
                  <p className="text-sm text-muted-foreground">
                    No events match "{query}".
                  </p>
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="mt-3 rounded-full bg-velvet px-4 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {filtered.map((e) => {
                    const shared = sharedEventRole(e.id);
                    const d = formatEventDate(e.date, e.timezone);
                    const c = rsvpCounts(e);
                    const yesPct = c.total > 0 ? Math.round((c.yes / c.total) * 100) : 0;
                    const maybePct = c.total > 0 ? Math.round(((c.maybe ?? 0) / c.total) * 100) : 0;
                    return (
                      <Link
                        key={e.id}
                        to="/events/$eventId"
                        params={{ eventId: e.id }}
                        className="group flex flex-col gap-4 rounded-xl bg-card p-6 ring-1 ring-ink/5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex w-full min-w-0 flex-1 items-center gap-4 sm:gap-6">
                          <div className="flex min-w-[56px] shrink-0 flex-col items-center justify-center rounded-lg bg-secondary p-3 text-center">
                            <span className="text-[10px] font-medium uppercase tracking-tighter text-muted-foreground">
                              {d.month}
                            </span>
                            <span className="text-xl font-medium leading-none">{d.day}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h5 className="truncate font-medium">{e.title}</h5>
                              {shared ? (
                                <span className="shrink-0 rounded-full bg-velvet/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-velvet">
                                  Shared with you · {shared === "viewer" ? "Viewer" : "Co-host"}
                                </span>
                              ) : null}
                              {e._isDemo ? (
                                <span
                                  className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700"
                                  title="Sample data for showing the product. It is left out of every report and count."
                                >
                                  Demo sample
                                </span>
                              ) : null}
                              {e.seriesName?.trim() ? (
                                <span
                                  className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
                                  title="Part of a bigger occasion"
                                >
                                  {e.seriesName.trim()}
                                </span>
                              ) : null}
                              {(guestNotes[e.id]?.unreadComments ?? 0) > 0 ? (
                                <span
                                  className="shrink-0 rounded-full bg-velvet px-2 py-0.5 text-[10px] font-semibold text-white"
                                  title="New guest comments on your invitation"
                                >
                                  {guestNotes[e.id]?.unreadComments} new comment
                                  {guestNotes[e.id]?.unreadComments === 1 ? "" : "s"}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span className="truncate">
                                {eventTimeInVenueZone(e.date, e.timezone)}
                              </span>
                              <span className="truncate">{e.venue}</span>

                              {e.address ? (
                                <span className="min-w-0 flex-1 truncate">{e.address}</span>
                              ) : null}
                              <span className="flex items-center gap-1.5">
                                <span className="h-1 w-1 rounded-full bg-zinc-300" />
                                {c.yes} confirmed · {c.total} invited
                              </span>
                            </div>
                            {c.total > 0 ? (
                              <div
                                className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-secondary"
                                role="progressbar"
                                aria-valuenow={yesPct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`RSVP progress: ${c.yes} confirmed of ${c.total} invited`}
                                title={`${c.yes} confirmed · ${c.maybe ?? 0} maybe · ${c.no ?? 0} declined · ${c.total - c.yes - (c.maybe ?? 0) - (c.no ?? 0)} pending`}
                              >
                                <div className="flex h-full">
                                  <div className="h-full bg-velvet" style={{ width: `${yesPct}%` }} />
                                  <div className="h-full bg-gold/60" style={{ width: `${maybePct}%` }} />
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
                          <button
                            type="button"
                            hidden={!!shared || !!e._isDemo || isShowcaseEvent(e.id)}
                            onClick={(ev) => onDuplicate(ev, e.id)}
                            aria-label={`Duplicate ${e.title}`}
                            title="Duplicate this event"
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ring-1 ring-ink/10 transition-colors hover:bg-secondary sm:flex-none"
                          >
                            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                            Duplicate
                          </button>
                          <span className="flex-1 rounded-lg px-4 py-2 text-center text-sm font-medium ring-1 ring-ink/10 transition-colors group-hover:bg-secondary sm:flex-none">
                            Manage →
                          </span>
                        </div>
                      </Link>

                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function EmptyState() {
  return (
    <SharedEmptyState
      icon={CalendarHeart}
      title="No events yet"
      description="Create your first event to start building invitations, tracking RSVPs, and managing guests in one place."
      cta={{ label: "Create your first event →", to: "/events/new" }}
      secondary={{ label: "See a finished example", to: "/example/host" }}
      tips={[
        "You can start with just a title and date — everything else can be added later.",
        "Import guests from a CSV, phone contacts, or by pasting a list.",
        "Every event gets a shareable link and a QR code for check-in.",
      ]}
    />
  );
}
