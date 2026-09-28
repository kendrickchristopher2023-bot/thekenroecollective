import { describe, expect, it } from "vitest";
import { screenTextRules, verdictFor } from "@/lib/music-safety";

describe("music safety screening", () => {
  it("refuses sexual content about a named person", () => {
    const hits = screenTextRules("A song about Adrian, make it sexy and talk about him naked");
    expect(hits).toContain("sexual_named_person");
    expect(verdictFor(hits).allowed).toBe(false);
  });

  it("refuses threats", () => {
    expect(screenTextRules("I'm going to kill him at the party")).toContain("threat");
  });

  it("refuses a damaging factual claim about a named person", () => {
    expect(screenTextRules("Everyone knows Dave is a cheater and he stole money")).toContain(
      "defamation",
    );
  });

  it("refuses a request to imitate a real recording artist", () => {
    expect(screenTextRules("Make it sound exactly like Beyonce singing")).toContain(
      "impersonation",
    );
  });

  it("refuses targeted humiliation", () => {
    expect(
      screenTextRules("Make fun of her the whole way through, she's pathetic"),
    ).toContain("harassment");
  });

  it("allows an ordinary heartfelt brief", () => {
    const hits = screenTextRules(
      "A song for Grandma Rose (ROHZ) turning 80, about her peach cobbler and the time the whole family sang on her porch. Soulful, joyful, one female lead.",
    );
    expect(hits).toEqual([]);
    expect(verdictFor(hits).allowed).toBe(true);
  });

  it("allows grief, faith and a glass of champagne", () => {
    expect(
      screenTextRules(
        "A gentle piece remembering Dad, we will raise a glass of champagne and thank God for him.",
      ),
    ).toEqual([]);
  });
});

describe("music safety: tribute language must not be refused", () => {
  const tributes = [
    "We had to bury him too soon, and this is for him.",
    "A piece about how much her mother's illness hurt her, and how she kept going.",
    "Dad was an addict but he beat it, and we are proud of him.",
    "Grandma was a drunk in her youth and she still raised five of us.",
    "She never called herself worthless, not once, no matter what they said.",
    "The naked truth is he loved us all more than he could say.",
    "A song that helps us burn down their walls of grief.",
  ];
  for (const text of tributes) {
    it(`allows: ${text.slice(0, 32)}...`, () => {
      expect(screenTextRules(text)).toEqual([]);
    });
  }
});
