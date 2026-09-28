import type { DisplayClass } from "@/hooks/use-display-class";

/**
 * One place that decides how big everything laid over the slideshow is, so a
 * phone, a laptop and a TV all stay in proportion instead of each element
 * carrying its own hardcoded size.
 */
export type WallChrome = {
  /** Padding for the overlay layer. */
  pad: string;
  cardPad: string;
  kicker: string;
  title: string;
  counter: string;
  qr: string;
  qrPad: string;
  emptyTitle: string;
  emptyBody: string;
  emptyQr: string;
  /** Base hold per photo before beat snapping. */
  rotateMs: number;
  /** Hide the QR panel entirely: a phone is not the screen guests scan. */
  compactQr: boolean;
};

export const WALL_CHROME: Record<DisplayClass, WallChrome> = {
  phone: {
    pad: "p-3",
    cardPad: "px-3 py-1.5",
    kicker: "text-[9px]",
    title: "text-base",
    counter: "px-2.5 py-1 text-[11px]",
    qr: "h-16 w-16",
    qrPad: "p-1.5",
    emptyTitle: "text-3xl",
    emptyBody: "text-sm",
    emptyQr: "h-56 w-56",
    rotateMs: 5_000,
    compactQr: true,
  },
  tablet: {
    pad: "p-4",
    cardPad: "px-4 py-2",
    kicker: "text-[10px]",
    title: "text-lg",
    counter: "px-3 py-1.5 text-xs",
    qr: "h-20 w-20",
    qrPad: "p-2",
    emptyTitle: "text-4xl",
    emptyBody: "text-base",
    emptyQr: "h-64 w-64",
    rotateMs: 6_000,
    compactQr: false,
  },
  laptop: {
    pad: "p-5",
    cardPad: "px-4 py-2",
    kicker: "text-[10px]",
    title: "text-lg",
    counter: "px-3 py-1.5 text-xs",
    qr: "h-24 w-24",
    qrPad: "p-2",
    emptyTitle: "text-5xl",
    emptyBody: "text-base",
    emptyQr: "h-72 w-72",
    rotateMs: 6_000,
    compactQr: false,
  },
  tv: {
    pad: "p-8",
    cardPad: "px-6 py-4",
    kicker: "text-xs",
    title: "text-3xl",
    counter: "px-5 py-2 text-lg",
    qr: "h-44 w-44",
    qrPad: "p-3",
    emptyTitle: "text-7xl",
    emptyBody: "text-2xl",
    emptyQr: "h-96 w-96",
    rotateMs: 9_000,
    compactQr: false,
  },
};

/** Host-facing pace steps, multiplied against the display's base hold. */
export const PACE_STEPS = [0.5, 0.75, 1, 1.5, 2, 3] as const;
export const PACE_LABELS: Record<string, string> = {
  "0.5": "Fastest",
  "0.75": "Faster",
  "1": "Normal",
  "1.5": "Slower",
  "2": "Slow",
  "3": "Slowest",
};
const PACE_KEY = "kenroe:wall-pace";

export function readPace(): number {
  if (typeof window === "undefined") return 1;
  try {
    const n = Number(window.localStorage.getItem(PACE_KEY));
    return PACE_STEPS.includes(n as (typeof PACE_STEPS)[number]) ? n : 1;
  } catch {
    return 1;
  }
}

export function writePace(pace: number) {
  try {
    window.localStorage.setItem(PACE_KEY, String(pace));
  } catch {
    /* storage blocked */
  }
}
