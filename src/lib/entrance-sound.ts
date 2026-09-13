/**
 * The reveal's sound bed.
 *
 * Synthesised with the Web Audio API rather than shipped as files: an
 * invitation opened on mobile data should not pay for an audio download to hear
 * two seconds of paper. Everything here is a short, soft, low-level gesture
 * that sits under the animation. It is never music.
 *
 * Rules:
 *  - Off by default, remembered per device once a guest turns it on, because
 *    browsers block autoplay audio and a guest in a meeting would not thank us.
 *  - Every failure is swallowed. A blocked audio context must never break a
 *    reveal or throw into the page.
 *  - Peak gain stays low (well under 0.2) and each bed ends with the settle.
 */

import { ENTRANCE_SOUND_KEY, type InviteAnimation } from "@/lib/invite-entrances";

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ENTRANCE_SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(ENTRANCE_SOUND_KEY, on ? "1" : "0");
  } catch {
    /* private mode: the choice simply lasts this visit */
  }
}

type Ctx = AudioContext & { kcNoise?: AudioBuffer };

/**
 * One audio context for the whole page. Browsers cap how many can exist, and a
 * picker showing ten entrances used to try for ten (and a fresh one on every
 * loop), so most previews fell silent. Everything shares this one instead.
 */
let shared: Ctx | null = null;

function makeContext(): Ctx | null {
  if (typeof window === "undefined") return null;
  if (shared && shared.state !== "closed") return shared;
  const AC =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    shared = new AC() as Ctx;
    return shared;
  } catch {
    return null;
  }
}

/**
 * Call this straight from a real click or tap. Safari only lets audio start from
 * a gesture, so the context must be created and resumed inside the handler,
 * not later in an effect.
 */
export function unlockEntranceAudio() {
  const ctx = makeContext();
  if (!ctx) return;
  try {
    void ctx.resume();
  } catch {
    /* ignore */
  }
}

/** Two seconds of white noise, reused by every noise-based gesture. */
function noise(ctx: Ctx): AudioBuffer {
  if (ctx.kcNoise) return ctx.kcNoise;
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  ctx.kcNoise = buf;
  return buf;
}

interface Shape {
  /** Seconds from the start of the bed. */
  at: number;
  dur: number;
  peak: number;
  /** Filtered noise (paper, thunder) or a warm tone (swell, chime). */
  kind: "noise" | "tone";
  freq: number;
  q?: number;
  /** Tone only: glide to this frequency. */
  to?: number;
}

/**
 * Sound design per entrance, expressed in seconds against the animation's own
 * phases. `hold`/`travel`/`settle` arrive in seconds so a Cinematic pace
 * stretches the bed with the picture instead of falling out of sync.
 */
function score(
  animation: InviteAnimation,
  hold: number,
  travel: number,
  settle: number,
): Shape[] {
  const move = hold;
  const land = hold + travel;
  const end = hold + travel + settle;
  switch (animation) {
    case "envelope":
      return [
        // Flap lifting: dry paper, then the card sliding out of the sleeve.
        { at: move + 0.05, dur: travel * 0.5, peak: 0.1, kind: "noise", freq: 2600, q: 0.7 },
        { at: land - travel * 0.1, dur: settle * 0.7, peak: 0.07, kind: "noise", freq: 1400, q: 0.6 },
        { at: end - settle * 0.25, dur: 0.5, peak: 0.05, kind: "tone", freq: 392, to: 294 },
      ];
    case "dawn":
      return [
        { at: move, dur: travel + settle * 0.8, peak: 0.11, kind: "tone", freq: 98, to: 147 },
        { at: land, dur: settle, peak: 0.06, kind: "tone", freq: 294, to: 392 },
      ];
    case "lightning":
      return [
        { at: move + travel * 0.14, dur: 0.12, peak: 0.14, kind: "noise", freq: 5200, q: 0.5 },
        { at: move + travel * 0.18, dur: travel + settle * 0.6, peak: 0.12, kind: "noise", freq: 90, q: 0.4 },
      ];
    case "curtain":
      return [
        { at: move, dur: travel, peak: 0.1, kind: "noise", freq: 700, q: 0.5 },
        { at: land, dur: settle * 0.8, peak: 0.06, kind: "tone", freq: 131, to: 196 },
      ];
    case "airplane":
      return [
        { at: move, dur: travel * 0.9, peak: 0.08, kind: "noise", freq: 1800, q: 0.6 },
        { at: land, dur: settle * 0.5, peak: 0.05, kind: "noise", freq: 900, q: 0.6 },
      ];
    case "sparkle":
      return [
        { at: move, dur: travel * 0.8, peak: 0.06, kind: "tone", freq: 1568, to: 2093 },
        { at: land, dur: settle * 0.7, peak: 0.05, kind: "tone", freq: 1046, to: 784 },
      ];
    case "confetti":
      return [
        { at: move, dur: travel * 0.85, peak: 0.08, kind: "noise", freq: 3200, q: 0.6 },
        { at: land, dur: settle * 0.6, peak: 0.05, kind: "tone", freq: 523, to: 392 },
      ];
    case "fireworks":
      return [
        { at: move + travel * 0.2, dur: 0.35, peak: 0.11, kind: "noise", freq: 160, q: 0.5 },
        { at: move + travel * 0.55, dur: 0.35, peak: 0.09, kind: "noise", freq: 220, q: 0.5 },
        { at: land, dur: settle * 0.8, peak: 0.06, kind: "noise", freq: 4200, q: 0.7 },
      ];
    case "balloons":
      return [
        { at: move, dur: travel * 0.7, peak: 0.07, kind: "noise", freq: 1200, q: 0.6 },
        { at: land, dur: settle * 0.7, peak: 0.05, kind: "tone", freq: 349, to: 262 },
      ];
    case "bouquet":
      // A soft unfurl, not a pop: leaves brushing, then a warm open chord that
      // rises under the blooms and rests as they settle.
      return [
        { at: move + travel * 0.1, dur: travel * 0.6, peak: 0.06, kind: "noise", freq: 1900, q: 0.5 },
        { at: land - travel * 0.2, dur: settle * 0.9, peak: 0.09, kind: "tone", freq: 131, to: 196 },
        { at: land, dur: settle * 0.8, peak: 0.05, kind: "tone", freq: 392, to: 523 },
      ];
    default:
      return [];
  }
}

/**
 * Play the bed for one entrance. Returns a stop function. Safe to call when
 * audio is blocked: it simply does nothing.
 */
export function playEntranceSound(
  animation: InviteAnimation,
  phases: { hold: number; travel: number; settle: number },
): () => void {
  const shapes = score(animation, phases.hold / 1000, phases.travel / 1000, phases.settle / 1000);
  if (!shapes.length) return () => {};
  const ctx = makeContext();
  if (!ctx) return () => {};
  try {
    void ctx.resume();
  } catch {
    /* ignore */
  }
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.02;

  for (const s of shapes) {
    const gain = ctx.createGain();
    const start = t0 + Math.max(0, s.at);
    const stop = start + Math.max(0.05, s.dur);
    // Long attack, longer release: the bed must never click or punch.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(s.peak, start + Math.min(0.35, s.dur * 0.45));
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    gain.connect(master);

    if (s.kind === "noise") {
      const src = ctx.createBufferSource();
      src.buffer = noise(ctx);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = s.freq > 1000 ? "highpass" : "lowpass";
      filter.frequency.value = s.freq;
      filter.Q.value = s.q ?? 0.6;
      src.connect(filter).connect(gain);
      src.start(start);
      src.stop(stop + 0.05);
    } else {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(s.freq, start);
      if (s.to) osc.frequency.linearRampToValueAtTime(s.to, stop);
      osc.connect(gain);
      osc.start(start);
      osc.stop(stop + 0.05);
    }
  }

  return () => {
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      // The context is shared with every other preview on the page, so fade this
      // bed out and disconnect it rather than closing the context.
      window.setTimeout(() => {
        try {
          master.disconnect();
        } catch {
          /* ignore */
        }
      }, 300);
    } catch {
      /* ignore */
    }
  };
}

/* --------------------------------------------------------- the tap to open */

/**
 * Three states, not two. A guest who has never chosen gets sound on their
 * opening tap (the gesture browsers require); a guest who has turned it off
 * stays silent for good.
 */
export function soundPreference(): "on" | "off" | "unset" {
  if (typeof window === "undefined") return "unset";
  try {
    const raw = localStorage.getItem(ENTRANCE_SOUND_KEY);
    return raw === "1" ? "on" : raw === "0" ? "off" : "unset";
  } catch {
    return "unset";
  }
}

/** Sound is allowed to start only from a real gesture, or a stored yes. */
export function shouldPlayOnOpen(gesture: boolean): boolean {
  const pref = soundPreference();
  if (pref === "off") return false;
  return gesture || pref === "on";
}

/* --------------------------------------------------------- no song handoff */

/**
 * There used to be a "hand off to the event song" path here: the reveal faded
 * the song in under its own closing beat and left it playing. It has been
 * removed on purpose. It started music nobody asked for, and because it owned
 * its own audio element, no Stop control on the page could reach it. All music
 * now goes through `src/lib/invite-audio.ts`, and only a guest starts it.
 */
