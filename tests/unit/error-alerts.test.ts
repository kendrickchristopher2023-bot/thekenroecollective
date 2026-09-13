import { describe, expect, it } from "vitest";
import {
  digestAlert,
  groupErrors,
  isConnectionNoise,
  pageAlert,
  selectPageWorthy,
} from "@/lib/error-alerts";

const row = (over: Partial<Parameters<typeof groupErrors>[0][number]> = {}) => ({
  fingerprint: "fp-1",
  error_name: "TypeError",
  message: "Cannot read properties of undefined",
  route: "/events",
  source: "client",
  user_id: null as string | null,
  created_at: new Date().toISOString(),
  ...over,
});

describe("error alert grouping", () => {
  it("collapses the same fault and counts people", () => {
    const groups = groupErrors([
      row({ user_id: "a" }),
      row({ user_id: "a" }),
      row({ user_id: "b" }),
      row({ fingerprint: "fp-2", message: "other" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.count).toBe(3);
    expect(groups[0]!.people).toBe(2);
  });
});

describe("what pages the owner", () => {
  it("pages on five of the same fault in an hour", () => {
    const groups = groupErrors(Array.from({ length: 5 }, () => row()));
    expect(selectPageWorthy(groups)).toHaveLength(1);
    expect(pageAlert(groups[0]!).sms).toContain("Owner console");
  });

  it("pages on three different signed-in people even with few reports", () => {
    const groups = groupErrors([row({ user_id: "a" }), row({ user_id: "b" }), row({ user_id: "c" })]);
    expect(selectPageWorthy(groups)).toHaveLength(1);
  });

  it("stays quiet for one or two reports", () => {
    expect(selectPageWorthy(groupErrors([row(), row({ user_id: "a" })]))).toHaveLength(0);
  });

  it("never pages for dropped connections, however many", () => {
    const noisy = Array.from({ length: 40 }, (_, i) =>
      row({ message: "Failed to fetch", user_id: `u${i}` }),
    );
    expect(isConnectionNoise({ error_name: "TypeError", message: "Failed to fetch" })).toBe(true);
    expect(selectPageWorthy(groupErrors(noisy))).toHaveLength(0);
  });
});

describe("daily digest", () => {
  it("sends an all clear when there is nothing, so a quiet day is provable", () => {
    const summary = digestAlert([], "2026-09-05");
    expect(summary.title).toContain("all clear");
    expect(summary.lines.join(" ")).toContain("2026-09-05");
  });

  it("summarises without texting", () => {
    const summary = digestAlert(groupErrors([row(), row()]), "2026-09-05");
    expect(summary?.title).toContain("2 reports");
    expect(summary?.lines.join(" ")).toContain("/events");
  });
});
