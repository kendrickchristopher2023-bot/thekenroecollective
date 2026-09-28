import { describe, it, expect } from "vitest";
import { EVENT_THEMES, THEME_TAGS, getTheme, themesByTag } from "@/lib/event-themes";
import { EVENT_FRAMES, getFrame } from "@/lib/event-frames";

describe("event themes", () => {
  it("has unique ids and labels", () => {
    const ids = EVENT_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = EVENT_THEMES.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("every theme points at a real frame style", () => {
    const frameIds = new Set(EVENT_FRAMES.map((f) => f.id));
    for (const t of EVENT_THEMES) {
      expect(frameIds.has(t.frame), `${t.id} -> ${t.frame}`).toBe(true);
      expect(getFrame(t.frame).id).toBe(t.frame);
    }
  });

  it("every theme has a hex accent and at least one known tag", () => {
    for (const t of EVENT_THEMES) {
      expect(t.accent, t.id).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.tags.length, t.id).toBeGreaterThan(0);
      for (const tag of t.tags) expect(THEME_TAGS).toContain(tag);
    }
  });

  it("filters by tag and looks up by id", () => {
    expect(themesByTag()).toHaveLength(EVENT_THEMES.length);
    const tag = EVENT_THEMES[0]!.tags[0]!;
    expect(themesByTag(tag).every((t) => t.tags.includes(tag))).toBe(true);
    expect(getTheme(EVENT_THEMES[0]!.id)?.id).toBe(EVENT_THEMES[0]!.id);
    expect(getTheme("nope")).toBeUndefined();
    expect(getTheme(null)).toBeUndefined();
  });
});
