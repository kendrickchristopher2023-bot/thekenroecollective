import { describe, expect, it } from "vitest";
import {
  capacityVerdict,
  normalizeParty,
  partyLabel,
  partyPhrase,
  requestOwed,
} from "@/lib/guest-request-review";

describe("join request party maths", () => {
  it("clamps party sizes", () => {
    expect(normalizeParty(undefined)).toBe(1);
    expect(normalizeParty(0)).toBe(1);
    expect(normalizeParty(2.7)).toBe(2);
    expect(normalizeParty(99)).toBe(20);
  });

  it("spells out the extra guests", () => {
    expect(partyPhrase(1)).toBe("");
    expect(partyPhrase(2)).toBe("+ 1 guest = 2 people");
    expect(partyPhrase(4)).toBe("+ 3 guests = 4 people");
    expect(partyLabel("Moses Little", 2)).toBe("Moses Little + 1 guest = 2 people");
    expect(partyLabel("Moses Little", 1)).toBe("Moses Little (1 person)");
  });

  it("prices the whole party, not just the requester", () => {
    expect(requestOwed({ paymentEnabled: false, paymentAmount: 25 }, 2)).toBe(0);
    expect(requestOwed({ paymentEnabled: true }, 2)).toBe(0);
    expect(requestOwed({ paymentEnabled: true, paymentAmount: 25 }, 2)).toBe(50);
    expect(requestOwed({ paymentEnabled: true, paymentAmount: 12.5 }, 3)).toBe(37.5);
  });
});

describe("join request capacity", () => {
  it("passes anything through when no cap is set", () => {
    expect(capacityVerdict({}, 500, 4).verdict).toBe("fits");
    expect(capacityVerdict({}, 500, 4).remaining).toBe(null);
  });

  it("fits only when every head in the party fits", () => {
    expect(capacityVerdict({ capacity: 10 }, 8, 2).verdict).toBe("fits");
    expect(capacityVerdict({ capacity: 10 }, 9, 2).verdict).toBe("over");
  });

  it("waitlists overflow when the host enabled a waitlist", () => {
    const c = capacityVerdict({ capacity: 10, waitlistEnabled: true }, 9, 2);
    expect(c.verdict).toBe("waitlist");
    expect(c.remaining).toBe(1);
    expect(c.heads).toBe(2);
  });
});
