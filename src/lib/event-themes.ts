/**
 * Event themes: curated pairings of a decorative invite frame (see
 * src/lib/event-frames.ts) with an accent color, described by tags so the set
 * stays extensible. Adding a theme means adding one entry here, never a
 * one-off branch in a component. New frame *styles* go in event-frames.ts and
 * can be reused by any number of themes.
 *
 * v1 starter set covers the occasions hosts ask for most; the rest of the
 * long-list can follow with the same structure.
 */

import type { FrameId } from "./event-frames";

export type ThemeTag =
  | "celebration"
  | "family"
  | "formal"
  | "outdoor"
  | "food"
  | "milestone"
  | "work"
  | "evening"
  | "playful"
  | "seasonal"
  | "social";

export type EventTheme = {
  id: string;
  label: string;
  blurb: string;
  /** Frame style this theme renders on the invite. */
  frame: FrameId;
  /** Accent color applied to the event card and the frame. */
  accent: string;
  tags: ThemeTag[];
};

export const EVENT_THEMES: EventTheme[] = [
  {
    id: "bonfire",
    label: "Bonfire",
    blurb: "Ember glow off a dusk bonfire.",
    frame: "ember",
    accent: "#b4531f",
    tags: ["outdoor", "evening"],
  },
  {
    id: "baby-shower",
    label: "Baby shower",
    blurb: "Blush peonies, soft and new.",
    frame: "scallop",
    accent: "#8fb8c9",
    tags: ["family", "celebration"],
  },
  {
    id: "family-reunion",
    label: "Family reunion",
    blurb: "Wildflowers and wheat, long table.",
    frame: "gingham",
    accent: "#4f7a4a",
    tags: ["family", "outdoor"],
  },
  {
    id: "wedding",
    label: "Wedding",
    blurb: "Fine botanical linework in olive.",
    frame: "engraved",
    accent: "#6d5b3f",
    tags: ["formal", "milestone", "celebration"],
  },
  {
    id: "bbq",
    label: "BBQ",
    blurb: "Harvest blooms and stone fruit.",
    frame: "gingham",
    accent: "#a8431f",
    tags: ["outdoor", "food"],
  },
  {
    id: "dinner",
    label: "Dinner",
    blurb: "Engraved vines in bordeaux.",
    frame: "menu",
    accent: "#5b1a3a",
    tags: ["food", "formal", "evening"],
  },
  {
    id: "birthday",
    label: "Birthday party",
    blurb: "Painterly celebration flecks.",
    frame: "confetti",
    accent: "#c2185b",
    tags: ["celebration", "playful"],
  },
  {
    id: "party",
    label: "Party",
    blurb: "Indigo night wash and gilt stars.",
    frame: "lights",
    accent: "#7a4bb8",
    tags: ["celebration", "evening"],
  },
  {
    id: "corporate",
    label: "Corporate",
    blurb: "Restrained ink, quietly formal.",
    frame: "column",
    accent: "#2f4858",
    tags: ["work", "formal"],
  },
  {
    id: "fun",
    label: "Fun",
    blurb: "Moonlit indigo, after-dark energy.",
    frame: "neon",
    accent: "#1f9e8f",
    tags: ["playful", "evening"],
  },
  {
    id: "graduation",
    label: "Graduation",
    blurb: "Engraved laurel with a crest.",
    frame: "laurel",
    accent: "#1f3a5f",
    tags: ["milestone", "formal"],
  },
];

/**
 * Second wave: the rest of the occasion list, authored on the same structure.
 * Adding a theme is one entry here (plus a frame style in event-frames.ts only
 * when no existing style carries the look).
 */
EVENT_THEMES.push(
  // Milestones
  {
    id: "anniversary",
    label: "Anniversary",
    blurb: "Fine botanicals in aged gold.",
    frame: "engraved",
    accent: "#8a6b2f",
    tags: ["milestone", "formal", "celebration"],
  },
  {
    id: "engagement",
    label: "Engagement party",
    blurb: "Spring garden roses and ferns.",
    frame: "botanical",
    accent: "#b06a7a",
    tags: ["milestone", "celebration"],
  },
  {
    id: "bridal-shower",
    label: "Bridal shower",
    blurb: "Blush blooms on ivory paper.",
    frame: "scallop",
    accent: "#d08a97",
    tags: ["celebration", "family"],
  },
  {
    id: "retirement",
    label: "Retirement",
    blurb: "Engraved laurel, a considered send-off.",
    frame: "column",
    accent: "#3f5a4a",
    tags: ["milestone", "work"],
  },
  {
    id: "quinceanera",
    label: "Quinceanera",
    blurb: "Gilt deco rays on ivory.",
    frame: "deco",
    accent: "#b2245c",
    tags: ["milestone", "celebration", "formal"],
  },
  {
    id: "sweet-sixteen",
    label: "Sweet sixteen",
    blurb: "Celebration flecks, bright and easy.",
    frame: "confetti",
    accent: "#8b3fd1",
    tags: ["milestone", "playful", "celebration"],
  },
  {
    id: "baptism",
    label: "Baptism or christening",
    blurb: "Soft blush and ivory blooms.",
    frame: "scallop",
    accent: "#7f96b5",
    tags: ["family", "formal", "milestone"],
  },

  // Seasonal
  {
    id: "holiday-party",
    label: "Holiday party",
    blurb: "Fir, cedar and muted cranberry.",
    frame: "garland",
    accent: "#1f5b3a",
    tags: ["seasonal", "celebration", "evening"],
  },
  {
    id: "new-years-eve",
    label: "New Year's Eve",
    blurb: "Gilt deco sunbursts at midnight.",
    frame: "deco",
    accent: "#a3852f",
    tags: ["seasonal", "evening", "formal", "celebration"],
  },
  {
    id: "thanksgiving",
    label: "Thanksgiving",
    blurb: "Wheat, wildflowers, harvest table.",
    frame: "woodcut",
    accent: "#8a4a1f",
    tags: ["seasonal", "family", "food"],
  },
  {
    id: "halloween",
    label: "Halloween",
    blurb: "Moonlit indigo with a gilt crescent.",
    frame: "moonlight",
    accent: "#6a2fa0",
    tags: ["seasonal", "playful", "evening"],
  },
  {
    id: "garden-party",
    label: "Spring garden party",
    blurb: "Sweet peas and ferns, afternoon light.",
    frame: "botanical",
    accent: "#5f8a4a",
    tags: ["seasonal", "outdoor", "social"],
  },

  // Social
  {
    id: "cocktail-hour",
    label: "Cocktail hour",
    blurb: "Engraved glassware and figs.",
    frame: "deco",
    accent: "#20544a",
    tags: ["social", "evening", "formal"],
  },
  {
    id: "game-night",
    label: "Game night",
    blurb: "Celebration flecks, friendly rivalry.",
    frame: "confetti",
    accent: "#2f6fb8",
    tags: ["social", "playful"],
  },
  {
    id: "wine-tasting",
    label: "Wine tasting",
    blurb: "Grapevines in bordeaux and gold.",
    frame: "menu",
    accent: "#6b1f34",
    tags: ["social", "food", "evening"],
  },
  {
    id: "brunch",
    label: "Brunch",
    blurb: "Garden blooms in peach and sage.",
    frame: "gingham",
    accent: "#c9793f",
    tags: ["social", "food", "family"],
  },
  {
    id: "housewarming",
    label: "Housewarming",
    blurb: "Wildflowers, doors open.",
    frame: "woodcut",
    accent: "#4a6b7a",
    tags: ["social", "family"],
  },

  // Work
  {
    id: "conference",
    label: "Conference or summit",
    blurb: "Ink linework, badge-and-lanyard clean.",
    frame: "column",
    accent: "#23405c",
    tags: ["work", "formal"],
  },
  {
    id: "gala",
    label: "Fundraiser or gala",
    blurb: "Gilt deco rays, black-tie.",
    frame: "deco",
    accent: "#8f7326",
    tags: ["work", "formal", "evening", "celebration"],
  },
);

export function getTheme(id: string | undefined | null): EventTheme | undefined {
  if (!id) return undefined;
  return EVENT_THEMES.find((t) => t.id === id);
}

/** Themes matching any of the given tags; powers the filter chips in the picker. */
export function themesByTag(...tags: ThemeTag[]): EventTheme[] {
  if (tags.length === 0) return EVENT_THEMES;
  return EVENT_THEMES.filter((t) => t.tags.some((tag) => tags.includes(tag)));
}

/** Tags actually used by the library, in a stable display order. */
export const THEME_TAGS: ThemeTag[] = [
  "celebration",
  "milestone",
  "family",
  "formal",
  "social",
  "seasonal",
  "outdoor",
  "food",
  "evening",
  "playful",
  "work",
];

