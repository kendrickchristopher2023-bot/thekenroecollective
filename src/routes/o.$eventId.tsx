import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarRange, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { formatEventDateOnly } from "@/lib/datetime";
import { LoadErrorState } from "@/components/load-error-state";
import { SkeletonPanel } from "@/components/skeletons";
import {
  fetchOccasion,
  resolveOccasionGuest,
  submitOccasionRsvp,
  type OccasionGathering,
} from "@/lib/series.functions";

export const Route = createFileRoute("/o/$eventId")({
  head: () => {
    const title = "Your weekend invitation — The Kenroe Collective";
    const description =
      "One link for the whole occasion: see every gathering and reply to them all in one place.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "event" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
    };
  },
  component: OccasionPage,
});

type Invited = { eventId: string; guestId: string; status: string };

function whenLine(g: OccasionGathering) {
  const date = g.date ? formatEventDateOnly(g.date, g.timezone ?? null) : "";
  return [date, g.time || "", g.venue || ""].filter(Boolean).join(" • ");
}

function OccasionPage() {
  const { eventId } = Route.useParams();
  const [seriesName, setSeriesName] = useState("");
  const [gatherings, setGatherings] = useState<OccasionGathering[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [query, setQuery] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestId, setGuestId] = useState("");
  const [invited, setInvited] = useState<Invited[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchOccasion({ data: { eventId } })
      .then((res) => {
        if (cancelled) return;
        setSeriesName(res.seriesName);
        setGatherings(res.gatherings);
      })
      // Without this, a dropped request looked exactly like "this link is not
      // part of a multi-day occasion", which sent guests to the wrong place.
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [eventId, attempt]);

  // Personal links carry ?g=<guest id> on the anchor gathering, so those guests
  // never have to look themselves up.
  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get("g");
    if (!g) return;
    resolveOccasionGuest({ data: { eventId, g } })
      .then((res) => {
        if (res.kind !== "match") return;
        setGuestId(g);
        setGuestName(res.guestName);
        setInvited(res.invited);
        setStatuses(Object.fromEntries(res.invited.map((i) => [i.eventId, i.status])));
      })
      .catch(() => undefined);
  }, [eventId]);

  const findMe = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setNotFound(false);
    try {
      const res = await resolveOccasionGuest({ data: { eventId, query } });
      if (res.kind === "match") {
        const anchor = res.invited.find((i) => i.eventId === eventId) ?? res.invited[0];
        setGuestId(anchor?.guestId ?? "");
        setGuestName(res.guestName);
        setInvited(res.invited);
        setStatuses(Object.fromEntries(res.invited.map((i) => [i.eventId, i.status])));
      } else {
        setNotFound(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const answer = async (value: "yes" | "no" | "maybe", only?: string[]) => {
    if (!guestId) return;
    setBusy(true);
    try {
      const res = await submitOccasionRsvp({ data: { eventId, guestId, answer: value, only } });
      setStatuses((prev) => {
        const next = { ...prev };
        for (const r of res.results) next[r.eventId] = r.status;
        return next;
      });
      toast.success(only ? "Reply saved." : "Thank you, all of your replies are in.");
    } catch {
      toast.error("We couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const invitedIds = new Set(invited.map((i) => i.eventId));
  const mine = gatherings.filter((g) => invitedIds.has(g.id));

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-6 py-14">
        <p className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" /> The occasion
        </p>
        <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">
          {loading ? "Loading your invitation…" : seriesName || "You're invited"}
        </h1>

        {loading && <SkeletonPanel />}

        {failed && (
          <LoadErrorState
            className="mt-6"
            title="We couldn't load your invitation"
            description="Nothing is lost. Check your connection and try again."
            onRetry={() => setAttempt((n) => n + 1)}
          />
        )}

        {!loading && !failed && gatherings.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            This link isn't part of a multi-day occasion.{" "}
            <Link to="/invite/$eventId" params={{ eventId }} className="underline">
              Open the invitation
            </Link>
            .
          </p>
        )}

        {gatherings.length > 0 && !guestId && (
          <div className="mt-6 space-y-3 rounded-2xl bg-card p-5 ring-1 ring-ink/10">
            <p className="text-sm text-ink">Find your name to reply to every gathering at once.</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && findMe()}
                placeholder="Your name or email"
                aria-label="Your name or email"
                className="min-h-[44px] rounded-xl bg-secondary px-3 text-sm text-ink ring-1 ring-ink/10 focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
              <button
                type="button"
                onClick={findMe}
                disabled={busy || !query.trim()}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-ink px-6 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Find me
              </button>
            </div>
            {notFound && (
              <p className="text-xs text-muted-foreground">
                We couldn't match that. Try the exact spelling on your invitation, or reply to each
                gathering separately below.
              </p>
            )}
          </div>
        )}

        {guestId && (
          <div className="mt-6 space-y-3 rounded-2xl bg-card p-5 ring-1 ring-ink/10">
            <p className="text-sm text-ink">
              Hi {guestName || "there"}, you're invited to {mine.length}{" "}
              {mine.length === 1 ? "gathering" : "gatherings"}.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => answer("yes")}
                disabled={busy}
                className="min-h-[44px] rounded-full bg-ink px-6 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
              >
                Yes to everything
              </button>
              <button
                type="button"
                onClick={() => answer("no")}
                disabled={busy}
                className="min-h-[44px] rounded-full bg-card px-6 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-ink/5 disabled:opacity-50"
              >
                Can't make any of it
              </button>
            </div>
          </div>
        )}

        <ul className="mt-6 space-y-3">
          {(guestId ? mine : gatherings).map((g) => {
            const status = statuses[g.id];
            return (
              <li key={g.id} className="rounded-2xl bg-card p-4 ring-1 ring-ink/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{g.title}</p>
                    <p className="text-xs text-muted-foreground">{whenLine(g) || "Details to come"}</p>
                  </div>
                  {status && status !== "pending" && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink/5 px-2 py-1 text-[11px] text-ink">
                      <Check className="h-3 w-3" />
                      {status === "yes"
                        ? "Going"
                        : status === "no"
                          ? "Not going"
                          : status === "waitlisted"
                            ? "Waitlisted"
                            : "Maybe"}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {guestId && (
                    <>
                      <button
                        type="button"
                        onClick={() => answer("yes", [g.id])}
                        disabled={busy}
                        className="min-h-[40px] rounded-full bg-ink/90 px-4 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => answer("maybe", [g.id])}
                        disabled={busy}
                        className="min-h-[40px] rounded-full bg-card px-4 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-ink/5 disabled:opacity-50"
                      >
                        Maybe
                      </button>
                      <button
                        type="button"
                        onClick={() => answer("no", [g.id])}
                        disabled={busy}
                        className="min-h-[40px] rounded-full bg-card px-4 text-xs font-medium text-ink ring-1 ring-ink/15 hover:bg-ink/5 disabled:opacity-50"
                      >
                        No
                      </button>
                    </>
                  )}
                  <Link
                    to="/invite/$eventId"
                    params={{ eventId: g.id }}
                    className="inline-flex min-h-[40px] items-center rounded-full px-4 text-xs font-medium text-ink underline-offset-4 hover:underline"
                  >
                    Full details
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-[11px] text-muted-foreground">
          Plus-ones, meals, gifts and payments are handled on each gathering's own invitation page.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
