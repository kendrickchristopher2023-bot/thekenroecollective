import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getPackageByShareToken, type AiPackageRow } from "@/lib/ai-packages.functions";
import { getPackageBrandingState } from "@/lib/branding.functions";
import { extractAllergens, rollupCost, fmtUsd, exportPackageToPdf } from "@/lib/ai-packages-helpers";
import { KenroesWatermark } from "@/components/kenroes-watermark";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/p/$token")({
  loader: async ({ params }) => {
    const res = await getPackageByShareToken({ data: { token: params.token } });
    if (!res.package) throw notFound();
    return { pkg: res.package };
  },
  notFoundComponent: () => (
    <section className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="font-serif text-3xl text-ink">Link expired or revoked</h1>
      <p className="mt-3 text-sm text-ink/70">This share link is no longer active.</p>
    </section>
  ),
  errorComponent: () => (
    <section className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="font-serif text-3xl text-ink">Something went wrong</h1>
    </section>
  ),
  head: ({ loaderData }) => {
    const title = loaderData?.pkg?.content?.title ?? loaderData?.pkg?.title ?? "Package preview";
    const desc = loaderData?.pkg?.content?.summary ?? "A bespoke package composed in The Kenroe Collective.";
    return {
      meta: [
        { title: `${title} · The Kenroe Collective` },
        { name: "description", content: desc.slice(0, 160) },
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc.slice(0, 200) },
      ],
    };
  },
  component: SharePackagePage,
});

function SharePackagePage() {
  const { pkg } = Route.useLoaderData() as { pkg: AiPackageRow };
  const { token } = Route.useParams();
  const c = pkg.content;
  const allergens = extractAllergens(pkg);
  const roll = rollupCost(pkg);
  const [exporting, setExporting] = useState(false);
  const [watermark, setWatermark] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getPackageBrandingState({ data: { token } } as any)
      .then((r) => { if (!cancelled) setWatermark(!!r?.watermark); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      <KenroesWatermark show={watermark} />
      <header className="border-b border-ink/10 pb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink/50">Shared by The Kenroe Collective</p>
        <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">{c.title || pkg.title}</h1>
        {c.summary && <p className="mt-3 text-base text-ink/70">{c.summary}</p>}

        {(pkg.guest_count || roll.itemsTotalCents > 0 || roll.estimatedTotalCents) && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {pkg.guest_count && (
              <span className="rounded-full bg-secondary/50 px-3 py-1 text-ink/70">{pkg.guest_count} guests</span>
            )}
            {roll.itemsTotalCents > 0 && (
              <span className="rounded-full bg-secondary/50 px-3 py-1 text-ink/70">Items total {fmtUsd(roll.itemsTotalCents)}</span>
            )}
            {roll.perGuestCents !== null && (
              <span className="rounded-full bg-ink text-paper px-3 py-1">{fmtUsd(roll.perGuestCents)}/guest</span>
            )}
            {roll.estimatedTotalCents && (
              <span className="rounded-full bg-secondary/50 px-3 py-1 text-ink/70">Estimate {fmtUsd(roll.estimatedTotalCents)}</span>
            )}
          </div>
        )}

        {allergens.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {allergens.map((a) => (
              <span key={a.label}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${
                  a.tone === "warn" ? "bg-velvet/10 text-velvet ring-velvet/30" : "bg-secondary/60 text-ink/80 ring-ink/10"
                }`}>{a.label}</span>
            ))}
          </div>
        )}

        <div className="mt-5">
          <button
            type="button"
            onClick={async () => { setExporting(true); try { await exportPackageToPdf(pkg); } finally { setExporting(false); } }}
            disabled={exporting}
            className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-paper hover:opacity-90 disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Download as PDF"}
          </button>
        </div>
      </header>

      {c.sections?.length > 0 && (
        <section className="mt-8 space-y-6">
          {c.sections.map((s, i) => (
            <div key={i}>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink/60">{s.heading}</div>
              <ul className="mt-2 space-y-1.5">
                {s.items.map((it, j) => (
                  <li key={j} className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium text-ink">{it.name}</span>
                      {it.description && <span className="text-ink/60"> — {it.description}</span>}
                    </span>
                    {typeof it.price_cents === "number" && (
                      <span className="shrink-0 text-ink/70">${(it.price_cents / 100).toFixed(2)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {c.tiers && c.tiers.length > 0 && (
        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {c.tiers.map((t, i) => (
            <div key={i} className="rounded-2xl bg-secondary/40 p-4">
              <div className="text-sm font-medium text-ink">{t.name}</div>
              {typeof t.price_cents === "number" && (
                <div className="mt-0.5 font-serif text-2xl text-ink">${(t.price_cents / 100).toFixed(2)}</div>
              )}
              <ul className="mt-2 list-disc pl-4 text-xs text-ink/70">
                {t.includes.map((inc, j) => <li key={j}>{inc}</li>)}
              </ul>
            </div>
          ))}
        </section>
      )}

      <footer className="mt-12 border-t border-ink/10 pt-6 text-center text-xs text-ink/50">
        Composed with The Kenroe Collective — <Link to="/" className="underline hover:text-velvet">thekenroecollective.com</Link>
      </footer>
    </section>
  );
}
