/**
 * Decorative invite frames.
 *
 * A frame is pure CSS drawn as absolutely-positioned layers behind the invite
 * hero content, so it stays crisp at every width (phone through TV browser)
 * with no image assets and no export/print surprises. Each frame gets the
 * event's accent color so it reads as part of the invitation, not a sticker
 * pasted on top.
 *
 * Frames are curated, not AI-generated: hand-authored CSS keeps the
 * "proportional, professional, luxurious" standard predictable.
 */

export type FrameId =
  | "none"
  | "engraved"
  | "woodcut"
  | "racing"
  | "scallop"
  | "menu"
  | "neon"
  | "ember"
  | "gingham"
  | "lights"
  | "confetti"
  | "laurel"
  | "column"
  | "garland"
  | "deco"
  | "botanical"
  | "moonlight";

export type FrameLayer = {
  /** Tailwind classes for the layer box. */
  className: string;
  /** Inline style, given the event accent color. */
  style: (accent: string) => Record<string, string>;
};

export type EventFrame = {
  id: FrameId;
  label: string;
  blurb: string;
  layers: FrameLayer[];
};

/** Inset ring used by several frames: sits inside the hero, never on the edge. */
const inset = "pointer-events-none absolute inset-3 sm:inset-5 2xl:inset-8";
const edge = "pointer-events-none absolute inset-x-0";

export const EVENT_FRAMES: EventFrame[] = [
  {
    id: "none",
    label: "No frame",
    blurb: "Clean, unadorned hero.",
    layers: [],
  },
  {
    id: "engraved",
    label: "Engraved",
    blurb: "Double hairline border, formal and quiet.",
    layers: [
      {
        className: `${inset} rounded-[2px]`,
        style: (accent) => ({
          border: `1px solid ${accent}66`,
          boxShadow: `inset 0 0 0 5px transparent, inset 0 0 0 6px ${accent}33`,
        }),
      },
    ],
  },
  {
    id: "woodcut",
    label: "Woodcut",
    blurb: "Hatched bands top and bottom, rustic and warm.",
    layers: [
      {
        className: `${edge} top-0 h-4 sm:h-6`,
        style: (accent) => ({
          backgroundImage: `repeating-linear-gradient(135deg, ${accent}80 0 2px, transparent 2px 7px)`,
        }),
      },
      {
        className: `${edge} bottom-0 h-4 sm:h-6`,
        style: (accent) => ({
          backgroundImage: `repeating-linear-gradient(135deg, ${accent}80 0 2px, transparent 2px 7px)`,
        }),
      },
    ],
  },
  {
    id: "racing",
    label: "Racing",
    blurb: "Twin stripes, sporty and confident.",
    layers: [
      {
        className: `${edge} top-0 h-2 sm:h-2.5`,
        style: (accent) => ({ backgroundColor: accent }),
      },
      {
        className: `${edge} top-3 h-1 sm:top-4`,
        style: (accent) => ({ backgroundColor: `${accent}59` }),
      },
      {
        className: `${edge} bottom-0 h-2 sm:h-2.5`,
        style: (accent) => ({ backgroundColor: accent }),
      },
      {
        className: `${edge} bottom-3 h-1 sm:bottom-4`,
        style: (accent) => ({ backgroundColor: `${accent}59` }),
      },
    ],
  },
  {
    id: "scallop",
    label: "Scalloped",
    blurb: "Soft rounded edging, garden-party sweet.",
    layers: [
      {
        className: `${edge} top-0 h-3 sm:h-4`,
        style: (accent) => ({
          backgroundImage: `radial-gradient(circle at 50% 100%, ${accent}4d 55%, transparent 56%)`,
          backgroundSize: "22px 100%",
          backgroundRepeat: "repeat-x",
        }),
      },
      {
        className: `${edge} bottom-0 h-3 sm:h-4`,
        style: (accent) => ({
          backgroundImage: `radial-gradient(circle at 50% 0%, ${accent}4d 55%, transparent 56%)`,
          backgroundSize: "22px 100%",
          backgroundRepeat: "repeat-x",
        }),
      },
    ],
  },
  {
    id: "menu",
    label: "Menu card",
    blurb: "Single rule box, restaurant-menu restraint.",
    layers: [
      {
        className: inset,
        style: (accent) => ({ border: `1px solid ${accent}59` }),
      },
      {
        className:
          "pointer-events-none absolute left-1/2 top-3 h-1.5 w-1.5 -translate-x-1/2 rotate-45 sm:top-5 2xl:top-8",
        style: (accent) => ({ backgroundColor: accent }),
      },
      {
        className:
          "pointer-events-none absolute bottom-3 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rotate-45 sm:bottom-5 2xl:bottom-8",
        style: (accent) => ({ backgroundColor: accent }),
      },
    ],
  },
  {
    id: "neon",
    label: "Neon",
    blurb: "Glowing outline, after-dark energy.",
    layers: [
      {
        className: `${inset} rounded-2xl`,
        style: (accent) => ({
          border: `1.5px solid ${accent}`,
          boxShadow: `0 0 18px ${accent}59, inset 0 0 24px ${accent}33`,
        }),
      },
    ],
  },
];

/**
 * Second wave of frames, added for the themed starter set. Same rules as the
 * originals: pure CSS, accent-driven, band heights step up from phone to TV so
 * the ornament stays proportional instead of swelling on large screens.
 */
EVENT_FRAMES.push(
  {
    id: "ember",
    label: "Ember",
    blurb: "Warm glow rising from the base, firepit at dusk.",
    layers: [
      {
        className: `${edge} bottom-0 h-10 sm:h-14 2xl:h-20`,
        style: (accent) => ({
          backgroundImage: `linear-gradient(to top, ${accent}59, transparent)`,
        }),
      },
      {
        className: `${edge} bottom-0 h-3 sm:h-4 2xl:h-5`,
        style: (accent) => ({
          backgroundImage: `radial-gradient(circle at 50% 120%, ${accent}cc 40%, transparent 41%)`,
          backgroundSize: "26px 100%",
          backgroundRepeat: "repeat-x",
        }),
      },
    ],
  },
  {
    id: "gingham",
    label: "Gingham",
    blurb: "Checked picnic bands, backyard and friendly.",
    layers: [
      {
        className: `${edge} top-0 h-4 sm:h-5 2xl:h-7`,
        style: (accent) => ({
          backgroundImage: `repeating-linear-gradient(0deg, ${accent}40 0 6px, transparent 6px 12px), repeating-linear-gradient(90deg, ${accent}40 0 6px, transparent 6px 12px)`,
        }),
      },
      {
        className: `${edge} bottom-0 h-4 sm:h-5 2xl:h-7`,
        style: (accent) => ({
          backgroundImage: `repeating-linear-gradient(0deg, ${accent}40 0 6px, transparent 6px 12px), repeating-linear-gradient(90deg, ${accent}40 0 6px, transparent 6px 12px)`,
        }),
      },
    ],
  },
  {
    id: "lights",
    label: "String lights",
    blurb: "Hanging bulbs on a swagged wire, evening party.",
    layers: [
      {
        className: `${edge} top-0 h-1 sm:h-1.5`,
        style: (accent) => ({ backgroundColor: `${accent}80` }),
      },
      {
        className: `${edge} top-1 h-3 sm:top-1.5 sm:h-4 2xl:h-5`,
        style: (accent) => ({
          backgroundImage: `radial-gradient(circle at 50% 0%, ${accent}e6 42%, transparent 43%)`,
          backgroundSize: "24px 100%",
          backgroundRepeat: "repeat-x",
        }),
      },
    ],
  },
  {
    id: "confetti",
    label: "Confetti",
    blurb: "Scattered flecks in the corners, playful and light.",
    layers: [
      {
        className: `${edge} top-0 h-8 sm:h-10 2xl:h-14`,
        style: (accent) => ({
          backgroundImage: `radial-gradient(${accent}b3 1.6px, transparent 1.7px), radial-gradient(${accent}66 1.2px, transparent 1.3px)`,
          backgroundSize: "28px 22px, 19px 31px",
          backgroundPosition: "0 0, 9px 7px",
        }),
      },
      {
        className: `${edge} bottom-0 h-8 sm:h-10 2xl:h-14`,
        style: (accent) => ({
          backgroundImage: `radial-gradient(${accent}99 1.6px, transparent 1.7px), radial-gradient(${accent}59 1.2px, transparent 1.3px)`,
          backgroundSize: "31px 24px, 21px 29px",
          backgroundPosition: "6px 3px, 0 11px",
        }),
      },
    ],
  },
  {
    id: "laurel",
    label: "Laurel",
    blurb: "Ceremonial side rules with a crest tick, graduation formal.",
    layers: [
      {
        className: "pointer-events-none absolute inset-y-4 left-3 w-px sm:inset-y-6 sm:left-5 2xl:left-8",
        style: (accent) => ({ backgroundColor: `${accent}80` }),
      },
      {
        className: "pointer-events-none absolute inset-y-4 right-3 w-px sm:inset-y-6 sm:right-5 2xl:right-8",
        style: (accent) => ({ backgroundColor: `${accent}80` }),
      },
      {
        className:
          "pointer-events-none absolute left-1/2 top-2 h-4 w-8 -translate-x-1/2 sm:top-3 sm:h-5 sm:w-10",
        style: (accent) => ({
          borderBottom: `1.5px solid ${accent}`,
          borderRadius: "0 0 50% 50%",
        }),
      },
    ],
  },
  {
    id: "column",
    label: "Column",
    blurb: "Squared corner brackets, boardroom clean.",
    layers: [
      {
        className: "pointer-events-none absolute left-3 top-3 h-6 w-6 sm:left-5 sm:top-5 sm:h-8 sm:w-8 2xl:left-8 2xl:top-8",
        style: (accent) => ({ borderTop: `1.5px solid ${accent}`, borderLeft: `1.5px solid ${accent}` }),
      },
      {
        className: "pointer-events-none absolute right-3 top-3 h-6 w-6 sm:right-5 sm:top-5 sm:h-8 sm:w-8 2xl:right-8 2xl:top-8",
        style: (accent) => ({ borderTop: `1.5px solid ${accent}`, borderRight: `1.5px solid ${accent}` }),
      },
      {
        className: "pointer-events-none absolute bottom-3 left-3 h-6 w-6 sm:bottom-5 sm:left-5 sm:h-8 sm:w-8 2xl:bottom-8 2xl:left-8",
        style: (accent) => ({ borderBottom: `1.5px solid ${accent}`, borderLeft: `1.5px solid ${accent}` }),
      },
      {
        className: "pointer-events-none absolute bottom-3 right-3 h-6 w-6 sm:bottom-5 sm:right-5 sm:h-8 sm:w-8 2xl:bottom-8 2xl:right-8",
        style: (accent) => ({ borderBottom: `1.5px solid ${accent}`, borderRight: `1.5px solid ${accent}` }),
      },
    ],
  },
);

/**
 * Third wave: styles the wider theme library needs. Same rules — pure CSS,
 * accent-driven, band heights step up phone → desktop → TV.
 */
EVENT_FRAMES.push(
  {
    id: "garland",
    label: "Garland",
    blurb: "Looped seasonal swag across the top, festive and warm.",
    layers: [
      {
        className: `${edge} top-0 h-5 sm:h-7 2xl:h-9`,
        style: (accent) => ({
          backgroundImage: `radial-gradient(circle at 50% 0%, ${accent}59 46%, transparent 47%)`,
          backgroundSize: "40px 100%",
          backgroundRepeat: "repeat-x",
        }),
      },
      {
        className: `${edge} top-0 h-2 sm:h-3`,
        style: (accent) => ({
          backgroundImage: `radial-gradient(circle at 50% 0%, ${accent}cc 30%, transparent 31%)`,
          backgroundSize: "13px 100%",
          backgroundRepeat: "repeat-x",
        }),
      },
      {
        className: `${edge} bottom-0 h-px`,
        style: (accent) => ({ backgroundColor: `${accent}66` }),
      },
    ],
  },
  {
    id: "deco",
    label: "Deco",
    blurb: "Chevron rules and gilt hairlines, black-tie geometry.",
    layers: [
      {
        className: `${edge} top-0 h-3 sm:h-4 2xl:h-5`,
        style: (accent) => ({
          backgroundImage: `repeating-linear-gradient(135deg, ${accent}99 0 3px, transparent 3px 9px)`,
        }),
      },
      {
        className: `${edge} bottom-0 h-3 sm:h-4 2xl:h-5`,
        style: (accent) => ({
          backgroundImage: `repeating-linear-gradient(45deg, ${accent}99 0 3px, transparent 3px 9px)`,
        }),
      },
      {
        className: `${inset} rounded-[2px]`,
        style: (accent) => ({ border: `1px solid ${accent}4d` }),
      },
    ],
  },
  {
    id: "botanical",
    label: "Botanical",
    blurb: "Soft leafy corners, garden light and unhurried.",
    layers: [
      {
        className:
          "pointer-events-none absolute left-2 top-2 h-14 w-14 rounded-br-[100%] sm:left-4 sm:top-4 sm:h-20 sm:w-20 2xl:h-28 2xl:w-28",
        style: (accent) => ({
          backgroundImage: `radial-gradient(circle at 0% 0%, ${accent}33, transparent 70%)`,
          borderTop: `1px solid ${accent}59`,
          borderLeft: `1px solid ${accent}59`,
        }),
      },
      {
        className:
          "pointer-events-none absolute bottom-2 right-2 h-14 w-14 rounded-tl-[100%] sm:bottom-4 sm:right-4 sm:h-20 sm:w-20 2xl:h-28 2xl:w-28",
        style: (accent) => ({
          backgroundImage: `radial-gradient(circle at 100% 100%, ${accent}33, transparent 70%)`,
          borderBottom: `1px solid ${accent}59`,
          borderRight: `1px solid ${accent}59`,
        }),
      },
    ],
  },
  {
    id: "moonlight",
    label: "Moonlight",
    blurb: "Starlit wash at the top edge, midnight and quiet.",
    layers: [
      {
        className: `${edge} top-0 h-16 sm:h-20 2xl:h-28`,
        style: (accent) => ({
          backgroundImage: `linear-gradient(to bottom, ${accent}40, transparent), radial-gradient(${accent}b3 1.1px, transparent 1.2px)`,
          backgroundSize: "auto, 34px 26px",
        }),
      },
    ],
  },
);


/**
 * Master kill switch for the decorative CSS frames.
 *
 * Re-enabled with per-frame color control: the frame no longer inherits the
 * card accent by force, so a host can tune it (swatch or typed hex) instead of
 * being stuck with one fixed color. Stored `event.frame` values were never
 * cleared while this was off, so old selections come back intact.
 */
export const FRAMES_ENABLED = true;

/** Fallback frame color when the host has not chosen one. */
export const DEFAULT_FRAME_COLOR = "#5b1a3a";

/**
 * Curated swatches for the frame color picker. Metallics and deep neutrals
 * first, because those are the ones that read as trim rather than as poster
 * paint at invite scale.
 */
export const FRAME_COLORS: { name: string; value: string }[] = [
  { name: "Gold", value: "#b08d3f" },
  { name: "Champagne", value: "#d9c7a3" },
  { name: "Silver", value: "#9aa3ab" },
  { name: "Ink", value: "#1f2328" },
  { name: "Charcoal", value: "#4a4f57" },
  { name: "Bordeaux", value: "#5b1a3a" },
  { name: "Forest", value: "#2f4b3a" },
  { name: "Navy", value: "#1e2f4d" },
  { name: "Terracotta", value: "#a8563a" },
  { name: "Blush", value: "#d8a7ac" },
];

export function getFrame(id: string | undefined | null): EventFrame {
  return EVENT_FRAMES.find((f) => f.id === id) ?? EVENT_FRAMES[0]!;
}


