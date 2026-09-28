/**
 * Small looping preview of a real entrance, used in the picker so a host sees
 * what they are choosing. It runs the same animation code as the invitation,
 * scaled down, and restarts on a gentle loop.
 *
 * The loop runs at the shorter preview pace: a host comparing ten entrances
 * should not wait three seconds each time, while the guest still gets the full
 * reveal. Under `prefers-reduced-motion` it shows a still frame instead.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { EntranceFigure } from "@/components/invite-entrance";
import { playEntranceSound } from "@/lib/entrance-sound";
import {
  entrancePhases,
  PREVIEW_SCALE,
  type EntrancePace,
  type InviteAnimation,
} from "@/lib/invite-entrances";

export function EntrancePreview({
  animation,
  accent,
  label,
  pace,
  playing = true,
  sound = false,
}: {
  animation: InviteAnimation;
  accent?: string | null;
  label: string;
  /** The host's chosen pace, so the preview reflects their setting. */
  pace?: EntrancePace | string | null;
  /** Pause the loop when the card is off screen or not hovered/selected. */
  playing?: boolean;
  /** Host asked to hear entrances. Only ever true after their own click. */
  sound?: boolean;
}) {
  const [beat, setBeat] = useState(0);
  const [reduced, setReduced] = useState(false);
  const timer = useRef<number | null>(null);
  const phases = useMemo(
    () => entrancePhases(animation, pace, PREVIEW_SCALE),
    [animation, pace],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (!playing || reduced || animation === "none") return;
    // A clear pause between loops, so each run reads as a deliberate reveal
    // rather than a stutter.
    timer.current = window.setInterval(() => setBeat((b) => b + 1), phases.total + 600);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, reduced, animation, phases.total]);

  // The bed runs with each loop of the picture, at the preview's own pace.
  useEffect(() => {
    if (!sound || reduced || animation === "none" || !playing) return;
    const stop = playEntranceSound(animation, phases);
    return () => stop();
  }, [sound, reduced, animation, playing, phases, beat]);

  const ink = accent || "#5c1d1d";

  if (animation === "none") {
    return (
      <div className="relative grid h-16 w-full place-items-center overflow-hidden rounded-md bg-paper ring-1 ring-ink/10">
        <span className="font-serif text-[11px]" style={{ color: ink }}>
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      className="kc-ent relative h-16 w-full overflow-hidden rounded-md bg-paper ring-1 ring-ink/10"
      aria-hidden="true"
    >
      <div
        key={reduced ? "still" : beat}
        className="absolute inset-0 flex origin-center items-center justify-center"
        style={{
          transform: "scale(0.22)",
          width: `${100 / 0.22}%`,
          height: `${100 / 0.22}%`,
          left: `${-((100 / 0.22 - 100) / 2)}%`,
          top: `${-((100 / 0.22 - 100) / 2)}%`,
          animationPlayState: reduced ? "paused" : undefined,
        }}
      >
        <EntranceFigure animation={animation} title={label} ink={ink} phases={phases} />
      </div>
    </div>
  );
}
