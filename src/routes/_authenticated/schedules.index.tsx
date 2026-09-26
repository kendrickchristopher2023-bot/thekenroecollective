import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Plus, Users } from "lucide-react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { SkeletonPanel } from "@/components/skeletons";
import { getScheduleAccess, listSchedules } from "@/lib/schedules.functions";
import { describeRule } from "@/lib/schedule-rrule";
import { whenLabel } from "@/lib/schedule-messages";
import { toUserMessage } from "@/lib/user-error";

export const Route = createFileRoute("/_authenticated/schedules/")({
  head: () => ({
    meta: [
      { title: "Schedules, The Kenroe Collective" },
      { name: "description", content: "Set up a repeating call once and Kenroe reminds everyone by email and text." },
      { property: "og:title", content: "Schedules, The Kenroe Collective" },
      { property: "og:description", content: "Repeating calls and meetings with automatic email and text reminders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SchedulesPage,
});

function SchedulesPage() {
  const access = useServerFn(getScheduleAccess);
  const list = useServerFn(listSchedules);
  const [canUse, setCanUse] = useState<boolean | null>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [a, r] = await Promise.all([access(), list()]);
        if (!alive) return;
        setCanUse(a.canUse);
        setRows(r);
      } catch (e) {
        if (alive) setError(toUserMessage(e));
      }
    })();
    return () => { alive = false; };
  }, [access, list]);

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 lg:py-14 2xl:max-w-6xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Schedules</p>
            <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Repeating calls, remembered for you</h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Set it up once. Everyone gets an email and a text before each call, with the join link and a calendar invite.
            </p>
          </div>
          {canUse ? (
            <Link to="/schedules/$id" params={{ id: "new" }} className="inline-flex items-center gap-2 self-start rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground sm:self-auto">
              <Plus className="h-4 w-4" /> New schedule
            </Link>
          ) : null}
        </header>

        {error ? <p className="mt-8 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">{error}</p> : null}

        {canUse === false && !(rows?.length && rows.every((r) => r.role && r.role !== "owner")) ? (
          <div className="mt-8 rounded-3xl bg-card p-8 ring-1 ring-ink/5">
            <h2 className="font-serif text-xl">Schedules is included with Host and Atelier plans</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {rows?.length
                ? "Your schedules are still here and you can edit them. Reminders are paused until your plan includes Schedules again."
                : "Upgrade to set up repeating calls with automatic reminders."}
            </p>
            <Link to="/pricing" className="mt-5 inline-flex rounded-full bg-velvet px-5 py-2.5 text-sm font-medium text-primary-foreground">See plans</Link>
          </div>
        ) : null}

        {rows === null && !error ? <div className="mt-8"><SkeletonPanel /></div> : null}

        {rows && rows.length === 0 && canUse ? (
          <div className="mt-8 rounded-3xl bg-card p-10 text-center ring-1 ring-ink/5">
            <CalendarClock className="mx-auto h-8 w-8 text-velvet" />
            <h2 className="mt-3 font-serif text-xl">No schedules yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              For example: the family call on the 1st Sunday of every month at 7:00 PM.
            </p>
          </div>
        ) : null}

        {rows && rows.length > 0 ? (
          <ul className="mt-8 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Link to="/schedules/$id" params={{ id: r.id }} className="block h-full rounded-3xl bg-card p-6 ring-1 ring-ink/5 transition hover:ring-velvet/30">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-serif text-lg leading-snug">{r.title}</h2>
                    {r.role && r.role !== "owner" ? <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs">Shared with you</span> : <StatusPill status={r.status} paused={canUse === false} />}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{describeRule(r.rrule)}</p>
                  <p className="mt-4 text-sm">
                    {r.next_at ? <>Next: <span className="font-medium">{whenLabel(new Date(r.next_at), r.timezone)}</span></> : "No upcoming dates"}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {r.people_count} {r.people_count === 1 ? "person" : "people"}</span>
                    {r.held_count ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{r.held_count} reminder{r.held_count === 1 ? "" : "s"} held or paused</span> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}

function StatusPill({ status, paused }: { status: string; paused: boolean }) {
  const label = paused ? "Reminders paused" : status === "active" ? "Active" : status === "paused" ? "Paused" : "Ended";
  const tone = paused || status === "paused" ? "bg-amber-100 text-amber-900" : status === "active" ? "bg-emerald-100 text-emerald-900" : "bg-secondary text-muted-foreground";
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${tone}`}>{label}</span>;
}
