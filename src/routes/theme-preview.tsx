/**
 * Internal art-direction preview for the new painted event themes.
 *
 * Unlisted (no nav entry, noindex): it exists so the new backdrop art can be
 * reviewed inside a real invite hero at phone and desktop width before the
 * full theme set is generated.
 */
import { createFileRoute } from "@tanstack/react-router";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { themeArtUrl } from "@/lib/theme-art-library";


export const Route = createFileRoute("/theme-preview")({
  head: () => ({
    meta: [
      { title: "Theme art preview | The Kenroe Collective" },
      { name: "description", content: "Internal preview of painted invitation theme art." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Theme art preview" },
      { property: "og:description", content: "Internal preview of painted invitation theme art." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ThemePreview,
});

const SAMPLES = [
  { id: "bonfire", label: "Bonfire", accent: "#b4531f", title: "Embers & Cider" },
  { id: "wedding", label: "Wedding", accent: "#7a8a6a", title: "Ava & Julian" },
  { id: "birthday", label: "Birthday party", accent: "#b07f86", title: "Thirty, Finally" },
  { id: "corporate", label: "Corporate", accent: "#3f4a5c", title: "Annual Partners Dinner" },
  { id: "baby-shower", label: "Baby shower", accent: "#8fb8c9", title: "Baby Ellis" },
  { id: "bbq", label: "BBQ", accent: "#a8431f", title: "Backyard Smoke" },
  { id: "wine-tasting", label: "Wine tasting", accent: "#6b1f34", title: "Six Bottles North" },
  { id: "new-years-eve", label: "New Year's Eve", accent: "#a3852f", title: "Midnight, Uptown" },
  { id: "holiday-party", label: "Holiday party", accent: "#1f5b3a", title: "Evergreen Supper" },
  { id: "halloween", label: "Halloween", accent: "#6a2fa0", title: "The Long Dusk" },
  { id: "garden-party", label: "Garden party", accent: "#5f8a4a", title: "Roses at Four" },
  { id: "graduation", label: "Graduation", accent: "#1f3a5f", title: "Class of 2026" },
].map((s) => ({ ...s, src: themeArtUrl(s.id)! }));


function ThemePreview() {
  return (
    <main className="bg-paper pb-24">
      <h1 className="px-6 pt-10 text-center font-serif text-2xl">Painted theme art, in situ</h1>
      <p className="mx-auto mt-2 max-w-xl px-6 text-center text-sm text-ink/60">
        Each block is the real invite hero composition with the new backdrop art.
      </p>
      <div className="mt-10 space-y-12">
        {SAMPLES.map((s) => (
          <section key={s.id} data-theme={s.id}>
            <p className="px-6 text-[10px] font-semibold uppercase tracking-[0.25em] text-ink/40">{s.label}</p>
            <div className="relative mt-2 overflow-hidden border-y border-ink/5">
              <ThemeBackdrop src={s.src} />
              <div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(1200px 600px at 50% -20%, ${s.accent}18, transparent 60%)`,
                }}
              />
              <div className="relative mx-auto max-w-3xl px-6 pb-16 pt-14 text-center sm:pt-20">
                <span className="inline-flex items-center gap-2 rounded-full bg-paper/70 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.25em] text-velvet ring-1 ring-velvet/20 backdrop-blur">
                  A personal invitation
                </span>
                <p className="mt-8 text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
                  Saturday, October 11 · 6:30 PM
                </p>
                <h2 className="mt-3 font-serif text-5xl font-medium leading-tight tracking-tight sm:text-6xl">
                  {s.title}
                </h2>
                <p className="mt-4 text-lg text-ink/70">The Ridgeline House · 40 Alder Lane</p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                  <span className="rounded-full bg-velvet px-6 py-3 text-sm font-medium text-white shadow-lg shadow-velvet/20">
                    RSVP now →
                  </span>
                  <span className="rounded-full bg-paper px-5 py-3 text-sm font-medium text-ink ring-1 ring-ink/10">
                    Save the date
                  </span>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
