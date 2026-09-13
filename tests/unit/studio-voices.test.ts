import { describe, expect, it } from "vitest";
import { DEFAULT_BRIEF_EXTRAS, type StudioBrief } from "@/lib/studio-brief";
import {
  DEFAULT_SONG_SETTINGS,
  POEM_VOICES,
  VOICES,
  normaliseVoice,
} from "@/lib/wall-soundtrack";
import type { PlanChunk } from "@/lib/studio-words";
import { hardConstraints, verifyPlan } from "@/lib/studio-constraints";

const brief = (voice: string, over: Partial<StudioBrief> = {}): StudioBrief =>
  ({
    ...DEFAULT_SONG_SETTINGS,
    ...DEFAULT_BRIEF_EXTRAS,
    genre: "soul",
    mood: "joyful",
    voice,
    instruments: ["acoustic guitar"],
    ...over,
  }) as StudioBrief;

const chunk = (text: string, styles: string[] = []): PlanChunk => ({
  text,
  durationMs: 30000,
  positiveStyles: styles,
  negativeStyles: [],
});

const verdict = (voice: string, plan: PlanChunk[]) =>
  verifyPlan(plan, hardConstraints(brief(voice)));

describe("voice lists", () => {
  it("no longer offers the ambiguous options", () => {
    expect(VOICES).not.toContain("duet");
    expect(POEM_VOICES).not.toContain("two voices trading lines");
  });

  it("offers all three duet pairings and the children's section", () => {
    for (const v of ["duet, two women", "duet, two men", "duet, a woman and a man"]) {
      expect(VOICES).toContain(v);
    }
    for (const v of [
      "child lead voice",
      "two children singing",
      "a child and an adult together",
      "children's choir",
    ]) {
      expect(VOICES).toContain(v);
    }
    expect(POEM_VOICES).toContain("a child reading aloud");
  });

  it("reads the old bare values as the explicit ones", () => {
    expect(normaliseVoice("duet")).toBe("duet, a woman and a man");
    expect(normaliseVoice("two voices trading lines")).toBe("a woman and a man trading lines");
    expect(normaliseVoice("female lead")).toBe("female lead");
  });
});

describe("duet pairing guard", () => {
  it("states the pairing in the direction sent to the composer", () => {
    const women = hardConstraints(brief("duet, two women")).find((c) => c.id === "voice")!;
    expect(women.positives.join(" ")).toMatch(/two women/i);
    expect(women.negatives.join(" ")).toMatch(/male vocal|a man singing/i);
  });

  it("catches a two-women duet answered with a man", () => {
    const bad = verdict("duet, two women", [chunk("[Verse 1]\nline", ["a man singing lead"])]);
    expect(bad.deviations.map((d) => d.id)).toContain("voice");
  });

  it("catches a mixed duet answered with two men", () => {
    const bad = verdict("duet, a woman and a man", [chunk("[Verse 1]\nline", ["two men trading lines"])]);
    expect(bad.deviations.map((d) => d.id)).toContain("voice");
  });

  it("confirms a correct two-men duet", () => {
    const ok = verdict("duet, two men", [chunk("[Verse 1]\nline", ["duet of two men, two male lead vocals"])]);
    expect(ok.deviations).toHaveLength(0);
    expect(ok.honoured).toContain("voice");
  });
});

describe("children's voice guard", () => {
  it("catches a child lead answered with an adult vocal", () => {
    const bad = verdict("child lead voice", [chunk("[Verse 1]\nline", ["adult lead vocal"])]);
    expect(bad.deviations.map((d) => d.id)).toContain("voice");
  });

  it("confirms a correct child lead", () => {
    const ok = verdict("child lead voice", [chunk("[Verse 1]\nline", ["a single child singing lead"])]);
    expect(ok.deviations).toHaveLength(0);
    expect(ok.honoured).toContain("voice");
  });
});
