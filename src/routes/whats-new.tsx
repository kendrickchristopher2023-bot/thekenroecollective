import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { listPublicProductUpdates } from "@/lib/product-updates.functions";
import { SkeletonBlock } from "@/components/skeletons";
import { formatStampLongDate } from "@/lib/datetime";

export const Route = createFileRoute("/whats-new")({
  head: () => ({
    meta: [
      { title: "What's new, The Kenroe Collective" },
      {
        name: "description",
        content: "New features and improvements to The Kenroe Collective, as they ship.",
      },
      { property: "og:title", content: "What's new, The Kenroe Collective" },
      { property: "og:url", content: "https://thekenroecollective.com/whats-new" },
    ],
    links: [{ rel: "canonical", href: "https://thekenroecollective.com/whats-new" }],
  }),
  component: WhatsNewPage,
});

type Update = {
  id: string;
  title: string;
  emoji: string | null;
  body_html: string;
  cover_image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  published_at: string | null;
};

/** Venture labels, matched from the title prefix so each entry is clearly tagged. */
const VENTURES = [
  { prefix: "Group eCards", label: "Group eCards" },
  { prefix: "Events and Gatherings", label: "Events and Gatherings" },
  { prefix: "Events & Gatherings", label: "Events and Gatherings" },
  { prefix: "Projects", label: "Projects" },
  { prefix: "The Workroom", label: "Projects" },
];

function ventureOf(title: string): string | null {
  const hit = VENTURES.find((v) => title.startsWith(`${v.prefix}:`));
  return hit ? hit.label : null;
}

function stripVenture(title: string): string {
  const hit = VENTURES.find((v) => title.startsWith(`${v.prefix}:`));
  return hit ? title.slice(hit.prefix.length + 1).trim() : title;
}

function WhatsNewPage() {
  const fetchUpdates = useServerFn(listPublicProductUpdates);
  const [updates, setUpdates] = useState<Update[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUpdates()
      .then((rows) => {
        if (!cancelled) setUpdates(rows as Update[]);
      })
      .catch(() => {
        if (!cancelled) setUpdates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchUpdates]);

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="border-b border-ink/5 py-14">
        <div className="mx-auto max-w-3xl px-6">
          <p className="text-[10px] uppercase tracking-widest text-velvet">Changelog</p>
          <h1 className="mt-2 font-serif text-4xl">What's new</h1>
          <p className="mt-3 max-w-prose text-muted-foreground">
            New features and refinements across our ventures, most recent first. Each entry is
            labeled with the venture it belongs to.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-3xl px-6">
          {updates === null ? (
            <div className="space-y-8">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <SkeletonBlock className="h-4 w-32" />
                  <SkeletonBlock className="h-6 w-2/3" />
                  <SkeletonBlock className="h-16 w-full" />
                </div>
              ))}
            </div>
          ) : updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing published yet, check back soon.</p>
          ) : (
            <ol className="space-y-12">
              {updates.map((u) => (
                <li key={u.id} className="border-l-2 border-velvet/20 pl-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                      {u.published_at
                        ? formatStampLongDate((u.published_at))
                        : ""}
                    </div>
                    {ventureOf(u.title) && (
                      <span className="rounded-full border border-velvet/25 bg-velvet/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-velvet">
                        {ventureOf(u.title)}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 font-serif text-2xl">
                    {u.emoji ? <span className="mr-2">{u.emoji}</span> : null}
                    {stripVenture(u.title)}
                  </h2>

                  {u.cover_image_url && (
                    <img
                      src={u.cover_image_url}
                      alt={`${u.title} cover`}
                      className="mt-4 max-h-72 w-full rounded-xl object-cover"
                    />
                  )}
                  {u.body_html && (
                    <div
                      className="whatsnew-content prose-sm mt-4 text-sm leading-relaxed text-ink/85"
                      dangerouslySetInnerHTML={{ __html: u.body_html }}
                    />
                  )}
                  {u.cta_url && (
                    <a
                      href={u.cta_url}
                      target={u.cta_url.startsWith("http") ? "_blank" : undefined}
                      rel="noreferrer"
                      className="mt-4 inline-block text-sm font-medium text-velvet underline"
                    >
                      {u.cta_label || "Learn more"} →
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <style>{`
        .whatsnew-content p { margin: 0 0 0.6em; }
        .whatsnew-content ul { list-style: disc; padding-left: 1.2rem; margin: 0 0 0.6em; }
        .whatsnew-content ol { list-style: decimal; padding-left: 1.2rem; margin: 0 0 0.6em; }
        .whatsnew-content img { max-width: 100%; border-radius: 10px; margin: 8px 0; }
        .whatsnew-content a { color: #5c1d1d; text-decoration: underline; }
        .whatsnew-content h3 { font-weight: 600; font-size: 1rem; margin: 0.5em 0; }
        .whatsnew-content blockquote { border-left: 2px solid rgb(0 0 0 / 0.15); padding-left: 0.6rem; font-style: italic; color: rgb(0 0 0 / 0.7); }
      `}</style>

      <SiteFooter />
    </div>
  );
}
