/**
 * The invitation entrance reveal.
 *
 * Standards this component holds to:
 *  - It plays ONCE per guest per event (remembered in localStorage). A guest who
 *    opens their invitation five times sits through the reveal once.
 *  - Time is spent in phases, never spread evenly. Every entrance opens on a
 *    composed, motionless first frame held for `hold`, eases in almost
 *    imperceptibly, spends the back half of the motion on the settle with its
 *    layers staggered, then stands completely still before the veil clears.
 *    The budget lives in `entrancePhases`, so a pace change moves the whole
 *    piece in proportion rather than clipping the ending.
 *  - `prefers-reduced-motion` gets a gentle fade with no travel and no
 *    particles, and a tap or a key skips at any point.
 *  - Transform and opacity only, with a particle budget that halves on modest
 *    hardware. No layout properties are ever animated.
 *  - Sound is synthesised, soft, opt-in and remembered per device. See
 *    `entrance-sound.ts`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  entrancePhases,
  entranceSeenKey,
  FADE_MS,
  type EntrancePace,
  type EntrancePhases,
  type InviteAnimation,
} from "@/lib/invite-entrances";
import {
  playEntranceSound,
  setSoundEnabled,
  shouldPlayOnOpen,
  soundEnabled,
  soundPreference,
} from "@/lib/entrance-sound";

/* --------------------------------------------------------------- utilities */

/** Deterministic-per-open random helpers, kept small and cheap. */
function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Particle budget. Old phones are the audience, and a shower that stutters
 * looks far worse than no shower, so modest hardware gets half the count.
 */
function budget(full: number): number {
  if (typeof navigator === "undefined") return full;
  const cores = (navigator as { hardwareConcurrency?: number }).hardwareConcurrency ?? 8;
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  const modest = cores <= 4 || mem <= 4;
  return modest ? Math.max(4, Math.round(full * 0.5)) : full;
}

const PAPER_COLORS = ["#e85a8a", "#f3c44b", "#5c1d1d", "#5a8a64", "#a5b4fc", "#f7f3ec"];

/* ------------------------------------------------------------ phase timing */

/**
 * One animation string, positioned inside the entrance's own phase budget.
 *
 * `from` and `span` are fractions of the motion window (travel + settle), so a
 * Subtle or Cinematic pace rescales the whole sequence and the relationships
 * between layers survive. `hold` is added to every delay, which is what gives
 * each entrance its motionless opening frame: with `both` fill, an element sits
 * on its own first keyframe until its delay elapses.
 */
function beat(
  name: string,
  t: EntrancePhases,
  from: number,
  span: number,
  ease = "var(--ent-rise)",
): string {
  const motion = t.travel + t.settle;
  const delay = Math.round(t.hold + from * motion);
  const dur = Math.max(80, Math.round(span * motion));
  return `${name} ${dur}ms ${delay}ms ${ease} both`;
}

/** Absolute milliseconds at a fraction through the motion window. */
function at(t: EntrancePhases, from: number): number {
  return Math.round(t.hold + from * (t.travel + t.settle));
}

/** Where the travel ends and the settle begins, as a fraction. */
function settleStart(t: EntrancePhases): number {
  const motion = t.travel + t.settle;
  return motion ? t.travel / motion : 0.6;
}

/* ------------------------------------------------------------------ shell */

export interface InviteEntranceProps {
  eventId: string;
  title: string;
  accent?: string | null;
  animation: InviteAnimation;
  artUrl?: string | null;
  /** Replay every time, at the shorter preview pace, for the host's link. */
  forcePreview?: boolean;
  /** Host's chosen pace. Subtle, Balanced or Cinematic. */
  pace?: EntrancePace | string | null;
  /** Extra scale on top of the pace. The builder preview runs shorter. */
  scale?: number;
  /** The event's own song, faded in under the closing beat of the reveal. */
  
}

export function InviteEntranceOverlay({
  eventId,
  title,
  accent,
  animation,
  artUrl,
  forcePreview,
  pace,
  scale = 1,
}: InviteEntranceProps) {
  /**
   * There is no cover stage any more. The invitation is readable the moment it
   * loads, so this reveal simply plays over the top of it and gets out of the
   * way. Sound is not attempted here: browsers refuse audio without a gesture,
   * and the guest's gesture now belongs to "Play this invitation" further down
   * the page, which is where the sound properly lives.
   */
  const [stage, setStage] = useState<"off" | "playing">("off");
  const [reduced, setReduced] = useState(false);
  const [sound, setSound] = useState(false);
  const closed = useRef(false);
  const stopSound = useRef<(() => void) | null>(null);
  const lifeTimer = useRef<number | null>(null);
  const phases = useMemo(
    () => entrancePhases(animation, pace, scale),
    [animation, pace, scale],
  );

  useEffect(() => {
    if (animation === "none") return;
    const key = entranceSeenKey(eventId);
    if (!forcePreview) {
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "1");
      } catch {
        // Private mode: the reveal simply plays this visit.
      }
    }
    const soft = prefersReducedMotion();
    setReduced(soft);
    open(soft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation, eventId, forcePreview]);

  /** Start the reveal. Silent by definition: no gesture has happened yet. */
  function open(soft: boolean) {
    if (closed.current || stage === "playing") return;
    const withSound = !soft && soundPreference() === "on" && soundEnabled();
    setSound(withSound);
    setStage("playing");
    const life = soft ? 840 : phases.total;
    lifeTimer.current = window.setTimeout(() => finish(), life);
    if (withSound) {
      stopSound.current = playEntranceSound(animation, phases);
      // The event's song is NEVER started here. Music belongs to the guest's
      // own press on "Play this invitation", which is the only place on the
      // page allowed to start audio.

    }
  }

  function finish() {
    if (closed.current) return;
    closed.current = true;
    if (lifeTimer.current) window.clearTimeout(lifeTimer.current);
    stopSound.current?.();
    stopSound.current = null;
    setStage("off");
  }

  useEffect(
    () => () => {
      stopSound.current?.();
      if (lifeTimer.current) window.clearTimeout(lifeTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (stage === "off") return;
    const onKey = () => finish();
    window.addEventListener("keydown", onKey, { once: true });
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  if (stage === "off" || animation === "none") return null;

  const ink = accent || "#5c1d1d";
  // The fade sits at the END of the closing stillness, so the composition is
  // held motionless first and the invitation is never revealed mid-movement.
  const fadeDelay = reduced ? 320 : phases.composed + Math.max(0, phases.rest - FADE_MS);

  const toggleSound = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    const next = !sound;
    setSound(next);
    setSoundEnabled(next);
    if (next) {
      stopSound.current = playEntranceSound(animation, phases);
    } else {
      stopSound.current?.();
      stopSound.current = null;
      
    }
  };

  return (
    <div
      className="kc-ent kc-ent-veil fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-paper"
      style={{
        ["--ent-fade" as string]: `${FADE_MS}ms`,
        ["--ent-fade-delay" as string]: `${fadeDelay}ms`,
      }}
      onPointerDown={() => finish()}
      role="presentation"
      tabIndex={-1}
    >
      <div aria-hidden="true" className="contents">
        {reduced ? (
          <ComposedTitle title={title} ink={ink} phases={phases} plain />
        ) : (
          <EntranceFigure
            animation={animation}
            title={title}
            ink={ink}
            artUrl={artUrl}
            phases={phases}
          />
        )}
      </div>

      {sound ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleSound}
          className="absolute bottom-5 right-5 z-10 flex items-center gap-1.5 rounded-full bg-ink/5 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground backdrop-blur transition hover:bg-ink/10"
          aria-label="Turn reveal sound off"
        >
          <Volume2 className="h-3.5 w-3.5" />
          Sound on
        </button>
      ) : null}

      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => finish()}
        className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink/5 px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] text-muted-foreground backdrop-blur transition hover:bg-ink/10"
      >
        Skip
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ shared parts */

/**
 * The composed title block. It lands in the settle, never during the travel,
 * so the words arrive as the movement is already slowing.
 */
function ComposedTitle({
  title,
  ink,
  phases,
  from,
  plain = false,
  className = "",
}: {
  title: string;
  ink: string;
  phases: EntrancePhases;
  /** Fraction of the motion window at which the words begin to arrive. */
  from?: number;
  plain?: boolean;
  className?: string;
}) {
  const start = from ?? settleStart(phases) * 0.86;
  const composeDur = Math.max(320, Math.round(phases.settle * 0.9));
  return (
    <div
      className={`${plain ? "" : "kc-ent-compose kc-ent-layer"} px-8 text-center ${className}`}
      style={
        plain
          ? undefined
          : {
              ["--ent-delay" as string]: `${at(phases, start)}ms`,
              ["--ent-compose-dur" as string]: `${composeDur}ms`,
            }
      }
    >
      <p className="text-[10px] uppercase tracking-[0.34em]" style={{ color: ink, opacity: 0.7 }}>
        You're invited
      </p>
      <p className="mt-2 font-serif text-3xl leading-tight sm:text-4xl" style={{ color: ink }}>
        {title}
      </p>
    </div>
  );
}

/** Two soft depth layers, the nearest slightly blurred. Costs almost nothing. */
function DepthWash({ ink }: { ink: string }) {
  return (
    <>
      <div
        className="kc-ent-layer pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(60% 45% at 50% 58%, ${ink}14, transparent 70%)`,
        }}
      />
      <div
        className="kc-ent-layer pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
        style={{
          background: `linear-gradient(0deg, ${ink}1f, transparent)`,
          filter: "blur(6px)",
        }}
      />
    </>
  );
}

type FigureProps = { title: string; ink: string; phases: EntrancePhases; artUrl?: string | null };

/* --------------------------------------------------------------- envelope */

/**
 * First frame: a sealed envelope, still, lit from one side. Sequence: the seal
 * gives, the flap falls under its own weight, the card slides out, and the
 * words on the card come up last.
 */
function Envelope({ title, ink, artUrl, phases: t }: FigureProps) {
  const s = settleStart(t);
  return (
    <div className="relative h-56 w-80 [perspective:1200px]">
      <DepthWash ink={ink} />
      {/* Body */}
      <div
        className="absolute inset-0 overflow-hidden rounded-md bg-cover bg-center shadow-2xl"
        style={
          artUrl
            ? { backgroundImage: `linear-gradient(135deg, ${ink}b3, ${ink}80), url("${artUrl}")` }
            : { background: `linear-gradient(135deg, ${ink}, ${ink}cc)` }
        }
      >
        {/* Light catching the paper as the flap moves */}
        <div
          className="kc-ent-layer absolute inset-y-0 -left-1/3 w-1/2"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)",
            animation: beat("kc-ent-sheen", t, 0.04, 0.34, "var(--ent-soft)"),
          }}
        />
      </div>

      {/* Card lifting out: starts as the flap finishes, finishes in the settle */}
      <div
        className="kc-ent-layer absolute inset-x-4 bottom-4 top-12 rounded-md bg-paper shadow-xl ring-1 ring-black/10"
        style={{
          animation: beat("kc-ent-lift", t, s * 0.62, 1 - s * 0.62, "var(--ent-settle)"),
          transformOrigin: "bottom center",
        }}
      >
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">

          <div
            className="kc-ent-compose kc-ent-layer"
            style={{
              ["--ent-delay" as string]: `${at(t, s * 0.94)}ms`,
              ["--ent-compose-dur" as string]: `${Math.max(320, Math.round(t.settle * 0.85))}ms`,
            }}
          >
            <span className="text-[9px] uppercase tracking-[0.3em]" style={{ color: ink }}>
              You're invited
            </span>
            <span className="mt-1 block font-serif text-lg text-ink">{title}</span>
          </div>
        </div>
      </div>

      {/* Shadow the opening flap casts down the body */}
      <div
        className="kc-ent-layer absolute inset-x-0 top-0 h-28 origin-top"
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,.45), transparent)",
          animation: beat("kc-ent-flap-shadow", t, 0, s * 0.72, "var(--ent-settle)"),
        }}
      />

      {/* Flap */}
      <div
        className="kc-ent-layer absolute inset-x-0 top-0 h-28 origin-top rounded-t-md bg-cover bg-center"
        style={{
          backgroundImage: artUrl
            ? `linear-gradient(180deg, ${ink}e6, ${ink}b3), url("${artUrl}")`
            : `linear-gradient(180deg, ${ink}f5, ${ink})`,
          clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          animation: beat("kc-ent-flap", t, 0.03, s * 0.64, "var(--ent-settle)"),
          transformOrigin: "top center",
        }}
      />

      {/* Wax seal, giving first */}
      <div
        className="kc-ent-layer absolute left-1/2 top-20 h-9 w-9 -translate-x-1/2 rounded-full shadow-md"
        style={{
          background: "radial-gradient(circle at 35% 30%, #e85a8a, #7a1b3a)",
          animation: beat("kc-ent-sparkle", t, 0, s * 0.5, "var(--ent-overshoot)"),
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------- dawn */

/** First frame: near-total darkness. The light arrives before the card does. */
function Dawn({ title, ink, phases: t }: FigureProps) {
  const s = settleStart(t);
  return (
    <>
      <div
        className="kc-ent-layer absolute inset-0"
        style={{
          background: "#0b0906",
          animation: beat("kc-ent-dawn-dark", t, 0, 0.92),
        }}
      />
      <div
        className="kc-ent-layer absolute inset-x-0 bottom-[-30%] h-[110%]"
        style={{
          background:
            "radial-gradient(closest-side at 50% 100%, rgba(255,214,150,.95), rgba(232,150,80,.5) 45%, transparent 78%)",
          animation: beat("kc-ent-dawn-glow", t, 0, 0.96),
        }}
      />
      <div
        className="kc-ent-layer relative rounded-2xl px-10 py-8 shadow-2xl"
        style={{
          background: "rgba(250,246,238,.96)",
          animation: beat("kc-ent-dawn-card", t, 0.06, 0.9),
        }}
      >
        <ComposedTitle title={title} ink={ink} phases={t} from={s * 0.9} />
      </div>
    </>
  );
}

/* -------------------------------------------------------------- lightning */

/** First frame: the card in near darkness, waiting. Then one strike. */
function Lightning({ title, ink, phases: t }: FigureProps) {
  const s = settleStart(t);
  return (
    <>
      <div
        className="kc-ent-layer absolute inset-0"
        style={{
          background: "#080a0f",
          animation: beat("kc-ent-dark", t, 0, 0.95),
        }}
      />
      {/* The flash itself: one bright, one weaker. Never a strobe. */}
      <div
        className="kc-ent-layer absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 62% 18%, rgba(255,255,255,.95), rgba(198,214,255,.35) 55%, transparent 80%)",
          animation: beat("kc-ent-flash", t, 0, 0.95, "var(--ent-soft)"),
        }}
      />
      {/* Bolt */}
      <div
        className="kc-ent-layer absolute left-[58%] top-0 h-[46%] w-[3px] origin-top"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,.95), rgba(190,210,255,0))",
          clipPath: "polygon(40% 0, 100% 34%, 55% 40%, 96% 100%, 22% 52%, 62% 44%, 0 26%)",
          filter: "drop-shadow(0 0 8px rgba(200,220,255,.85))",
          animation: beat("kc-ent-bolt", t, 0, 0.95, "var(--ent-soft)"),
        }}
      />
      <div className="relative">
        {/* Shadow thrown by the flash */}
        <div
          className="kc-ent-layer absolute inset-x-2 -bottom-3 h-6 rounded-full"
          style={{
            background: "rgba(0,0,0,.7)",
            filter: "blur(10px)",
            animation: beat("kc-ent-throw-shadow", t, 0, 0.95, "var(--ent-soft)"),
          }}
        />
        <div
          className="kc-ent-layer relative rounded-2xl px-10 py-8 shadow-2xl"
          style={{
            background: "rgba(250,246,238,.97)",
            animation: beat("kc-ent-dawn-card", t, 0.02, 0.92),
          }}
        >
          <ComposedTitle title={title} ink={ink} phases={t} from={s * 0.95} />
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- curtain */

/** First frame: closed drapes, hanging still. They breathe, then they part. */
function Curtain({ title, ink, phases: t }: FigureProps) {
  const folds = useMemo(() => Array.from({ length: budget(8) }, (_, i) => i), []);
  const s = settleStart(t);
  const panel = (side: "left" | "right") => (
    <div
      className="kc-ent-layer absolute inset-y-0 w-[51%] overflow-hidden"
      style={{
        [side]: 0,
        animation: beat(`kc-ent-curtain-${side}`, t, 0.14, 0.84, "var(--ent-settle)"),
      }}
    >
      <div
        className="kc-ent-layer absolute inset-0"
        style={{
          background:
            side === "left"
              ? `linear-gradient(90deg, ${ink}, ${ink}cc)`
              : `linear-gradient(-90deg, ${ink}, ${ink}cc)`,
          boxShadow:
            side === "left"
              ? "inset -22px 0 44px rgba(0,0,0,.45)"
              : "inset 22px 0 44px rgba(0,0,0,.45)",
          ["--ent-sway" as string]: side === "left" ? "0.6deg" : "-0.6deg",
          animation: beat("kc-ent-drape-sway", t, 0, 0.8, "var(--ent-swing)"),
          transformOrigin: "top center",
        }}
      >
        {/* Fabric folds give the drape its weight */}
        {folds.map((i) => (
          <span
            key={i}
            className="absolute inset-y-0"
            style={{
              left: `${(i / folds.length) * 100}%`,
              width: `${100 / folds.length}%`,
              background:
                "linear-gradient(90deg, rgba(0,0,0,.28), rgba(255,255,255,.10) 45%, rgba(0,0,0,.28))",
              opacity: 0.7,
            }}
          />
        ))}
      </div>
    </div>
  );
  return (
    <>
      <DepthWash ink={ink} />
      <ComposedTitle title={title} ink={ink} phases={t} from={s * 0.92} />
      {panel("left")}
      {panel("right")}
    </>
  );
}

/* --------------------------------------------------------------- airplane */

/** First frame: empty paper. The plane enters, banks, and lands into the card. */
function Airplane({ title, ink, phases: t }: FigureProps) {
  const s = settleStart(t);
  const span = Math.min(1, s + 0.22);
  return (
    <>
      <DepthWash ink={ink} />
      <ComposedTitle title={title} ink={ink} phases={t} from={span * 0.88} />
      {/* Nested axes make a banked, curved flight path out of pure transforms */}
      <div
        className="kc-ent-layer absolute"
        style={{ animation: beat("kc-ent-plane-x", t, 0, span, "cubic-bezier(.3,.66,.28,1)") }}
      >
        <div
          className="kc-ent-layer"
          style={{ animation: beat("kc-ent-plane-y", t, 0, span, "cubic-bezier(.42,.12,.4,1)") }}
        >
          <div
            className="kc-ent-layer"
            style={{ animation: beat("kc-ent-plane-bank", t, 0, span, "var(--ent-soft)") }}
          >
            <svg width="86" height="52" viewBox="0 0 86 52" aria-hidden>
              <path d="M2 27 84 3 46 49 38 32Z" fill="#faf6ee" stroke={ink} strokeWidth="1.2" />
              <path d="M2 27 46 49 38 32Z" fill={`${ink}22`} />
              <path d="M84 3 38 32" stroke={ink} strokeWidth="1" opacity=".5" />
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- confetti */

/**
 * Pieces are released in a stagger across the travel and every one has to have
 * finished falling by the end of the settle, so the frame is empty and still
 * before the veil clears.
 */
function Confetti({ title, ink, phases: t }: FigureProps) {
  const s = settleStart(t);
  const pieces = useMemo(
    () =>
      Array.from({ length: budget(38) }, (_, i) => ({
        id: i,
        left: rand(2, 98),
        release: rand(0, s * 0.55),
        fallSpan: rand(0.5, 0.72),
        w: rand(5, 11),
        h: rand(3, 7),
        drift: rand(10, 46) * (Math.random() < 0.5 ? -1 : 1),
        spin: rand(160, 620),
        color: pick(PAPER_COLORS),
        round: Math.random() < 0.25,
      })),
    [s],
  );
  return (
    <>
      <DepthWash ink={ink} />
      <ComposedTitle title={title} ink={ink} phases={t} from={s * 0.5} />
      {pieces.map((p) => {
        // Clamp so nothing is still on screen when the reveal goes quiet.
        const span = Math.min(p.fallSpan, 0.97 - p.release);
        const fall = beat("kc-ent-conf-fall", t, p.release, span, "var(--ent-gravity)");
        const flutter = beat("kc-ent-conf-flutter", t, p.release, span, "var(--ent-swing)");
        return (
          <span
            key={p.id}
            className="kc-ent-layer absolute top-0 block"
            style={{ left: `${p.left}%`, animation: fall }}
          >
            <span
              className="kc-ent-layer block"
              style={{
                width: p.w,
                height: p.round ? p.w : p.h,
                borderRadius: p.round ? "50%" : 1,
                background: p.color,
                ["--ent-drift" as string]: `${p.drift}px`,
                ["--ent-spin" as string]: `${p.spin}deg`,
                animation: flutter,
                filter: p.w > 9 ? "blur(.4px)" : undefined,
              }}
            />
          </span>
        );
      })}
    </>
  );
}

/* -------------------------------------------------------------- fireworks */

/** Shells fire in sequence through the travel; the last sparks die in the settle. */
function Fireworks({ title, phases: t }: FigureProps) {
  const s = settleStart(t);
  const shells = useMemo(() => {
    const count = budget(4);
    const sparkCount = budget(10);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: rand(16, 84),
      y: rand(14, 52),
      // Sequenced, not simultaneous: each shell owns its own moment.
      release: (i / Math.max(1, count)) * s * 0.8 + rand(0, 0.02),
      color: pick(["#f3c44b", "#e85a8a", "#a5b4fc", "#f7f3ec"]),
      size: rand(70, 130),
      sparks: Array.from({ length: sparkCount }, (_, sp) => {
        const angle = (sp / sparkCount) * Math.PI * 2 + rand(-0.2, 0.2);
        const reach = rand(26, 58);
        return {
          id: sp,
          sx: Math.cos(angle) * reach,
          sy: Math.sin(angle) * reach,
          span: rand(0.24, 0.36),
        };
      }),
    }));
  }, [s]);
  return (
    <>
      <div className="absolute inset-0" style={{ background: "#0d0b12", opacity: 0.9 }} />
      <ComposedTitle title={title} ink="#faf6ee" phases={t} from={s * 0.92} className="relative z-10" />
      {shells.map((sh) => (
        <span key={sh.id} className="absolute" style={{ left: `${sh.x}%`, top: `${sh.y}%` }}>
          <span
            className="kc-ent-layer absolute block h-1.5 w-1.5 rounded-full"
            style={{
              background: sh.color,
              animation: beat("kc-ent-shell", t, sh.release, 0.16, "var(--ent-soft)"),
            }}
          />
          <span
            className="kc-ent-layer absolute block rounded-full"
            style={{
              width: sh.size,
              height: sh.size,
              marginLeft: -sh.size / 2,
              marginTop: -sh.size / 2,
              background: `radial-gradient(circle, ${sh.color}cc, transparent 62%)`,
              animation: beat("kc-ent-burst", t, sh.release + 0.14, 0.26, "var(--ent-soft)"),
            }}
          />
          {sh.sparks.map((sp) => (
            <span
              key={sp.id}
              className="kc-ent-layer absolute block h-1 w-1 rounded-full"
              style={{
                background: sh.color,
                ["--ent-sx" as string]: `${sp.sx}px`,
                ["--ent-sy" as string]: `${sp.sy}px`,
                animation: beat(
                  "kc-ent-spark",
                  t,
                  sh.release + 0.15,
                  Math.min(sp.span, 0.96 - sh.release),
                  "var(--ent-gravity)",
                ),
              }}
            />
          ))}
        </span>
      ))}
    </>
  );
}

/* --------------------------------------------------------------- balloons */

/** They leave the floor at different moments and the frame empties by the end. */
/**
 * A bouquet, opening.
 *
 * Built for weddings, anniversaries and memorials, which means it must never
 * pop. Stems rise first, then each bloom unfurls on its own delay, and the
 * petals arrive last and land with weight. The layers are sequenced with real
 * gaps: stems finish before the first bloom starts, and the title lands after
 * the last petal, so nothing overlaps into mush.
 */
function Bouquet({ title, ink, phases: t }: FigureProps) {
  const s = settleStart(t);
  const blooms = useMemo(
    () =>
      Array.from({ length: budget(7) }, (_, i) => {
        const spread = (i - 3) / 3;
        return {
          id: i,
          x: spread * rand(58, 82),
          y: -Math.abs(spread) * rand(10, 26) - rand(0, 18),
          size: rand(46, 72) * (Math.abs(spread) > 0.7 ? 0.82 : 1),
          // Each bloom waits its turn. The centre opens first.
          open: s * 0.42 + Math.abs(spread) * s * 0.3 + rand(0, 0.04),
          tilt: spread * rand(6, 16),
          petals: 6,
          color: pick(["#e6a6b8", "#f4dfe4", "#e8c7a1", "#d98fa5", "#f7f0e6"]),
          heart: pick(["#f3c44b", "#e8b26a"]),
        };
      }),
    [s],
  );
  return (
    <>
      <DepthWash ink={ink} />

      {/* Stems, rising alone in the first part of the movement. */}
      <span className="absolute left-1/2 top-1/2 block h-0 w-0">
        {blooms.map((b) => (
          <span
            key={`stem-${b.id}`}
            className="kc-ent-layer absolute block origin-bottom"
            style={{
              left: b.x,
              top: b.y,
              width: 2,
              height: 132 + Math.abs(b.x) * 0.22,
              transform: `rotate(${b.tilt}deg)`,
              background: "linear-gradient(180deg, #5a8a64, rgba(90,138,100,0))",
              animation: beat("kc-ent-stem-rise", t, 0.02, s * 0.34, "cubic-bezier(.22,.7,.2,1)"),
            }}
          />
        ))}
      </span>

      {/* Blooms unfurling, one after another, in the settle. */}
      <span className="absolute left-1/2 top-1/2 block h-0 w-0">
        {blooms.map((b) => (
          <span
            key={`bloom-${b.id}`}
            className="kc-ent-layer absolute block"
            style={{
              left: b.x - b.size / 2,
              top: b.y - b.size / 2,
              width: b.size,
              height: b.size,
              animation: beat("kc-ent-bloom-open", t, b.open, 0.3, "cubic-bezier(.2,.72,.22,1)"),
            }}
          >
            {Array.from({ length: b.petals }, (_, p) => (
              <span
                key={p}
                className="kc-ent-layer absolute left-1/2 top-1/2 block origin-bottom rounded-[50%]"
                style={{
                  width: b.size * 0.44,
                  height: b.size * 0.62,
                  marginLeft: -b.size * 0.22,
                  marginTop: -b.size * 0.6,
                  background: `radial-gradient(60% 70% at 50% 80%, rgba(255,255,255,.7), ${b.color})`,
                  ["--ent-petal" as string]: `${(360 / b.petals) * p}deg`,
                  animation: beat(
                    "kc-ent-petal-unfurl",
                    t,
                    b.open + p * 0.012,
                    0.28,
                    "cubic-bezier(.2,.7,.24,1)",
                  ),
                }}
              />
            ))}
            <span
              className="absolute left-1/2 top-1/2 block rounded-full"
              style={{
                width: b.size * 0.2,
                height: b.size * 0.2,
                marginLeft: -b.size * 0.1,
                marginTop: -b.size * 0.1,
                background: b.heart,
                animation: beat("kc-ent-bloom-heart", t, b.open + 0.1, 0.24),
              }}
            />
          </span>
        ))}
      </span>

      {/* The title arrives after the last petal has landed, never with it. */}
      <ComposedTitle title={title} ink={ink} phases={t} from={Math.min(0.96, s * 0.42 + s * 0.34 + 0.12)} />
    </>
  );
}

function Balloons({ title, ink, phases: t }: FigureProps) {
  const s = settleStart(t);
  const balloons = useMemo(
    () =>
      Array.from({ length: budget(11) }, (_, i) => ({
        id: i,
        left: rand(3, 94),
        release: rand(0, s * 0.4),
        span: rand(0.6, 0.86),
        size: rand(26, 52),
        drift: rand(8, 40) * (Math.random() < 0.5 ? -1 : 1),
        sway: rand(3, 9),
        color: pick(["#e85a8a", "#f3c44b", "#5a8a64", "#a5b4fc", "#c9793f"]),
        near: Math.random() < 0.3,
      })),
    [s],
  );
  return (
    <>
      <DepthWash ink={ink} />
      <ComposedTitle title={title} ink={ink} phases={t} from={s * 0.55} />
      {balloons.map((b) => {
        const span = Math.min(b.span, 0.97 - b.release);
        return (
          <span
            key={b.id}
            className="kc-ent-layer absolute bottom-0"
            style={{
              left: `${b.left}%`,
              ["--ent-drift" as string]: `${b.drift}px`,
              animation: beat("kc-ent-balloon-rise", t, b.release, span, "cubic-bezier(.32,.5,.28,1)"),
              filter: b.near ? "blur(1.2px)" : undefined,
            }}
          >
            <span
              className="kc-ent-layer block origin-top"
              style={{
                ["--ent-sway" as string]: `${b.sway}deg`,
                animation: beat("kc-ent-balloon-swing", t, b.release, span * 0.7, "var(--ent-swing)"),
              }}
            >
              <span
                className="block rounded-[50%]"
                style={{
                  width: b.size,
                  height: b.size * 1.2,
                  background: `radial-gradient(circle at 32% 28%, rgba(255,255,255,.65), ${b.color} 58%)`,
                }}
              />
              <span
                className="mx-auto block"
                style={{
                  width: 1,
                  height: b.size * 1.1,
                  background: `linear-gradient(180deg, ${b.color}aa, transparent)`,
                }}
              />
            </span>
          </span>
        );
      })}
    </>
  );
}

/* ---------------------------------------------------------------- sparkle */

/** Points of light bloom in layers, the nearest blurred, and dissolve. */
function Sparkle({ title, ink, phases: t }: FigureProps) {
  const s = settleStart(t);
  const layers = useMemo(
    () =>
      Array.from({ length: budget(20) }, (_, i) => ({
        id: i,
        x: rand(4, 96),
        y: rand(6, 94),
        release: rand(0, s * 0.7),
        span: rand(0.22, 0.34),
        size: rand(6, 18),
        near: Math.random() < 0.3,
        color: pick(["#f3c44b", "#f7f3ec", "#e8c9a0"]),
      })),
    [s],
  );
  return (
    <>
      <DepthWash ink={ink} />
      <ComposedTitle title={title} ink={ink} phases={t} from={s * 0.6} />
      {layers.map((sp) => (
        <span
          key={sp.id}
          className="kc-ent-layer absolute"
          style={{
            left: `${sp.x}%`,
            top: `${sp.y}%`,
            animation: beat(
              "kc-ent-sparkle",
              t,
              sp.release,
              Math.min(sp.span, 0.96 - sp.release),
              "var(--ent-overshoot)",
            ),
            filter: sp.near ? "blur(1px)" : undefined,
          }}
        >
          <span
            className="block"
            style={{
              width: sp.size,
              height: sp.size,
              background: sp.color,
              clipPath:
                "polygon(50% 0, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0 50%, 42% 42%)",
            }}
          />
        </span>
      ))}
    </>
  );
}

/* -------------------------------------------------------- shared figure */

/**
 * The moving part of an entrance, without the full-screen overlay. The
 * invitation uses it inside the overlay; the picker uses it at small scale so a
 * host sees the real animation rather than a symbol standing in for it.
 */
export function EntranceFigure({
  animation,
  title,
  ink,
  artUrl,
  phases,
  pace,
  scale,
}: {
  animation: InviteAnimation;
  title: string;
  ink: string;
  artUrl?: string | null;
  /** Phase budget. Falls back to the animation's own budget at this pace. */
  phases?: EntrancePhases;
  pace?: EntrancePace | string | null;
  scale?: number;
}) {
  const t = phases ?? entrancePhases(animation, pace ?? "balanced", scale ?? 1);
  const props: FigureProps = { title, ink, phases: t };
  switch (animation) {
    case "envelope":
      return <Envelope {...props} artUrl={artUrl} />;
    case "dawn":
      return <Dawn {...props} />;
    case "lightning":
      return <Lightning {...props} />;
    case "curtain":
      return <Curtain {...props} />;
    case "airplane":
      return <Airplane {...props} />;
    case "confetti":
      return <Confetti {...props} />;
    case "fireworks":
      return <Fireworks {...props} />;
    case "balloons":
      return <Balloons {...props} />;
    case "bouquet":
      return <Bouquet {...props} />;
    case "sparkle":
      return <Sparkle {...props} />;
    default:
      return null;
  }
}
