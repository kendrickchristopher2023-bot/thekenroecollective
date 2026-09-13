/**
 * Focal points for user-uploaded images.
 *
 * Photos uploaded by hosts, vendors and guests get cropped into fixed frames
 * (circles, banners, square thumbnails). CSS `object-fit: cover` center-crops
 * blindly, which is how a group photo ends up with someone's head sliced off.
 *
 * A focal point records WHICH part of the image should stay visible, plus an
 * optional zoom, so nothing is ever re-encoded and the original upload is
 * untouched.
 *
 * Storage: the focal point rides along in the image URL's hash fragment, e.g.
 *
 *   https://.../photo.jpg#f=50,18,1.4
 *   https://.../photo.jpg#f=50,50,1,contain
 *
 * That choice is deliberate:
 * - no database migration and no new columns on events, vendors or photos;
 * - every existing image, which has no fragment, parses to the center default
 *   and therefore renders EXACTLY as it does today;
 * - servers ignore fragments, so the stored URL still fetches the same file.
 *
 * Always render through `focalImageStyle()` (or `<FocalImage>`) and always
 * fetch through `parseFocalUrl().src`.
 */

export type FocalFit = "cover" | "contain";

export type Focal = {
  /** Horizontal focus, 0 (left) to 100 (right). */
  x: number;
  /** Vertical focus, 0 (top) to 100 (bottom). */
  y: number;
  /** Zoom multiplier, 1 to 3. Only meaningful when fit is "cover". */
  scale: number;
  /** "cover" fills the frame (may crop). "contain" fits the whole photo in. */
  fit: FocalFit;
};

export const DEFAULT_FOCAL: Focal = { x: 50, y: 50, scale: 1, fit: "cover" };

const MIN_SCALE = 1;
const MAX_SCALE = 3;

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n * 100) / 100));
}

export function normalizeFocal(input: Partial<Focal> | null | undefined): Focal {
  if (!input) return DEFAULT_FOCAL;
  return {
    x: clampPct(input.x ?? 50),
    y: clampPct(input.y ?? 50),
    scale: clampScale(input.scale ?? 1),
    fit: input.fit === "contain" ? "contain" : "cover",
  };
}

export function isDefaultFocal(f: Focal | null | undefined): boolean {
  if (!f) return true;
  const n = normalizeFocal(f);
  return n.x === 50 && n.y === 50 && n.scale === 1 && n.fit === "cover";
}

/**
 * Splits a stored image URL into the fetchable src and its focal point.
 * URLs without a focal fragment return the center default, unchanged.
 */
export function parseFocalUrl(url: string | null | undefined): { src: string; focal: Focal } {
  const raw = (url ?? "").trim();
  if (!raw) return { src: "", focal: DEFAULT_FOCAL };
  const at = raw.lastIndexOf("#f=");
  if (at === -1) return { src: raw, focal: DEFAULT_FOCAL };
  const src = raw.slice(0, at);
  const parts = raw.slice(at + 3).split(",");
  return {
    src,
    focal: normalizeFocal({
      x: Number(parts[0]),
      y: Number(parts[1]),
      scale: Number(parts[2] ?? 1),
      fit: (parts[3] as FocalFit) ?? "cover",
    }),
  };
}

/**
 * Writes a focal point back onto a URL. A center/no-zoom focal removes the
 * fragment entirely, so "Reset to center" restores the original stored value.
 */
export function withFocalUrl(url: string | null | undefined, focal: Focal): string {
  const { src } = parseFocalUrl(url);
  if (!src) return "";
  if (isDefaultFocal(focal)) return src;
  const f = normalizeFocal(focal);
  const tail = f.fit === "contain" ? `,${f.fit}` : "";
  return `${src}#f=${f.x},${f.y},${f.scale}${tail}`;
}

/** Inline style that renders an <img> according to its focal point. */
export function focalImageStyle(focal: Focal | null | undefined): {
  objectFit: FocalFit;
  objectPosition: string;
  transform?: string;
  transformOrigin?: string;
} {
  const f = normalizeFocal(focal);
  const objectPosition = `${f.x}% ${f.y}%`;
  if (f.fit === "contain") {
    return { objectFit: "contain", objectPosition: "50% 50%" };
  }
  if (f.scale > 1) {
    return {
      objectFit: "cover",
      objectPosition,
      transform: `scale(${f.scale})`,
      transformOrigin: objectPosition,
    };
  }
  return { objectFit: "cover", objectPosition };
}

/** Convenience: style straight from a stored URL. */
export function focalStyleFromUrl(url: string | null | undefined) {
  return focalImageStyle(parseFocalUrl(url).focal);
}

export const FOCAL_PRESETS: { id: string; label: string; focal: Partial<Focal> }[] = [
  { id: "top", label: "Top", focal: { y: 0 } },
  { id: "center", label: "Center", focal: { y: 50 } },
  { id: "bottom", label: "Bottom", focal: { y: 100 } },
];
