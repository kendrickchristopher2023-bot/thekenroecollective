// The wall's audio must never have a hole in it, and Christopher's only track
// tonight is 30 seconds on repeat. These lock the handover arithmetic the player
// schedules, so "does a short song loop cleanly" is answered by the test suite
// rather than by standing in the room hoping.
import { describe, expect, it } from "vitest";
import { CLEAN_GAP_MS, segmentSchedule, transitionPlan } from "@/lib/wall-soundtrack";

const short = { bpm: 110, energy: 0.5, seconds: 30 };

describe("short track on repeat", () => {
  const plan = transitionPlan(short, short);
  const sched = segmentSchedule({ playableSec: 29.4, plan, isRepeat: true });

  it("starts the next pass before this one has finished, so there is no silence", () => {
    expect(sched.handoverSec).toBeLessThan(29.4);
    expect(sched.overlapSec).toBeGreaterThan(0);
    // The overlap covers the gap between handover and the end of audio.
    expect(29.4 - sched.handoverSec).toBeCloseTo(sched.overlapSec, 5);
  });

  it("never layers the same recording over itself for long", () => {
    expect(sched.overlapSec).toBeLessThanOrEqual(1.2);
  });

  it("holds both fades inside the overlap, so the old copy is gone by then", () => {
    expect(sched.fadeInSec).toBeLessThanOrEqual(sched.overlapSec);
    expect(sched.fadeOutSec).toBeLessThanOrEqual(sched.overlapSec);
  });

  it("keeps the loop point well past the lift-in", () => {
    expect(sched.fadeOutAtSec).toBeGreaterThan(sched.fadeInSec + 0.19);
  });

  it("repeats a short song at a steady period, so it cannot stutter", () => {
    const period = sched.handoverSec;
    expect(period).toBeGreaterThan(20);
    expect(period).toBeLessThan(29.4);
  });
});

describe("short track on repeat with clean gaps", () => {
  const plan = transitionPlan(short, short, { noCrossfade: true });
  const sched = segmentSchedule({ playableSec: 29.4, plan, isRepeat: true, noCrossfade: true });

  it("takes a breath rather than the full between-songs silence", () => {
    expect(sched.gapSec).toBeCloseTo(0.25, 5);
    expect(sched.gapSec).toBeLessThan(CLEAN_GAP_MS / 1000);
  });

  it("waits for the tail to finish before restarting", () => {
    expect(sched.handoverSec).toBeCloseTo(sched.fadeOutAtSec + sched.fadeOutSec + 0.25, 5);
  });
});

describe("two different songs", () => {
  const a = { bpm: 96, energy: 0.4, seconds: 184 };
  const b = { bpm: 110, energy: 0.6, seconds: 200 };
  const sched = segmentSchedule({
    playableSec: 183,
    plan: transitionPlan(a, b),
    isRepeat: false,
  });

  it("blends across a longer overlap than a repeat gets", () => {
    expect(sched.overlapSec).toBeGreaterThan(1.2);
    expect(sched.handoverSec).toBeLessThan(183);
  });
});
