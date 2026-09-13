import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF_EXTRAS, type StudioBrief } from "@/lib/studio-brief";
import { DEFAULT_SONG_SETTINGS } from "@/lib/wall-soundtrack";
import type { PlanChunk } from "@/lib/studio-words";
import {
  applyConstraints,
  constraintDirective,
  hardConstraints,
  isInstrumental,
  settingsUsed,
  verifyPlan,
} from "@/lib/studio-constraints";

const brief = (over: Partial<StudioBrief> = {}): StudioBrief =>
  ({
    ...DEFAULT_SONG_SETTINGS,
    ...DEFAULT_BRIEF_EXTRAS,
    genre: "soul",
    mood: "joyful",
    voice: "female lead",
    instruments: ["acoustic guitar"],
    ...over,
  }) as StudioBrief;

const chunk = (over: Partial<PlanChunk> = {}): PlanChunk => ({
  text: "[Verse 1]\nround the bonfire light",
  durationMs: 30000,
  positiveStyles: ["soul", "joyful mood"],
  negativeStyles: [],
  ...over,
});

describe("hardConstraints", () => {
  it("puts the voice first and states it as non-negotiable", () => {
    const checks = hardConstraints(brief());
    const voice = checks.find((c) => c.id === "voice")!;
    expect(voice.chosen).toBe("female lead");
    expect(voice.direction).toMatch(/female lead/i);
    expect(voice.negatives.join(" ")).toMatch(/male vocal/i);
  });

  it("says fully instrumental in both directions", () => {
    const checks = hardConstraints(brief({ voice: "instrumental" }));
    const voice = checks.find((c) => c.id === "voice")!;
    expect(voice.direction).toMatch(/FULLY INSTRUMENTAL/);
    expect(voice.positives.join(" ")).toMatch(/no vocals/i);
    expect(isInstrumental(brief({ voice: "instrumental" }))).toBe(true);
  });

  it("marks mix-only controls as unverifiable rather than claiming them", () => {
    const checks = hardConstraints(brief());
    expect(checks.find((c) => c.id === "tempo")!.verifiable).toBe(false);
    expect(checks.find((c) => c.id === "genre")!.verifiable).toBe(true);
  });

  it("carries each chosen instrument", () => {
    const checks = hardConstraints(brief({ instruments: ["hammond organ"] }));
    expect(checks.some((c) => c.id === "instrument:hammond organ")).toBe(true);
  });
});

describe("constraintDirective", () => {
  it("labels the block as overriding anything above it", () => {
    const text = constraintDirective(hardConstraints(brief()));
    expect(text).toMatch(/NON-NEGOTIABLE SETTINGS/);
    expect(text).toMatch(/override/i);
    expect(text).toMatch(/female lead/i);
  });
});

describe("applyConstraints", () => {
  it("strips a contradicting style, forbids it, and asserts the choice", () => {
    const out = applyConstraints(
      [chunk({ positiveStyles: ["male lead vocal", "soul"] })],
      hardConstraints(brief()),
    );
    // "female lead vocal" contains "male lead vocal", so the check needs the
    // same word-boundary rule the module uses.
    expect(out[0]!.positiveStyles).not.toContain("male lead vocal");
    expect(out[0]!.positiveStyles.join(" ")).not.toMatch(/(?<![a-z])male lead vocal/i);
    expect(out[0]!.positiveStyles.join(" ")).toMatch(/female lead vocal/i);
    expect(out[0]!.negativeStyles.join(" ")).toMatch(/male lead vocal/i);
  });

  it("removes the sung lines when the host asked for no vocals", () => {
    const out = applyConstraints(
      [chunk()],
      hardConstraints(brief({ voice: "instrumental" })),
    );
    expect(out[0]!.text).not.toMatch(/bonfire/);
    expect(out[0]!.text).toMatch(/\[Verse 1\]/);
    expect(out[0]!.text).toMatch(/Instrumental/);
  });

  it("keeps section timings untouched", () => {
    const out = applyConstraints([chunk({ durationMs: 42000 })], hardConstraints(brief()));
    expect(out[0]!.durationMs).toBe(42000);
  });
});

describe("verifyPlan", () => {
  it("flags a plan that asks for the opposite voice", () => {
    const checks = hardConstraints(brief());
    const verdict = verifyPlan([chunk({ positiveStyles: ["male lead vocal"] })], checks);
    expect(verdict.deviations.map((d) => d.id)).toContain("voice");
    expect(verdict.deviations[0]!.chosen).toBe("female lead");
  });

  it("passes once the constraints have been applied", () => {
    const checks = hardConstraints(brief());
    const fixed = applyConstraints([chunk({ positiveStyles: ["male lead vocal"] })], checks);
    const verdict = verifyPlan(fixed, checks);
    expect(verdict.deviations).toHaveLength(0);
    expect(verdict.honoured).toContain("voice");
  });

  it("treats any remaining sung line as an instrumental deviation", () => {
    const checks = hardConstraints(brief({ voice: "instrumental" }));
    const verdict = verifyPlan([chunk()], checks);
    expect(verdict.deviations.map((d) => d.id)).toContain("voice");
  });

  it("passes an instrumental plan that has no lyric lines left", () => {
    const checks = hardConstraints(brief({ voice: "instrumental" }));
    const verdict = verifyPlan(applyConstraints([chunk()], checks), checks);
    expect(verdict.deviations).toHaveLength(0);
  });

  it("reports an unverifiable control as asserted, never as honoured", () => {
    const checks = hardConstraints(brief());
    const verdict = verifyPlan(applyConstraints([chunk()], checks), checks);
    expect(verdict.asserted).toContain("tempo");
    expect(verdict.honoured).not.toContain("tempo");
  });

  it("confirms an instrument the plan actually names", () => {
    const checks = hardConstraints(brief({ instruments: ["hammond organ"] }));
    const verdict = verifyPlan(
      [chunk({ positiveStyles: ["soul", "hammond organ"] })],
      checks,
    );
    expect(verdict.honoured).toContain("instrument:hammond organ");
  });
});

describe("settingsUsed", () => {
  it("gives one readable row per control", () => {
    const rows = settingsUsed(hardConstraints(brief()));
    expect(rows.some((r) => r.chosen === "female lead" && r.verifiable)).toBe(true);
    expect(rows.every((r) => r.label && r.direction)).toBe(true);
  });
});
