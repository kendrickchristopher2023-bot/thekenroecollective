import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchPublicEventBySlug, useEventBySlug, type KEvent } from "@/lib/events-store";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { formatEventDateOnly } from "@/lib/datetime";
import { GlobalErrorFallback } from "@/components/global-error-fallback";

export const Route = createFileRoute("/e/$slug")({
  loader: async ({ params }) => {
    const ev = await fetchPublicEventBySlug(params.slug).catch(() => undefined);
    if (!ev) return { meta: null as null | { title: string; description: string; image?: string } };
    const host = ev.hosts?.[0]?.name || "";
    const dateStr = ev.date ? formatEventDateOnly(ev.date, ev.timezone) : "";
    const descParts = [host && `Hosted by ${host}`, dateStr, ev.venue || ev.address].filter(Boolean);
    const description = descParts.length
      ? `${descParts.join(" • ")}. RSVP and view all the details.`
      : "You're cordially invited. RSVP and view all the details.";
    return { meta: { title: ev.title || params.slug, description, image: ev.image || ev.logo || undefined } };
  },
  head: ({ params, loaderData }) => {
    const url = `https://thekenroecollective.com/e/${params.slug}`;
    const meta = loaderData?.meta;
    const title = meta ? `${meta.title} — You're Invited` : `${params.slug} — The Kenroe Collective`;
    const description = meta?.description ?? "Open the branded invite for this event.";
    const tags = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "event" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: meta?.image ? "summary_large_image" : "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];
    if (meta?.image) {
      tags.push({ property: "og:image", content: meta.image });
      tags.push({ name: "twitter:image", content: meta.image });
    }
    return { meta: tags, links: [{ rel: "canonical", href: url }] };
  },
  errorComponent: GlobalErrorFallback,
  notFoundComponent: () => (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16 text-center">
      <div className="max-w-md">
        <h1 className="font-serif text-3xl text-ink">We couldn't find this invitation</h1>
        <p className="mt-3 text-base text-muted-foreground">
          The link may be incomplete or out of date. Ask whoever sent it to share it again.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-full border border-ink/15 px-6 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
        >
          Go to the home page
        </a>
      </div>
    </div>
  ),
  component: BrandedRedirect,
});


function BrandedRedirect() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const localEvent = useEventBySlug(slug);
  const [remoteEvent, setRemoteEvent] = useState<KEvent | null | undefined>(undefined);

  useEffect(() => {
    if (localEvent) return;
    let cancelled = false;
    fetchPublicEventBySlug(slug).then((e) => { if (!cancelled) setRemoteEvent(e ?? null); });
    return () => { cancelled = true; };
  }, [slug, localEvent]);

  const event = localEvent ?? (remoteEvent || undefined);

  useEffect(() => {
    if (event) {
      navigate({ to: "/invite/$eventId", params: { eventId: event.id }, replace: true });
    }
  }, [event, navigate]);

  const stillLoading = !localEvent && remoteEvent === undefined;

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        {event ? (
          <p className="text-sm text-muted-foreground">Opening {event.title}…</p>
        ) : stillLoading ? (
          <p className="text-sm text-muted-foreground">Looking up <span className="font-mono">/e/{slug}</span>…</p>
        ) : (
          <>
            <h1 className="font-serif text-3xl">We couldn't find that invite</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              The branded link <span className="font-mono">/e/{slug}</span> doesn't match any published event.
              Ask the host to double-check the spelling, or use the direct invite link.
            </p>
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
