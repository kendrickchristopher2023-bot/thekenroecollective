import { describe, expect, it } from "vitest";
import {
  letterWordBudget,
  possibleInventions,
  printableLetter,
  speechText,
  spokenSeconds,
} from "@/lib/studio-letter";

describe("letters", () => {
  it("budgets words at the measured 165 a minute", () => {
    expect(letterWordBudget(60, "natural")).toBe(165);
  });

  it("times a reading including breathing room", () => {
    const text = "one two three four five\n\nsix seven eight nine ten";
    const flat = "one two three four five six seven eight nine ten";
    expect(spokenSeconds(text, "natural")).toBeGreaterThan(spokenSeconds(flat, "natural"));
  });

  it("flags a name and a date the writer never gave us", () => {
    const supplied = "for my aunt rose, she taught me to drive";
    const letter = "You taught me to drive with Marcus in 1974.";
    const flagged = possibleInventions(letter, supplied);
    expect(flagged).toContain("Marcus");
    expect(flagged).toContain("1974");
  });

  it("does not flag what the writer supplied", () => {
    expect(possibleInventions("We miss you, Rose.", "rose")).toEqual([]);
  });

  it("adds breathing room between paragraphs without reading tags aloud", () => {
    const out = speechText("first line\n\nsecond line", {
      pace: "natural",
      paragraphPause: 2,
      emphasis: [],
    });
    expect(out).not.toMatch(/[<\[]/);
    expect(out).toContain("…");
  });

  it("prints the letter as a keepsake", () => {
    const printed = printableLetter({
      title: "For Rose",
      letter: "We still set her a place.",
      honoree: "Rose",
      fromName: "Chris",
    });
    expect(printed).toContain("For Rose");
    expect(printed).toContain("— Chris");
  });
});
