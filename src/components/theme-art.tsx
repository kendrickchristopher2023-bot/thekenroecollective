import type { KEvent } from "@/lib/events-store";
import { focalImageStyle, parseFocalUrl } from "@/lib/image-focal";

export type ThemeArtMode = NonNullable<KEvent["themeArtMode"]>;

/** Resolved theme-art settings, or null when the host hasn't uploaded any. */
export function resolveThemeArt(event: Pick<KEvent, "themeArt" | "themeArtMode" | "themeArtOpacity">) {
  const stored = event.themeArt?.trim();
  if (!stored) return null;
  // The host's chosen focal point rides on the URL; images without one keep the
  // old centered crop exactly.
  const { src: url, focal } = parseFocalUrl(stored);
  if (!url) return null;
  const mode: ThemeArtMode = event.themeArtMode ?? "background";
  const raw = event.themeArtOpacity;
  const opacity = Math.min(1, Math.max(0.15, typeof raw === "number" && !Number.isNaN(raw) ? raw : 0.35));
  return { url, mode, opacity, focal };
}


/**
 * Host-uploaded decorative artwork rendered behind the invite hero.
 *
 * Purely decorative, so it is hidden from assistive tech and never intercepts
 * pointer events. Two visible modes:
 *
 * - background: one covered layer at the host's chosen strength, with a
 *   paper-toned scrim on top so the title always stays readable.
 * - frame: top and bottom bands on a phone, widening to a four-edge border from
 *   1024px, each band fading inward so the art reads as an ornament rather
 *   than wallpaper. Band depth steps up with the viewport to stay proportional.
 *
 * "envelope-only" renders nothing here; it only skins the opening animation.
 */
export function ThemeArtLayer({
  event,
}: {
  event: Pick<KEvent, "themeArt" | "themeArtMode" | "themeArtOpacity">;
}) {
  const art = resolveThemeArt(event);
  if (!art || art.mode === "envelope-only") return null;

  if (art.mode === "background") {
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <img
          src={art.url}
          alt=""
          className="h-full w-full"
          style={{ opacity: art.opacity, ...focalImageStyle(art.focal) }}
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-paper/55 sm:bg-paper/50" />
      </div>
    );
  }

  const band = "pointer-events-none absolute bg-cover";
  const bandImage = {
    backgroundImage: `url("${art.url}")`,
    backgroundPosition: `${art.focal.x}% ${art.focal.y}%`,
    opacity: Math.min(1, art.opacity + 0.35),
  };

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div
        className={`${band} inset-x-0 top-0 h-10 sm:h-14 2xl:h-20`}
        style={{
          ...bandImage,
          maskImage: "linear-gradient(to bottom, black, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      />
      <div
        className={`${band} inset-x-0 bottom-0 h-10 sm:h-14 2xl:h-20`}
        style={{
          ...bandImage,
          maskImage: "linear-gradient(to top, black, transparent)",
          WebkitMaskImage: "linear-gradient(to top, black, transparent)",
        }}
      />
      <div
        className={`${band} inset-y-0 left-0 hidden w-10 lg:block 2xl:w-16`}
        style={{
          ...bandImage,
          maskImage: "linear-gradient(to right, black, transparent)",
          WebkitMaskImage: "linear-gradient(to right, black, transparent)",
        }}
      />
      <div
        className={`${band} inset-y-0 right-0 hidden w-10 lg:block 2xl:w-16`}
        style={{
          ...bandImage,
          maskImage: "linear-gradient(to left, black, transparent)",
          WebkitMaskImage: "linear-gradient(to left, black, transparent)",
        }}
      />
    </div>
  );
}
