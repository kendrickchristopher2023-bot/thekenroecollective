import { describe, expect, it } from "vitest";
import type { PlanChunk } from "@/lib/studio-words";
import {
  addedSectionCount,
  defaultGrowMode,
  extendChunks,
  isAudioRef,
  lengthCharge,
  lengthPromise,
  relengthPlan,
  trimPlan,
} from "@/lib/studio-length";

const chunk = (text: string, ms: number): PlanChunk => ({
  text,
  durationMs: ms,
  positiveStyles: ["warm acoustic"],
  negativeStyles: [],
});

const sixty: PlanChunk[] = [
  chunk("[Verse 1]\nwe lit the fire at dusk", 20000),
  chunk("[Chorus]\nnobody went home hungry", 20000),
  chunk("[Verse 2]\nthe chili went round twice", 20000),
];

describe("what a length change costs", () => {
  it("charges only the difference when upgrading a paid piece", () => {
    const c = lengthCharge({ fromSeconds: 60, toSeconds: 120, paidCents: 699 });
    expect(c.kind).toBe("difference");
    expect(c.amountCents).toBe(300);
    expect(c.fullCents).toBe(999);
    expect(c.label).toBe("Pay the difference, $3.00");
  });

  it("charges the full tier when the original was a free audition", () => {
    const c = lengthCharge({ fromSeconds: 30, toSeconds: 60, paidCents: 0 });
    expect(c.amountCents).toBe(699);
    expect(c.label).toBe("Compose, $6.99");
  });

  it("never charges for shortening", () => {
    const c = lengthCharge({ fromSeconds: 240, toSeconds: 60, paidCents: 1499 });
    expect(c.kind).toBe("free");
    expect(c.amountCents).toBe(0);
  });

  it("never charges twice inside a tier already paid for", () => {
    expect(lengthCharge({ fromSeconds: 100, toSeconds: 120, paidCents: 999 }).amountCents).toBe(0);
  });
});

describe("growing the plan", () => {
  it("keeps every approved section untouched and adds new time on the end", () => {
    const grown = relengthPlan({
      chunks: sixty,
      toSeconds: 120,
      mode: "verse",
      newVerse: "[Verse 3]\nthe smoke stayed in our coats",
    });
    expect(grown.slice(0, 3)).toEqual(sixty);
    expect(grown.reduce((n, c) => n + c.durationMs, 0)).toBe(120000);
    expect(grown[3]!.text).toContain("smoke stayed in our coats");
    expect(addedSectionCount(sixty, grown)).toBeGreaterThan(0);
  });

  it("honours a lock by growing musically instead of writing words", () => {
    const grown = relengthPlan({
      chunks: sixty,
      toSeconds: 120,
      mode: "verse",
      lockedLyrics: true,
      newVerse: "[Verse 3]\nwords that must never appear",
    });
    const added = grown.slice(3).map((c) => c.text).join("\n");
    expect(added).not.toContain("must never appear");
    expect(added.toLowerCase()).toContain("no vocals");
    expect(grown.slice(0, 3)).toEqual(sixty);
  });

  it("repeats the chorus character for character when asked", () => {
    const grown = relengthPlan({ chunks: sixty, toSeconds: 90, mode: "chorus" });
    expect(grown[3]!.text).toBe(sixty[1]!.text);
  });

  it("gives an instrumental piece music, never lyrics", () => {
    const grown = relengthPlan({
      chunks: [chunk("[Acoustic Intro]\n[Instrumental, no vocals]", 30000)],
      toSeconds: 60,
      mode: "verse",
      instrumental: true,
      newVerse: "a lyric that should not appear",
    });
    expect(grown.map((c) => c.text).join("\n")).not.toContain("should not appear");
  });

  it("shortens by dropping whole sections, never half a line", () => {
    const short = trimPlan(sixty, 40000);
    expect(short).toHaveLength(2);
    expect(short[1]!.text).toBe(sixty[1]!.text);
    expect(short.reduce((n, c) => n + c.durationMs, 0)).toBe(40000);
  });

  it("respects the provider's 3s to 120s section limits", () => {
    const grown = relengthPlan({ chunks: sixty, toSeconds: 240, mode: "instrumental" });
    for (const c of grown) {
      expect(c.durationMs).toBeGreaterThanOrEqual(3000);
      expect(c.durationMs).toBeLessThanOrEqual(120000);
    }
  });
});

describe("the extension request", () => {
  it("keeps the original recording as a reference and only generates the new time", () => {
    const grown = relengthPlan({ chunks: sixty, toSeconds: 120, mode: "instrumental" });
    const chunks = extendChunks({
      songId: "song_abc",
      originalSeconds: 60,
      grown,
      addedCount: addedSectionCount(sixty, grown),
    });
    expect(isAudioRef(chunks[0]!)).toBe(true);
    expect(chunks[0]).toMatchObject({ songId: "song_abc", startMs: 0, endMs: 60000 });
    expect(chunks.slice(1).some((c) => isAudioRef(c))).toBe(false);
  });
});

describe("what the host is told before paying", () => {
  it("promises an identical recording only when extension is genuinely available", () => {
    expect(lengthPromise("extend", 120)).toContain("kept exactly as it is");
    expect(lengthPromise("rerender", 120)).toContain("not be the same recording");
  });

  it("sends slideshow music down the instrumental route by default", () => {
    expect(defaultGrowMode({ underSlideshow: true })).toBe("instrumental");
    expect(defaultGrowMode({})).toBe("verse");
  });
});
