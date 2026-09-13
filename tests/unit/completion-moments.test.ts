import { describe, it, expect } from "vitest";
import {
  BRING_MOMENT_MIN_ITEMS,
  buildBringSheetMoment,
  buildEventReadyMoment,
  isMomentDismissActive,
  MOMENT_DISMISS_TTL_MS,
  momentDismissValue,
  momentSeenKey,
  shouldShowUpgrade,
} from "@/lib/completion-moments";

const totals = (items: number) => ({
  items,
  slotsNeeded: items * 2,
  claimed: items,
  openSlots: items,
  people: items,
});

describe("completion moments", () => {
  it("stays quiet until the list is real", () => {
    expect(buildBringSheetMoment(totals(BRING_MOMENT_MIN_ITEMS - 1))).toBeNull();
    expect(buildBringSheetMoment(totals(BRING_MOMENT_MIN_ITEMS))).not.toBeNull();
  });

  it("puts proof of the work in the stats", () => {
    const m = buildBringSheetMoment(totals(6), "Backyard BBQ")!;
    expect(m.title).toContain("Backyard BBQ");
    expect(m.stats.map((s) => s.value)).toEqual(["6", "6/12", "6", "6"]);
    expect(m.youHave.length).toBeGreaterThan(0);
    expect(m.unlocks.length).toBeGreaterThan(0);
  });

  it("never upsells owners or people already on the tier", () => {
    expect(shouldShowUpgrade("postcard", "host")).toBe(true);
    expect(shouldShowUpgrade("host", "host")).toBe(false);
    expect(shouldShowUpgrade("atelier", "host")).toBe(false);
    expect(shouldShowUpgrade("postcard", "host", true)).toBe(false);
    expect(shouldShowUpgrade(null, "host")).toBe(false);
  });

  it("targets the tier that fits the guest list", () => {
    const facts = {
      guests: 20,
      confirmed: 5,
      hasPhoto: true,
      registryLinks: 0,
      remindersSet: 2,
      bringItems: 3,
    };
    expect(buildEventReadyMoment(facts).targetTier).toBe("whisper");
    expect(buildEventReadyMoment({ ...facts, guests: 200 }).targetTier).toBe("host");
    expect(buildEventReadyMoment({ ...facts, guests: 200 }).unlocks.join(" ")).toContain("750");
  });

  it("keys seen-state per moment and event", () => {
    expect(momentSeenKey("bring-sheet-ready", "evt1")).toBe("kc:moment:bring-sheet-ready:evt1");
  });
});

describe("moment dismissal expiry", () => {
  it("treats legacy permanent dismissals as expired", () => {
    expect(isMomentDismissActive("1")).toBe(false);
    expect(isMomentDismissActive(null)).toBe(false);
  });

  it("suppresses for the TTL window then reappears", () => {
    const now = 1_700_000_000_000;
    const raw = momentDismissValue(now);
    expect(isMomentDismissActive(raw, now + 1000)).toBe(true);
    expect(isMomentDismissActive(raw, now + MOMENT_DISMISS_TTL_MS - 1)).toBe(true);
    expect(isMomentDismissActive(raw, now + MOMENT_DISMISS_TTL_MS)).toBe(false);
  });

  it("ignores garbage and future timestamps", () => {
    expect(isMomentDismissActive("nope")).toBe(false);
    expect(isMomentDismissActive(momentDismissValue(Date.now() + 60_000))).toBe(false);
  });
});
