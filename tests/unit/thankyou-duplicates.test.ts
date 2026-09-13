import { describe, expect, it } from "vitest";
import { findDuplicateThankYouCardIds, type DedupeCard } from "@/lib/thankyou-duplicates";

const base: DedupeCard = {
  id: "a",
  message: "Thank you for coming",
  signOff: "Chris",
  channel: "email",
  design: "ivory",
  recipientIds: ["g1", "g2"],
  createdAt: "2026-09-01T10:00:00.000Z",
};

describe("duplicate thank-you drafts", () => {
  it("keeps one copy of an identical unsent note and drops the rest", () => {
    const cards: DedupeCard[] = [
      { ...base, id: "old", createdAt: "2026-09-01T10:00:00.000Z" },
      { ...base, id: "mid", createdAt: "2026-09-01T11:00:00.000Z" },
      { ...base, id: "new", createdAt: "2026-09-01T12:00:00.000Z" },
    ];
    expect(findDuplicateThankYouCardIds(cards).sort()).toEqual(["mid", "old"]);
  });

  it("prefers the scheduled copy as the keeper", () => {
    const cards: DedupeCard[] = [
      { ...base, id: "plain", createdAt: "2026-09-02T10:00:00.000Z" },
      { ...base, id: "sched", createdAt: "2026-09-01T10:00:00.000Z", scheduledFor: "2026-09-10T18:00:00.000Z" },
    ];
    expect(findDuplicateThankYouCardIds(cards)).toEqual(["plain"]);
  });

  it("never touches sent cards", () => {
    const cards: DedupeCard[] = [
      { ...base, id: "sent1", sentAt: "2026-09-01T12:00:00.000Z" },
      { ...base, id: "sent2", autoSentAt: "2026-09-01T13:00:00.000Z" },
    ];
    expect(findDuplicateThankYouCardIds(cards)).toEqual([]);
  });

  it("treats different wording, sign-off or recipients as separate notes", () => {
    const cards: DedupeCard[] = [
      { ...base, id: "a" },
      { ...base, id: "b", message: "Different words" },
      { ...base, id: "c", signOff: "Someone else" },
      { ...base, id: "d", recipientIds: ["g1"] },
    ];
    expect(findDuplicateThankYouCardIds(cards)).toEqual([]);
  });
});
