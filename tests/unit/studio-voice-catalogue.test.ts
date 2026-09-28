import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  ACCENTS,
  STUDIO_VOICES,
  recommendedVoice,
  samplePath,
  studioVoiceId,
  voicesFor,
} from "@/lib/studio-voices";
import { speechText } from "@/lib/studio-letter";

describe("voice catalogue", () => {
  it("has a pre-rendered sample file for every voice", () => {
    for (const v of STUDIO_VOICES) {
      expect(existsSync(`public${samplePath(v)}`), v.label).toBe(true);
    }
  });

  it("offers Black American voices, women and men both", () => {
    const black = STUDIO_VOICES.filter((v) => v.accent === "black-american");
    expect(black.filter((v) => v.gender === "woman").length).toBeGreaterThanOrEqual(3);
    expect(black.filter((v) => v.gender === "man").length).toBeGreaterThanOrEqual(3);
  });

  it("offers a younger voice instead of a child voice", () => {
    expect(voicesFor({ gender: "younger" }).length).toBeGreaterThan(2);
    expect(STUDIO_VOICES.some((v) => /child|kid/i.test(v.label))).toBe(false);
  });

  it("only lists an accent it actually has a voice for", () => {
    for (const a of ACCENTS) {
      expect(voicesFor({ lang: a.lang, accent: a.key }).length, a.label).toBeGreaterThan(0);
    }
  });

  it("reads another language with a native voice", () => {
    const es = voicesFor({ lang: "es" });
    expect(es.length).toBeGreaterThan(0);
    expect(es.every((v) => v.lang === "es")).toBe(true);
    expect(recommendedVoice("memorial", "es")).toBe(es[0]!.id);
  });

  it("refuses any voice that is not on the list", () => {
    expect(studioVoiceId("some-cloned-voice-id")).toBe(recommendedVoice("memorial", "en"));
  });

  it("speaks the name the way it is said, without changing the letter", () => {
    const spoken = speechText("We miss you, Anisa.", {
      pace: "natural",
      paragraphPause: 1,
      emphasis: [],
      honoree: "Anisa",
      sayName: "Ah-NEE-sah",
    });
    expect(spoken).toContain("Ah-NEE-sah");
    expect(spoken).not.toContain("Anisa");
  });
});
