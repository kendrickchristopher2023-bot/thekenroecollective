/**
 * Theme backdrop: the painted stationery artwork that sits behind an invite
 * hero.
 *
 * Replaces the old geometric CSS frames (scallops, gingham, dot rows) which
 * read as clip-art. The art is generated as real illustration, composed with
 * open negative space in the middle, and rendered here so the content always
 * wins:
 *
 * - the art is `cover`, anchored to the edges, at a restrained opacity;
 * - an ivory scrim plus a centre-weighted radial mask lift the middle of the
 *   canvas so the title, date and CTA never sit on top of illustration;
 * - on phones the art is pushed further back (lower opacity, stronger centre
 *   lift) because that is where space is tightest.
 *
 * Purely decorative: hidden from assistive tech, never intercepts pointers.
 */

export function ThemeBackdrop({
  src,
  strength = 0.85,
}: {
  /** Artwork URL (curated theme art, host upload, or AI-generated). */
  src: string;
  /** 0.4 to 1 — how present the art is. Defaults to the curated setting. */
  strength?: number;
}) {
  const s = Math.min(1, Math.max(0.4, strength));
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover object-bottom opacity-[0.8] sm:object-center sm:opacity-[0.85]"
        style={{ opacity: undefined, filter: "saturate(0.95)" }}
      />
      {/* Centre lift: keeps the type on clean paper at every width. Stronger on
          phones, where the hero is narrow and the art crowds in. */}
      <div
        className="absolute inset-0 sm:hidden"
        style={{
          background:
            "radial-gradient(115% 55% at 50% 38%, color-mix(in oklab, var(--paper, #fdfaf4) 94%, transparent) 0%, color-mix(in oklab, var(--paper, #fdfaf4) 72%, transparent) 55%, transparent 88%)",
        }}
      />
      <div
        className="absolute inset-0 hidden sm:block"
        style={{
          background:
            "radial-gradient(90% 65% at 50% 45%, color-mix(in oklab, var(--paper, #fdfaf4) 88%, transparent) 0%, color-mix(in oklab, var(--paper, #fdfaf4) 55%, transparent) 55%, transparent 85%)",
          opacity: 1.15 - s * 0.35,
        }}
      />
    </div>
  );
}
