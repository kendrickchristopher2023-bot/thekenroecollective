/**
 * Curated painted artwork for the event themes.
 *
 * The first pass of themes leaned on pure-CSS geometry (scallops, gingham,
 * dot rows). It read as clip-art. Every theme now points at a real painted
 * backdrop instead: watercolor and fine ink linework on ivory cotton paper,
 * composed with an open middle so the invite type always sits on clean paper.
 *
 * Art is grouped into families rather than one file per theme: a family is an
 * art direction (ember glow, fine botanical, gilt deco...), and several
 * occasions legitimately share one. That keeps the library small enough to load
 * fast and consistent enough to feel like one stationery house.
 *
 * Files live in /public/theme-art so they can be referenced by URL from the
 * invite, the picker and generated exports alike.
 */

export type ThemeArtFamily =
  | "ember"
  | "botanical"
  | "blush-scallop"
  | "picnic-harvest"
  | "bordeaux-cellar"
  | "gilt-deco"
  | "evergreen-garland"
  | "moonlit"
  | "garden-bloom"
  | "laurel-crest"
  | "confetti"
  | "boardroom";

export const THEME_ART_FAMILIES: Record<ThemeArtFamily, { label: string; note: string }> = {
  ember: { label: "Ember", note: "Warm ember glow rising off the base." },
  botanical: { label: "Fine botanical", note: "Ranunculus and eucalyptus in muted olive." },
  "blush-scallop": { label: "Blush bloom", note: "Soft peonies in blush and ivory." },
  "picnic-harvest": { label: "Harvest table", note: "Wildflowers, wheat and stone fruit." },
  "bordeaux-cellar": { label: "Cellar", note: "Engraved vines and glassware in bordeaux." },
  "gilt-deco": { label: "Gilt deco", note: "Fine gold sunburst rays on ivory." },
  "evergreen-garland": { label: "Evergreen", note: "Fir, cedar and muted cranberry." },
  moonlit: { label: "Moonlit", note: "Indigo night wash with a gilt crescent." },
  "garden-bloom": { label: "Garden", note: "Spring roses, sweet peas and ferns." },
  "laurel-crest": { label: "Laurel crest", note: "Engraved laurel with a small crest." },
  confetti: { label: "Celebration", note: "Painterly celebration flecks." },
  boardroom: { label: "Boardroom", note: "Restrained ink linework, quietly formal." },
};

/** Theme id to art family. Every theme in event-themes.ts must be listed. */
const THEME_ART: Record<string, ThemeArtFamily> = {
  // v1 starter set
  bonfire: "ember",
  "baby-shower": "blush-scallop",
  "family-reunion": "picnic-harvest",
  wedding: "botanical",
  bbq: "picnic-harvest",
  dinner: "bordeaux-cellar",
  birthday: "confetti",
  party: "moonlit",
  corporate: "boardroom",
  fun: "moonlit",
  graduation: "laurel-crest",

  // Milestones
  anniversary: "botanical",
  engagement: "garden-bloom",
  "bridal-shower": "blush-scallop",
  retirement: "laurel-crest",
  quinceanera: "gilt-deco",
  "sweet-sixteen": "confetti",
  baptism: "blush-scallop",

  // Seasonal
  "holiday-party": "evergreen-garland",
  "new-years-eve": "gilt-deco",
  thanksgiving: "picnic-harvest",
  halloween: "moonlit",
  "garden-party": "garden-bloom",

  // Social
  "cocktail-hour": "bordeaux-cellar",
  "game-night": "confetti",
  "wine-tasting": "bordeaux-cellar",
  brunch: "garden-bloom",
  housewarming: "picnic-harvest",

  // Work
  conference: "boardroom",
  gala: "gilt-deco",
};

export function themeArtFamily(themeId: string | undefined | null): ThemeArtFamily | undefined {
  if (!themeId) return undefined;
  return THEME_ART[themeId];
}

export function artUrl(family: ThemeArtFamily): string {
  return `/theme-art/${family}.jpg`;
}

/** Painted backdrop URL for a theme, or undefined when the theme has no art. */
export function themeArtUrl(themeId: string | undefined | null): string | undefined {
  const family = themeArtFamily(themeId);
  return family ? artUrl(family) : undefined;
}
