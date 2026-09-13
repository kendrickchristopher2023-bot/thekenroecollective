import { useEffect, useRef, useState } from "react";

/**
 * Lightweight DOM confetti. No dependency, no canvas, and it removes itself.
 * Skipped entirely when the visitor prefers reduced motion.
 */
export function ConfettiBurst({ pieces = 60, colors }: { pieces?: number; colors?: string[] }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 4200);
    return () => clearTimeout(t);
  }, []);

  if (!on) return null;
  const palette = colors?.length ? colors : ["#C2410C", "#6B4227", "#D4B483", "#3D5B3D", "#B8576A"];

  return (
    <div className="ecard-confetti-layer" aria-hidden>
      {Array.from({ length: pieces }).map((_, i) => (
        <span
          key={i}
          className="ecard-confetti-piece"
          style={{
            left: `${(i / pieces) * 100 + Math.random() * 3}%`,
            background: palette[i % palette.length],
            animationDelay: `${Math.random() * 700}ms`,
            animationDuration: `${2400 + Math.random() * 1600}ms`,
            transform: `rotate(${Math.random() * 360}deg)`,
            width: i % 5 === 0 ? "6px" : "8px",
            height: i % 3 === 0 ? "14px" : "9px",
          }}
        />
      ))}
    </div>
  );
}

export type MoodId = "warm" | "calm" | "bright";

type Mood = {
  id: MoodId;
  label: string;
  /** Chord progression in Hz, each chord held for one bar. */
  chords: number[][];
  /** Gentle melody notes sprinkled over the pad. */
  sparkle: number[];
  bar: number;
};

/**
 * Three ambient moods, generated in the browser with the Web Audio API.
 *
 * We synthesise the music rather than shipping audio files, so there is no
 * third-party music licence involved anywhere in the product. Nothing ever
 * plays until the listener taps the toggle.
 */
export const MONTAGE_MOODS: Mood[] = [
  {
    id: "warm",
    label: "Warm",
    // Fmaj7 - Cmaj - Dm7 - Bb
    chords: [
      [174.61, 220, 261.63, 329.63],
      [130.81, 196, 261.63, 329.63],
      [146.83, 220, 261.63, 349.23],
      [116.54, 174.61, 233.08, 293.66],
    ],
    sparkle: [523.25, 659.25, 587.33, 440],
    bar: 4.2,
  },
  {
    id: "calm",
    label: "Calm",
    // Dm9 - Gmaj7 - Am - Fmaj7
    chords: [
      [146.83, 220, 293.66, 349.23],
      [98, 196, 246.94, 293.66],
      [110, 164.81, 220, 329.63],
      [174.61, 261.63, 329.63, 440],
    ],
    sparkle: [440, 493.88, 587.33, 392],
    bar: 5.2,
  },
  {
    id: "bright",
    label: "Bright",
    // Cmaj9 - Gmaj - Emin7 - Amin7
    chords: [
      [130.81, 196, 261.63, 392],
      [98, 196, 293.66, 391.99],
      [164.81, 246.94, 329.63, 493.88],
      [110, 220, 329.63, 440],
    ],
    sparkle: [659.25, 783.99, 587.33, 523.25],
    bar: 3.8,
  },
];

const PAD_LEVEL = 0.16;

export function useMontageMusic() {
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mood, setMoodState] = useState<MoodId>("warm");

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setPlaying(false);
  };

  /** Must be called from a user gesture: browsers block audio otherwise. */
  const start = async (id: MoodId = mood) => {
    if (typeof window === "undefined") return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    stop();

    const ctx = ctxRef.current ?? new Ctor();
    ctxRef.current = ctx;
    // Contexts start suspended until a gesture resumes them. Await it, or the
    // scheduled notes are silently dropped on Safari and Chrome.
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        /* keep going, some browsers resolve late */
      }
    }

    const preset = MONTAGE_MOODS.find((m) => m.id === id) ?? MONTAGE_MOODS[0]!;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(PAD_LEVEL, ctx.currentTime + 2);

    // A soft low-pass keeps the pad mellow instead of buzzy.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1600;
    tone.Q.value = 0.6;
    tone.connect(master);
    master.connect(ctx.destination);

    let stopped = false;
    let bar = 0;

    const voice = (freq: number, at: number, dur: number, level: number, type: OscillatorType) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(level, at + dur * 0.35);
      gain.gain.linearRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain);
      gain.connect(tone);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    };

    // Schedule a couple of bars ahead on a repeating timer so playback simply
    // keeps going for as long as the montage is open.
    const scheduleBar = () => {
      if (stopped) return;
      const at = ctx.currentTime + 0.08;
      const chord = preset.chords[bar % preset.chords.length]!;
      chord.forEach((freq, i) => {
        voice(freq, at, preset.bar * 1.15, i === 0 ? 0.34 : 0.2, i % 2 === 0 ? "sine" : "triangle");
      });
      const note = preset.sparkle[bar % preset.sparkle.length]!;
      voice(note, at + preset.bar * 0.45, preset.bar * 0.6, 0.075, "sine");
      bar += 1;
    };

    scheduleBar();
    const interval = window.setInterval(scheduleBar, preset.bar * 1000);

    stopRef.current = () => {
      stopped = true;
      window.clearInterval(interval);
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        setTimeout(() => {
          try {
            master.disconnect();
            tone.disconnect();
          } catch {
            /* already gone */
          }
        }, 600);
      } catch {
        /* already gone */
      }
    };

    setPlaying(true);
  };

  const setMood = (id: MoodId) => {
    setMoodState(id);
    if (playing) void start(id);
  };

  useEffect(() => () => stop(), []);

  return {
    playing,
    mood,
    setMood,
    start,
    stop,
    toggle: () => {
      if (playing) stop();
      else void start();
    },
  };
}

