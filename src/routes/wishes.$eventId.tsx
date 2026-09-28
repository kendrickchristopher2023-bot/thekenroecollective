import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { fetchPublicEvent } from "@/lib/events-store";
import { fetchPublicWellWishes, type WellWish } from "@/lib/well-wishes.functions";
import { formatStampDate } from "@/lib/datetime";
import { LoadErrorState } from "@/components/load-error-state";
import { SkeletonPanel } from "@/components/skeletons";

export const Route = createFileRoute("/wishes/$eventId")({
  head: () => ({
    meta: [
      { title: "Well wishes — The Kenroe Collective" },
      {
        name: "description",
        content: "Every message guests left for the guest of honor, gathered in one place.",
      },
      { property: "og:title", content: "Well wishes — The Kenroe Collective" },
      {
        property: "og:description",
        content: "A collection of kind words and memories from the people who were there.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WishesPage,
});

function WishesPage() {
  const { eventId } = Route.useParams();
  const [wishes, setWishes] = useState<WellWish[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [title, setTitle] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setWishes(null);
    setFailed(false);
    fetchPublicWellWishes({ data: { eventId } })
      .then((rows) => !cancelled && setWishes(rows ?? []))
      // A failed load must never look like "nobody has written anything yet".
      .catch(() => !cancelled && setFailed(true));
    fetchPublicEvent(eventId)
      .then((ev) => ev && !cancelled && setTitle(ev.title ?? ""))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, attempt]);

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-6">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-velvet">
            Well wishes
          </span>
          <h1 className="mt-2 font-serif text-4xl font-medium">
            {title ? `Messages for ${title}` : "Messages for the guest of honor"}
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            This is a read-only collection of every message guests have left. Hidden messages are
            not shown here.
          </p>

          <div className="mt-10 space-y-4">
            {failed ? (
              <LoadErrorState
                title="We couldn't load the messages"
                description="They are still saved. Check your connection and try again."
                onRetry={() => setAttempt((n) => n + 1)}
              />
            ) : wishes === null ? (
              <SkeletonPanel />
            ) : wishes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-ink/15 bg-card/60 p-8 text-center">
                <p className="font-serif text-xl text-ink">No messages yet</p>
                <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
                  Every note guests write for the guest of honor will be gathered here. Open your
                  invitation link and be the first to leave one.
                </p>
              </div>
            ) : (
              wishes.map((w) => (
                <div key={w.id} className="rounded-2xl bg-card p-6 ring-1 ring-ink/5">
                  <p className="font-medium">{w.name || "A guest"}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {formatStampDate((w.createdAt))}
                  </p>
                  <p className="mt-3 text-lg leading-relaxed text-ink/80">{w.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
