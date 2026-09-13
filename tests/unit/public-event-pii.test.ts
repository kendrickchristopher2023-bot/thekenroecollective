import { describe, expect, it } from "vitest";
import { publicGuest, publicHost, sanitizePublicEvent } from "@/lib/public-event-sanitize";

const raw = {
  id: "evt1",
  title: "Kendrick Reunion",
  hosts: [
    { id: "h1", name: "Tenia", email: "tenia@example.com", phone: "+14155550101", showContact: true },
    { id: "h2", name: "Marcus", email: "marcus@example.com", phone: "+14155550102" },
  ],
  guests: [
    {
      id: "g1",
      name: "Wren Kendrick",
      status: "yes",
      adults: 2,
      email: "wren@example.com",
      phone: "+14155550111",
      address: "12 Elm St",
      dietary: "no shellfish",
      accessibilityNotes: "step-free",
      shirtSize: "L",
      paid: 40,
      plusOnes: [{ name: "Ada", dietary: "vegan", shirtSize: "S" }],
    },
    { id: "g2", name: "Sam Kendrick", status: "pending", email: "sam@example.com" },
  ],
  thankYouDraft: { message: "internal" },
  thankYouCards: [{ guestId: "g1" }],
  affiliateClicks: [{ url: "x" }],
};

describe("public invitation payload", () => {
  it("strips every guest's contact and sensitive detail", () => {
    const out = sanitizePublicEvent(raw)!;
    const guests = out.guests as Record<string, unknown>[];
    for (const g of guests) {
      for (const key of ["email", "phone", "address", "dietary", "accessibilityNotes", "shirtSize", "paid"]) {
        expect(g[key], `${g.name} leaked ${key}`).toBeUndefined();
      }
    }
    expect(guests[0]!.status).toBe("yes");
    // Names are not guest-facing on a forwardable link.
    expect(guests[0]!.name).toBeUndefined();
    expect((guests[0]!.plusOnes as Record<string, unknown>[])[0]).toEqual({});
  });

  it("returns the identified guest's own record in full, and nobody else's", () => {
    const out = sanitizePublicEvent(raw, "g1")!;
    const [me, other] = out.guests as Record<string, unknown>[];
    expect(me!.email).toBe("wren@example.com");
    expect(me!.dietary).toBe("no shellfish");
    expect(other!.email).toBeUndefined();
  });

  it("shares host contact details only when that host opted in", () => {
    const hosts = sanitizePublicEvent(raw)!.hosts as Record<string, unknown>[];
    expect(hosts[0]!.email).toBe("tenia@example.com");
    expect(hosts[1]!.email).toBeUndefined();
    expect(hosts[1]!.phone).toBeUndefined();
    expect(hosts[1]!.name).toBe("Marcus");
  });

  it("drops host-only working data", () => {
    const out = sanitizePublicEvent(raw)!;
    expect(out.thankYouDraft).toBeUndefined();
    expect(out.thankYouCards).toBeUndefined();
    expect(out.affiliateClicks).toBeUndefined();
  });

  it("keeps names for door staff holding the matching token, and for an open guest list", () => {
    const withToken = sanitizePublicEvent({ ...raw, shareToken: "tok" }, null, "tok")!;
    expect((withToken.guests as Record<string, unknown>[])[1]!.name).toBe("Sam Kendrick");

    const open = sanitizePublicEvent({ ...raw, openGuestList: true })!;
    expect((open.guests as Record<string, unknown>[])[1]!.name).toBe("Sam Kendrick");

    const closed = sanitizePublicEvent({ ...raw, shareToken: "tok" }, null, "wrong")!;
    expect((closed.guests as Record<string, unknown>[])[1]!.name).toBeUndefined();
  });

  it("still returns the identified guest's own name", () => {
    const out = sanitizePublicEvent(raw, "g1")!;
    expect((out.guests as Record<string, unknown>[])[0]!.name).toBe("Wren Kendrick");
  });

  it("has no leaky helpers", () => {
    expect(publicGuest({ id: "x", email: "a@b.c" })).toEqual({ id: "x" });
    expect(publicHost({ name: "n", phone: "1" })).toEqual({ name: "n" });
  });

  it("returns null for a missing event", () => {
    expect(sanitizePublicEvent(null)).toBeNull();
  });
});
