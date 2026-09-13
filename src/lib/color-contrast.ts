/**
 * Readability safeguard for host-chosen invite colors.
 *
 * Hosts can type any hex for the card, frame, and text colors. Nothing stops
 * "light yellow on ivory", which ships an invite nobody can read. These helpers
 * compute the standard WCAG contrast ratio and, when it fails, walk the SAME
 * hue lighter/darker until it passes, so the host keeps their color family
 * instead of being told "no".
 *
 * Deliberately advisory: the UI warns, it never blocks a save.
 */

export const DEFAULT_INVITE_BG = "#faf7f2"; // the ivory `paper` wash

/** "#abc" / "abcdef" / "#aabbccdd" -> "#aabbcc". Undefined when unparseable. */
export function normalizeHexColor(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.split("").map((c) => c + c).join("")}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^[0-9a-fA-F]{8}$/.test(raw)) return `#${raw.slice(0, 6).toLowerCase()}`;
  return undefined;
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHexColor(hex) ?? "#000000";
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastLevel = "pass" | "large-only" | "fail";

export type ContrastVerdict = {
  ratio: number;
  /** Ratio rounded for display, e.g. "1.9". */
  label: string;
  level: ContrastLevel;
  message: string;
  /** A same-hue color that clears 4.5:1, present only when level !== "pass". */
  suggestion?: string;
};

/** Perceptually simple lighten/darken that preserves hue and saturation ratio. */
function shift(hex: string, amount: number): string {
  const [r, g, b] = toRgb(hex);
  if (amount < 0) {
    const k = 1 + amount; // amount in [-1, 0)
    return toHex(r * k, g * k, b * k);
  }
  return toHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

/**
 * Nearest same-hue shade of `color` that reaches `target` against `background`.
 * Walks toward whichever direction the background is not, so text on a dark
 * card goes lighter and text on ivory goes darker.
 */
export function readableShade(color: string, background: string, target = 4.5): string {
  const base = normalizeHexColor(color) ?? "#111111";
  const bg = normalizeHexColor(background) ?? DEFAULT_INVITE_BG;
  if (contrastRatio(base, bg) >= target) return base;
  const bgIsLight = relativeLuminance(bg) > 0.4;
  const dir = bgIsLight ? -1 : 1;
  for (let step = 1; step <= 20; step++) {
    const candidate = shift(base, dir * (step / 20));
    if (contrastRatio(candidate, bg) >= target) return candidate;
  }
  return bgIsLight ? "#111111" : "#ffffff";
}

/**
 * Advisory verdict for a text color against the effective invite background.
 * `background` should be the color actually behind the text (the paper wash,
 * or the card color when the host set one).
 */
export function evaluateTextContrast(
  color: string | undefined | null,
  background: string | undefined | null = DEFAULT_INVITE_BG,
): ContrastVerdict | null {
  const fg = normalizeHexColor(color);
  if (!fg) return null;
  const bg = normalizeHexColor(background) ?? DEFAULT_INVITE_BG;
  const ratio = contrastRatio(fg, bg);
  const label = ratio.toFixed(1);
  if (ratio >= 4.5) {
    return { ratio, label, level: "pass", message: `Readable (${label}:1 contrast).` };
  }
  const suggestion = readableShade(fg, bg);
  if (ratio >= 3) {
    return {
      ratio,
      label,
      level: "large-only",
      message: `Fine for the large title, but hard to read at small sizes (${label}:1).`,
      suggestion,
    };
  }
  return {
    ratio,
    label,
    level: "fail",
    message: `This will be very hard to read on your invitation (${label}:1 contrast).`,
    suggestion,
  };
}

/** Frames are decorative, so they only need to be visible, not text-legible. */
export function evaluateDecorativeContrast(
  color: string | undefined | null,
  background: string | undefined | null = DEFAULT_INVITE_BG,
): ContrastVerdict | null {
  const fg = normalizeHexColor(color);
  if (!fg) return null;
  const bg = normalizeHexColor(background) ?? DEFAULT_INVITE_BG;
  const ratio = contrastRatio(fg, bg);
  const label = ratio.toFixed(1);
  if (ratio >= 1.5) return { ratio, label, level: "pass", message: `Visible (${label}:1).` };
  return {
    ratio,
    label,
    level: "fail",
    message: `This frame will almost disappear against the background (${label}:1).`,
    suggestion: readableShade(fg, bg, 2.5),
  };
}

/** Same color at a lower opacity, for the secondary lines under a heading. */
export function withAlpha(hex: string | undefined | null, alpha: number): string | undefined {
  const h = normalizeHexColor(hex);
  if (!h) return undefined;
  const a = Math.max(0, Math.min(1, alpha));
  return `${h}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
}
