import { describe, expect, it } from "vitest";

import {
  pruneShelf,
  sampleAgeLabel,
  samplePlayable,
  SHELF_MAX_AGE_MS,
  type ShelfSample,
} from "@/lib/sample-shelf";

function make(id: string, createdAt: number): ShelfSample {
  return {
    id,
    eventId: "e1",
    createdAt,
    seconds: 10,
    prompt: `prompt ${id}`,
    settings: {},
    title: "",
    artist: "",
    contentType: "audio/mpeg",
    audio: new Blob(["x"]),
  };
}

describe("sample shelf", () => {
  const now = 1_700_000_000_000;

  it("keeps the newest samples first so the last take is on top", () => {
    const { keep } = pruneShelf([make("a", now - 5000), make("b", now - 1000)], now);
    expect(keep.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("drops the oldest once the shelf is full", () => {
    const rows = Array.from({ length: 5 }, (_, i) => make(`s${i}`, now - i * 1000));
    const { keep, drop } = pruneShelf(rows, now, 3);
    expect(keep.map((s) => s.id)).toEqual(["s0", "s1", "s2"]);
    expect(drop.map((s) => s.id)).toEqual(["s3", "s4"]);
  });

  it("clears out stale samples, since an old audition is just clutter", () => {
    const { keep, drop } = pruneShelf([make("old", now - SHELF_MAX_AGE_MS - 1)], now);
    expect(keep).toEqual([]);
    expect(drop.map((s) => s.id)).toEqual(["old"]);
  });

  it("says how long ago a sample was made in plain words", () => {
    expect(sampleAgeLabel(now, now)).toBe("just now");
    expect(sampleAgeLabel(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(sampleAgeLabel(now - 2 * 3_600_000, now)).toBe("2 hours ago");
    expect(sampleAgeLabel(now - 26 * 3_600_000, now)).toBe("yesterday");
  });
});

describe("shelf entries whose audio is gone", () => {
  const now = 1_700_000_000_000;

  it("says an entry is not playable when the browser dropped its audio", () => {
    const ok = make("ok", now);
    const gone = { ...make("gone", now), audio: undefined as unknown as Blob };
    const empty = { ...make("empty", now), audio: new Blob([]) };
    expect(samplePlayable(ok)).toBe(true);
    expect(samplePlayable(gone)).toBe(false);
    expect(samplePlayable(empty)).toBe(false);
  });

  it("collapses repeats of the same take, keeping the one that still plays", () => {
    const newerEmpty = { ...make("newer", now), prompt: "same", audio: new Blob([]) };
    const olderGood = { ...make("older", now - 1000), prompt: "same" };
    const { keep, drop } = pruneShelf([newerEmpty, olderGood], now);
    expect(keep.map((s) => s.id)).toEqual(["older"]);
    expect(drop.map((s) => s.id)).toEqual(["newer"]);
  });

  it("keeps different takes even when they were made the same day", () => {
    const { keep } = pruneShelf([make("a", now), make("b", now - 10)], now);
    expect(keep).toHaveLength(2);
  });
});
