/**
 * Invitation entrance animations: the single source of truth for the list, the
 * plan gate, the phase budget and occasion suitability.
 *
 * Rules that hold for every entrance in this file:
 *  - A reveal is composed and still within COMPOSED_MAX_MS. It is allowed to
 *    take its time, but a guest is never left staring at a covered screen.
 *  - Time is spent in phases, not uniformly: a held beat, an imperceptible
 *    ease in, a long settle, then stillness. See `entrancePhases`.
 *  - Two entrances are included on every plan ("none", "envelope"); the rest
 *    need the Host plan or higher. The gate is applied on the server in
 *    `invite-entrances.server.ts` as well as in the picker.
 *  - A solemn occasion never gets a celebratory shower unless the host
 *    confirms it once.
 */


export type InviteAnimation =
  | "none"
  | "envelope"
  | "dawn"
  | "lightning"
  | "airplane"
  | "confetti"
  | "curtain"
  | "fireworks"
  | "balloons"
  | "bouquet"
  | "sparkle";

/** How an entrance reads emotionally. Drives occasion recommendations. */
export type EntranceTone = "quiet" | "elegant" | "dramatic" | "celebratory";

export interface EntranceMeta {
  id: InviteAnimation;
  name: string;
  description: string;
  tone: EntranceTone;
  premium?: boolean;
  /** Marked as the house style in the picker. */
  flagship?: boolean;
}

export const INVITE_ANIMATIONS: EntranceMeta[] = [
  {
    id: "none",
    name: "No animation",
    description: "Open straight to the invitation.",
    tone: "quiet",
  },
  {
    id: "envelope",
    name: "Envelope unfolds",
    description:
      "A wax-sealed envelope catches the light, the flap falls open and the card lifts out. Included on every plan.",
    tone: "elegant",
  },
  {
    id: "dawn",
    name: "Dark to light",
    description:
      "The invitation emerges from darkness into warm morning light, color rising as it settles.",
    tone: "elegant",
    premium: true,
    flagship: true,
  },
  {
    id: "lightning",
    name: "Lightning",
    description:
      "The card waits in near darkness, one bright flash throws a shadow across it, then the light settles.",
    tone: "dramatic",
    premium: true,
  },
  {
    id: "curtain",
    name: "Velvet curtain",
    description: "Heavy drapes sway, then part to reveal the celebration.",
    tone: "dramatic",
    premium: true,
  },
  {
    id: "airplane",
    name: "Paper airplane",
    description: "A paper plane banks through a curved flight path and opens as it lands.",
    tone: "celebratory",
    premium: true,
  },
  {
    id: "sparkle",
    name: "Sparkle reveal",
    description: "Points of light bloom in layers and dissolve into the invitation.",
    tone: "elegant",
    premium: true,
  },
  {
    id: "confetti",
    name: "Confetti shower",
    description: "Paper confetti tumbles and flutters down at its own weight before the card lands.",
    tone: "celebratory",
    premium: true,
  },
  {
    id: "fireworks",
    name: "Fireworks finale",
    description: "Shells burst in sequence and trail sparks that fall and fade.",
    tone: "celebratory",
    premium: true,
  },
  {
    id: "balloons",
    name: "Balloon release",
    description: "Balloons rise at varied speeds, drifting and swinging on their strings.",
    tone: "celebratory",
    premium: true,
  },
  {
    id: "bouquet",
    name: "Bouquet of flowers",
    description:
      "Stems rise, blooms unfurl one after another and open into full flower, with petals that carry weight and settle rather than pop.",
    tone: "elegant",
    premium: true,
  },
];

export const FREE_ANIMATIONS: InviteAnimation[] = ["none", "envelope"];

export function entranceMeta(id: string | null | undefined): EntranceMeta {
  return INVITE_ANIMATIONS.find((a) => a.id === id) ?? INVITE_ANIMATIONS[1]!;
}

export function isPremiumEntrance(id: string | null | undefined): boolean {
  return !FREE_ANIMATIONS.includes((id ?? "envelope") as InviteAnimation);
}

/* ------------------------------------------------------------------ timing */

/**
 * A reveal is not a UI transition, and the old 1.5s cap was borrowed from the
 * wrong discipline. What makes an entrance feel expensive is not the length,
 * it is how the length is spent, so every entrance is described in four
 * phases rather than one duration:
 *
 *   hold    complete stillness on a composed first frame. Nothing moves.
 *   travel  the movement itself, easing in almost imperceptibly.
 *   settle  the long, soft arrival: layers land one after another, staggered.
 *   rest    stillness again, so the composition is allowed to land, with the
 *           veil crossfading away in the last FADE_MS of it.
 *
 * "Composed and still" is hold + travel + settle. `total` adds the rest.
 */
export interface EntrancePhases {
  hold: number;
  travel: number;
  settle: number;
  rest: number;
  /** hold + travel + settle: the invitation is composed and motionless. */
  composed: number;
  /** Overlay lifetime, including the closing stillness and crossfade. */
  total: number;
}

/** The closing crossfade, inside the rest phase. */
export const FADE_MS = 420;

/**
 * Base (Balanced) phases per entrance.
 *
 * These numbers were rebuilt, not scaled. The old shape spent about a tenth of
 * itself standing still and hurried the arrival; composure comes from the
 * opposite balance, so every entrance now holds a full second before anything
 * moves, and the settle takes roughly half of the composed time on its own.
 * The travel is the part that shrank. Movement is cheap; stillness and a long
 * arrival are what read as expensive.
 */
const BASE_PHASES: Record<InviteAnimation, { hold: number; travel: number; settle: number; rest: number }> = {
  none: { hold: 0, travel: 0, settle: 0, rest: 0 },
  envelope: { hold: 1000, travel: 1300, settle: 2300, rest: 700 },
  dawn: { hold: 1100, travel: 1350, settle: 2450, rest: 700 },
  bouquet: { hold: 1050, travel: 1350, settle: 2400, rest: 700 },
  lightning: { hold: 950, travel: 1250, settle: 2200, rest: 660 },
  curtain: { hold: 950, travel: 1300, settle: 2250, rest: 660 },
  airplane: { hold: 900, travel: 1300, settle: 2200, rest: 620 },
  sparkle: { hold: 900, travel: 1150, settle: 2050, rest: 600 },
  confetti: { hold: 900, travel: 1200, settle: 2100, rest: 600 },
  fireworks: { hold: 900, travel: 1300, settle: 2200, rest: 620 },
  balloons: { hold: 900, travel: 1250, settle: 2150, rest: 600 },
};

/** How much of the settle a host wants. A memorial wants restraint. */
export type EntrancePace = "subtle" | "balanced" | "cinematic";

export const ENTRANCE_PACES: { id: EntrancePace; name: string; hint: string }[] = [
  { id: "subtle", name: "Subtle", hint: "Quick and understated. Good for solemn occasions." },
  { id: "balanced", name: "Balanced", hint: "The house setting. Deliberate without lingering." },
  { id: "cinematic", name: "Cinematic", hint: "The full reveal, held a beat longer." },
];

const PACE_SCALE: Record<EntrancePace, number> = {
  subtle: 0.74,
  balanced: 1,
  cinematic: 1.2,
};

/**
 * The builder's Preview runs shorter. A host comparing entrances should not
 * wait three seconds per comparison; the guest still gets the full reveal.
 */
export const PREVIEW_SCALE = 0.55;

export function normalizePace(raw: string | null | undefined): EntrancePace {
  const p = String(raw ?? "").toLowerCase();
  return p === "subtle" || p === "cinematic" ? p : "balanced";
}

/**
 * Phase budget for one entrance. The hold scales far less than the movement:
 * the held beat is what reads as deliberate, so even Subtle keeps most of it.
 */
export function entrancePhases(
  id: string | null | undefined,
  pace: EntrancePace | string | null | undefined = "balanced",
  extraScale = 1,
): EntrancePhases {
  const key = (id ?? "envelope") as InviteAnimation;
  const base = BASE_PHASES[key] ?? BASE_PHASES.envelope;
  if (!base.travel && !base.hold) {
    return { hold: 0, travel: 0, settle: 0, rest: 0, composed: 0, total: 0 };
  }
  const s = PACE_SCALE[normalizePace(pace as string)] * extraScale;
  const holdScale = Math.min(1, 0.45 + 0.55 * s);
  const hold = Math.round(base.hold * holdScale);
  const travel = Math.round(base.travel * s);
  const settle = Math.round(base.settle * s);
  const rest = Math.max(FADE_MS, Math.round(base.rest * s));
  const composed = hold + travel + settle;
  return { hold, travel, settle, rest, composed, total: composed + rest };
}

/**
 * Legacy single-number view, kept because callers and copy still ask "how long
 * is this one". It is the overlay lifetime at the Balanced pace.
 */
export const ENTRANCE_MS: Record<InviteAnimation, number> = Object.fromEntries(
  INVITE_ANIMATIONS.map((a) => [a.id, entrancePhases(a.id, "balanced").total]),
) as Record<InviteAnimation, number>;

/**
 * Longest an entrance may run before the invitation is composed and still.
 *
 * This can be generous now in a way it could not be before: the invitation is
 * readable underneath from the first moment, and the reveal has a Skip button,
 * so a longer entrance no longer keeps anyone waiting to read anything.
 */
export const COMPOSED_MAX_MS = 5800;

export function entranceDurationMs(
  id: string | null | undefined,
  pace: EntrancePace | string | null | undefined = "balanced",
): number {
  return entrancePhases(id, pace).total;
}


/* -------------------------------------------------------------- plan gate */

export type EntranceTier = "postcard" | "whisper" | "host" | "atelier";
const TIER_RANK: Record<EntranceTier, number> = {
  postcard: 0,
  whisper: 1,
  host: 2,
  atelier: 3,
};

/** Normalises a stored tier / price id string to a tier name. */
export function normalizeEntranceTier(raw: string | null | undefined): EntranceTier {
  const t = String(raw ?? "").toLowerCase();
  if (!t) return "postcard";
  if (t.includes("atelier") || t.startsWith("studio_collective")) return "atelier";
  if (t.includes("host")) return "host";
  if (t.includes("whisper")) return "whisper";
  return "postcard";
}

/**
 * The entrance a guest actually gets. Premium entrances fall back to the
 * included envelope below the Host plan, so a host who downgrades keeps a
 * working invitation instead of losing the reveal entirely.
 */
export function gateEntrance(
  requested: string | null | undefined,
  tier: EntranceTier,
): InviteAnimation {
  const id = (requested ?? "envelope") as InviteAnimation;
  const known = INVITE_ANIMATIONS.some((a) => a.id === id) ? id : "envelope";
  if (!isPremiumEntrance(known)) return known;
  return TIER_RANK[tier] >= TIER_RANK.host ? known : "envelope";
}

/* --------------------------------------------------------- occasion match */

const SOLEMN_WORDS = [
  "memorial",
  "funeral",
  "wake",
  "celebration of life",
  "in memory",
  "remembrance",
  "shiva",
  "repast",
  "vigil",
  "condolence",
  "homegoing",
  "burial",
  "interment",
];

export function occasionIsSolemn(...texts: (string | null | undefined)[]): boolean {
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  if (!hay) return false;
  return SOLEMN_WORDS.some((w) => hay.includes(w));
}

/** Entrances we put forward first for this occasion. */
export function recommendedEntrances(...texts: (string | null | undefined)[]): InviteAnimation[] {
  // A bouquet belongs on a memorial as naturally as on a wedding, which is why
  // it sits in both lists and nowhere near the celebratory showers.
  if (occasionIsSolemn(...texts)) return ["dawn", "bouquet", "envelope", "none"];
  const hay = texts.filter(Boolean).join(" ").toLowerCase();
  if (/wedding|engage|vow|anniversar|bridal/.test(hay))
    return ["bouquet", "dawn", "envelope", "sparkle"];
  if (/gala|award|premiere|theatre|theater|launch/.test(hay)) return ["curtain", "lightning", "dawn"];
  if (/birthday|graduat|reunion|baby shower|retire|holiday|new year/.test(hay))
    return ["confetti", "balloons", "fireworks"];
  return ["dawn", "envelope", "sparkle"];
}

/**
 * True when the entrance would jar against the occasion, so the picker can ask
 * once rather than silently allowing a confetti shower on a memorial.
 */
export function isJarringForOccasion(
  id: string | null | undefined,
  ...texts: (string | null | undefined)[]
): boolean {
  if (!occasionIsSolemn(...texts)) return false;
  const meta = entranceMeta(id);
  return meta.tone === "celebratory" || meta.tone === "dramatic";
}

/* ---------------------------------------------------------- once-per-guest */

/** Key under which "this guest has already seen the reveal" is remembered. */
export function entranceSeenKey(eventId: string): string {
  return `kcc.invite.entrance.seen.${eventId}`;
}

/* ------------------------------------------------------------------- sound */

/**
 * Per-device memory for "yes, play a soft sound with the reveal". Off by
 * default: browsers block autoplay audio, and a guest opening an invitation in
 * a meeting would not thank us for it.
 */
export const ENTRANCE_SOUND_KEY = "kcc.invite.entrance.sound";
