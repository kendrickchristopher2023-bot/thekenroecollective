/**
 * Homepage collection films. One entry per ventures.category that has a film.
 *
 * Files live in the public `site-films` storage bucket. Names are versioned
 * (…-v1) so a future re-render ships under a new name and never fights the
 * CDN cache. Nothing here is fetched until a visitor opens the player.
 */
const SITE_FILMS_BASE =
  "https://reneuqfwxiatnhfdmscq.supabase.co/storage/v1/object/public/site-films";

export type SiteFilm = {
  /** Stable key, also used in the per-device "seen" flag. */
  key: string;
  /** Must match `ventures.category` exactly. */
  category: string;
  /** Spoken name, e.g. "the Celebrations film". */
  title: string;
  /** 1920x1080 cut. */
  horizontal: string;
  /** 1080x1920 cut. */
  vertical: string;
  posterHorizontal: string;
  posterVertical: string;
  /** Shown on the button, e.g. "0:42". */
  durationLabel: string;
  durationSeconds: number;
};

const film = (
  key: string,
  category: string,
  title: string,
  durationLabel: string,
  durationSeconds: number,
  { version = "v1", horizontalPosterVersion }: { version?: string; horizontalPosterVersion?: string } = {},
): SiteFilm => ({
  key,
  category,
  title,
  horizontal: `${SITE_FILMS_BASE}/${key}-horizontal-${version}.mp4`,
  vertical: `${SITE_FILMS_BASE}/${key}-vertical-${version}.mp4`,
  posterHorizontal: `${SITE_FILMS_BASE}/${key}-horizontal-${horizontalPosterVersion ?? version}.jpg`,
  posterVertical: `${SITE_FILMS_BASE}/${key}-vertical-${version}.jpg`,
  durationLabel,
  durationSeconds,
});

export const SITE_FILMS: SiteFilm[] = [
  film("celebrations", "Celebrations", "Celebrations", "0:42", 42),
  film("workroom", "The Workroom", "The Workroom", "0:27", 27, { version: "v4" }),
  film("application-kit", "Career", "Application Kit", "0:39", 39, { horizontalPosterVersion: "v2" }),
];

export function filmForCategory(category: string): SiteFilm | undefined {
  return SITE_FILMS.find((f) => f.category === category);
}

/** Upright when the screen is taller than wide or narrower than 768px. */
export function pickFilmCut(): "horizontal" | "vertical" {
  if (typeof window === "undefined") return "horizontal";
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  return portrait || window.innerWidth < 768 ? "vertical" : "horizontal";
}

const seenKey = (film: SiteFilm) => `kc_film_seen_${film.key}_v1`;

/**
 * Per-device "seen or skipped" flag. Returns `null` when storage is unusable
 * (private mode, blocked), in which case the doorway never intercepts.
 */
export function hasSeenFilm(film: SiteFilm): boolean | null {
  try {
    return window.localStorage.getItem(seenKey(film)) === "1";
  } catch {
    return null;
  }
}

export function markFilmSeen(film: SiteFilm): void {
  try {
    window.localStorage.setItem(seenKey(film), "1");
  } catch {
    /* ignore */
  }
}
