import { createFileRoute, redirect } from "@tanstack/react-router";
import { Download } from "lucide-react";

import { SiteNav, SiteFooter } from "@/components/site-nav";
import { GlobalErrorFallback } from "@/components/global-error-fallback";
import {
  BRAND_ASSETS,
  BRAND_COLOURS,
  BRAND_RULES,
  BRAND_FILMS,
  BRAND_VOICE_PREVIEWS,
  type BrandAsset,
} from "@/lib/brand-assets";
import { getBrandKit } from "@/lib/brand-kit.functions";
import { OWNER_REPORT_DENIED } from "@/lib/owner-report-access";

/**
 * Owner-only. Lives under the signed-in layout so a visitor is sent to sign in
 * before anything loads, and the loader itself calls an allowlisted server
 * function: a signed-in customer gets no card list, no file links and no zip,
 * only a redirect home. The access rule is the Owner Report allowlist without
 * the 2FA step (see brand-kit.functions.ts).
 */
export const Route = createFileRoute("/_authenticated/brand")({
  loader: async () => {
    try {
      return await getBrandKit();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes(OWNER_REPORT_DENIED.split(":")[0])) {
        throw redirect({ to: "/", replace: true });
      }
      throw e;
    }
  },
  head: () => ({
    meta: [
      { title: "Brand kit — The Kenroe Collective" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "description", content: "Owner-only logo files and scan codes." },
      { property: "og:title", content: "Brand kit — The Kenroe Collective" },
      { property: "og:description", content: "Owner-only logo files and scan codes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BrandPage,
  errorComponent: GlobalErrorFallback,
  notFoundComponent: () => (
    <div className="mx-auto max-w-lg px-4 py-24 text-center text-sm text-muted-foreground">
      That brand file is not here.
    </div>
  ),
});

const GROUND_CLASS: Record<BrandAsset["ground"], string> = {
  light: "bg-[#FAF8F3]",
  dark: "bg-[#1A1A1A]",
  transparent:
    "bg-[repeating-conic-gradient(#e9e5dd_0%_25%,#ffffff_0%_50%)] bg-[length:20px_20px]",
  vector: "bg-[#FAF8F3]",
};

function AssetCard({ asset, href }: { asset: BrandAsset; href: string | undefined }) {
  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className={`flex h-44 items-center justify-center p-6 ${GROUND_CLASS[asset.ground]}`}>
        {href ? (
          <img
            src={href}
            alt={`${asset.label} version of The Kenroe Collective logo`}
            loading="lazy"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-xs text-muted-foreground">Preview unavailable</span>
        )}
      </div>
      <div className="space-y-2 border-t border-border p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-medium text-foreground">{asset.label}</h3>
          <span className="text-xs text-muted-foreground">{asset.dimensions}</span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{asset.what}</p>
        {href ? (
          <a
            href={href}
            download={asset.file}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-velvet hover:underline"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download this one
          </a>
        ) : (
          <span className="text-sm text-muted-foreground">
            This file is missing from storage. Tell the developer.
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * The page used to be one 29,000 pixel column, which meant the scan codes sat
 * about twenty screens down and nobody found them. Everything below is grouped,
 * the two things needed most often sit at the very top, and the long list of
 * previews only opens when asked for.
 */
const FILE_GROUPS: { id: string; title: string; blurb: string; match: (f: string) => boolean; openByDefault: boolean }[] = [
  {
    id: "for-printers",
    title: "Hand these to a printer",
    blurb: "Vector artwork and the 300 dots per inch files. These are the ones that survive print.",
    match: (f) => f.endsWith(".svg") && !f.includes("card-qr"),
    openByDefault: true,
  },
  {
    id: "for-print-pictures",
    title: "Print picture files",
    blurb: "Picture files already stamped at 300 dots per inch, for a printer who will not take vector.",
    match: (f) => f.includes("300dpi") && !f.includes("card-qr"),
    openByDefault: true,
  },
  {
    id: "for-screen",
    title: "Screen, social and link previews",
    blurb: "Profile pictures, the link preview picture, and the everyday wide and portrait versions.",
    match: (f) => !f.includes("card-qr") && !f.includes("300dpi") && !f.endsWith(".svg"),
    openByDefault: false,
  },
  {
    id: "code-files",
    title: "Scan code files",
    blurb: "The shared code and each person's own code, in vector and print quality.",
    match: (f) => f.includes("card-qr"),
    openByDefault: false,
  },
];

const JUMP_LINKS = [
  { href: "#codes", label: "Scan codes" },
  { href: "#files", label: "The files" },
  { href: "#films", label: "Films" },
  { href: "#voice", label: "Voice samples" },
  { href: "#rules", label: "Printing rules" },
];

function BrandPage() {
  const { cards, files, previews, films, zipUrl, ttlSeconds } = Route.useLoaderData();
  const voiceSamples = BRAND_VOICE_PREVIEWS.filter((p) => previews[p.file]);
  const filmCuts = BRAND_FILMS.filter((f) => films[f.file]);
  const link = (file: string) => files[file];
  return (
    <>
      <SiteNav />
      <div className="bg-background">
        <section className="mx-auto max-w-5xl px-4 pt-12 pb-8 sm:px-6">
          <h1 className="font-serif text-3xl font-medium text-foreground sm:text-4xl">
            Logo &amp; brand files
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every version of The Kenroe Collective logo, in one place, plus the scan codes for the
            printed business cards. This page is for owners only, and the download links below
            expire after {Math.round(ttlSeconds / 60)} minutes. Reload the page for fresh ones.
          </p>

          <div className="mt-6 grid gap-5 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
            <div className="min-w-0">
              <a
                href={zipUrl}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download everything as one file
              </a>
              <p className="mt-2 text-xs text-muted-foreground">
                One .zip with all {BRAND_ASSETS.length} files and a short read me covering the
                printing rules.
              </p>
            </div>
            {cards.length > 0 ? (
              <ul className="flex flex-wrap gap-4">
                {cards.map((card) => (
                  <li key={card.slug} className="text-center">
                    <img
                      src={`/api/public/card-qr/${card.slug}`}
                      alt={`Scan code for ${card.full_name}'s card`}
                      width={88}
                      height={88}
                      className="h-20 w-20 rounded-lg bg-white p-1.5 ring-1 ring-border"
                    />
                    <a
                      href="#codes"
                      className="mt-1 block text-xs font-medium text-velvet hover:underline"
                    >
                      {card.full_name.split(" ")[0]}'s code
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <a href="#codes" className="text-sm font-medium text-velvet hover:underline">
                Go to the scan codes
              </a>
            )}
          </div>

          <nav
            aria-label="Jump to a section"
            className="mt-6 flex flex-wrap gap-2 text-sm"
          >
            {JUMP_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-full border border-border px-4 py-2 font-medium text-foreground transition-colors hover:bg-muted"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </section>

        <section id="codes" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            The scan codes
          </h2>
          <div className="mt-5 flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-start sm:p-8">
            <img
              src={link("kenroe-card-qr.svg")}
              alt="Scan code for thekenroecollective.com/card"
              width={160}
              height={160}
              className="h-40 w-40 shrink-0 rounded-lg bg-white p-3"
            />
            <div className="min-w-0">
              <p className="text-sm leading-relaxed text-foreground">
                This shared code opens{" "}
                <span className="font-medium">thekenroecollective.com/card</span>. Where that address
                sends people is set in the owner console and can be changed at any time, so printed
                cards never go out of date.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {BRAND_RULES.qrCode}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={link("kenroe-card-qr.svg")}
                  download="kenroe-card-qr.svg"
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium"
                >
                  Download vector code
                </a>
                <a
                  href={link("kenroe-card-qr-900px-300dpi.png")}
                  download="kenroe-card-qr-900px-300dpi.png"
                  className="rounded-full border border-border px-4 py-2 text-sm font-medium"
                >
                  Download 300 DPI code
                </a>
              </div>
            </div>
          </div>

          {cards.length > 0 ? (
            <div className="mt-6 rounded-2xl border border-border bg-card p-6 sm:p-8">
              <h3 className="font-serif text-lg">Codes for each person's card</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Each code opens that person's own card page. Both files are made fresh each time you
                download them, so a new card never needs a new file from anyone.
              </p>
              <ul className="mt-5 grid gap-5 sm:grid-cols-2">
                {cards.map((card) => (
                  <li key={card.slug} className="flex gap-4 rounded-xl border border-border p-4">
                    <img
                      src={`/api/public/card-qr/${card.slug}`}
                      alt={`Scan code for ${card.full_name}'s card`}
                      width={112}
                      height={112}
                      className="h-28 w-28 shrink-0 rounded-lg bg-white p-2"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{card.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        thekenroecollective.com/card/{card.slug}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={`/api/public/card-qr/${card.slug}`}
                          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium"
                        >
                          Vector
                        </a>
                        <a
                          href={`/api/public/card-qr/${card.slug}?format=png`}
                          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium"
                        >
                          300 DPI
                        </a>
                        <a
                          href={`/api/public/card-qr/${card.slug}?format=png&size=small`}
                          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium"
                        >
                          Small
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section id="files" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            The files
          </h2>
          <div className="mt-5 space-y-4">
            {FILE_GROUPS.map((group) => {
              const assets = BRAND_ASSETS.filter((a) => group.match(a.file));
              if (assets.length === 0) return null;
              return (
                <details
                  key={group.id}
                  open={group.openByDefault}
                  className="group rounded-2xl border border-border bg-card"
                >
                  <summary className="cursor-pointer list-none rounded-2xl px-6 py-5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-base font-medium text-foreground">
                          {group.title}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {group.blurb}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {assets.length} files
                      </span>
                    </span>
                  </summary>
                  <ul className="grid gap-6 border-t border-border p-6 sm:grid-cols-2 lg:grid-cols-3">
                    {assets.map((asset) => (
                      <AssetCard key={asset.file} asset={asset} href={link(asset.file)} />
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>

          <details className="mt-4 rounded-2xl border border-border bg-card">
            <summary className="cursor-pointer list-none px-6 py-5 text-base font-medium text-foreground">
              Does it survive a round profile picture
            </summary>
            <div className="flex flex-wrap items-center gap-8 border-t border-border p-6">
              <div className="text-center">
                <img
                  src={link("kenroe-logo-social-profile-1000x1000.png")}
                  alt="The square profile picture shown inside a circle, with the logo comfortably inside"
                  loading="lazy"
                  className="h-32 w-32 rounded-full border border-border object-cover"
                />
                <p className="mt-3 text-xs text-muted-foreground">Light, circle cropped</p>
              </div>
              <div className="text-center">
                <img
                  src={link("kenroe-logo-social-profile-1000x1000-dark.png")}
                  alt="The dark square profile picture shown inside a circle, with the logo comfortably inside"
                  loading="lazy"
                  className="h-32 w-32 rounded-full border border-border object-cover"
                />
                <p className="mt-3 text-xs text-muted-foreground">Dark, circle cropped</p>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                Most platforms round a profile picture into a circle, which slices the corners off a
                wide logo. The square version stacks the mark above the name and keeps it well
                inside the circle, so nothing is lost at any size.
              </p>
            </div>
          </details>
        </section>

        {voiceSamples.length > 0 ? (
          <section id="voice" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Voice samples
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              The new narration voice, A Southern Gentleman, before anything is final. Owners
              only, same expiring links as the files above.
            </p>
            <ul className="mt-5 grid gap-5 sm:grid-cols-2">
              {voiceSamples.map((p) => (
                <li key={p.file} className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="text-base font-medium text-foreground">{p.label}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.what}</p>
                  <audio controls preload="none" src={previews[p.file]} className="mt-4 w-full" />
                  <a
                    href={previews[p.file]}
                    download={p.file.split("/").pop()}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-velvet hover:underline"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download this one
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {filmCuts.length > 0 ? (
          <section id="films" className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Films
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Rough cuts of the three product films, wide and upright, narrated by A Southern
              Gentleman. Everything shown is invented: the sample wedding, the two sample boards,
              the sample group card and the sample job search. Beside each cut is a contact sheet,
              one still every two seconds with a written list of every name shown. Owners only,
              nothing is on the homepage yet, and these links expire with the page.
            </p>
            <ul className="mt-5 grid gap-6 sm:grid-cols-2">
              {filmCuts.map((f) => (
                <li key={f.file} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <video
                    controls
                    preload="metadata"
                    playsInline
                    src={films[f.file]}
                    className="w-full bg-black"
                  />
                  <div className="space-y-2 border-t border-border p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-base font-medium text-foreground">{f.film}</h3>
                      <span className="text-xs text-muted-foreground">
                        {f.shape} &middot; {f.length}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{f.what}</p>
                    <div className="flex flex-wrap gap-4 pt-1">
                      <a
                        href={films[f.file]}
                        download={f.file.split("/").pop()}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-velvet hover:underline"
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        Download the cut
                      </a>
                      {films[f.sheet] ? (
                        <a
                          href={films[f.sheet]}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-velvet hover:underline"
                        >
                          Contact sheet
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">Contact sheet missing</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section id="rules" className="mx-auto max-w-5xl px-4 py-10 pb-20 sm:px-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            How to use it
          </h2>
          <dl className="mt-5 grid gap-5 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2 sm:p-8">
            <div>
              <dt className="text-sm font-medium text-foreground">Clear space</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {BRAND_RULES.clearSpace}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-foreground">Smallest size on screen</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {BRAND_RULES.minimumSizeScreen}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-foreground">Smallest size in print</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {BRAND_RULES.minimumSizePrint}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-foreground">Color</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {BRAND_RULES.colour}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm font-medium text-foreground">Please do not</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {BRAND_RULES.dontDo}
              </dd>
            </div>
          </dl>

          <ul className="mt-6 flex flex-wrap gap-4">
            {BRAND_COLOURS.map((c) => (
              <li
                key={c.hex}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <span
                  aria-hidden="true"
                  className="h-8 w-8 rounded-md border border-border"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="text-sm">
                  <span className="font-medium text-foreground">{c.name}</span>{" "}
                  <span className="text-muted-foreground">{c.hex}</span>
                  <span className="block text-xs text-muted-foreground">{c.use}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
