import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sanitizePublicEvent } from "@/lib/public-event-sanitize";
import { SHARE_PRIVATE_FIELDS, sanitizePublicShareRow } from "@/lib/public-share-sanitize";

/**
 * STRUCTURAL GUARD for the public-payload PII exposure.
 *
 * Invitation, gift, potluck, wishes, photo-wall and check-in links are designed
 * to be forwarded, so their server responses are effectively public. They once
 * carried every guest's email, phone, address, dietary and accessibility notes,
 * shirt size and payment record, both hosts' personal contact details, the
 * host-only thank-you drafts, and the door-staff share token.
 *
 * These tests are deliberately shaped around the *payload*, not the rendering:
 * the leak was never visible on screen. A new feature that widens a public
 * response, or a new public RPC consumer that forgets the sanitizer, fails here.
 */

const ROOT = join(import.meta.dirname ?? __dirname, "..", "..");

/** Any of these appearing anywhere in a public payload is a leak. */
const FORBIDDEN_KEYS = [
  "email",
  "phone",
  "address",
  "dietary",
  "accessibility",
  "accessibilityNotes",
  "shirtSize",
  "extraShirts",
  "payment",
  "paid",
  "paidAmount",
  "invitedAt",
  "lastReminderAt",
  "reminderCount",
  "preferredLanguage",
  "shareToken",
  "_ownerUserId",
  "thankYouDraft",
  "thankYouCards",
  "reminderLog",
];

/** Event-level keys that legitimately hold host-chosen public content. */
const ALLOWED_EVENT_KEYS = new Set([
  "address", // the venue address IS the invitation
  "payVenmo",
  "payCashapp",
  "payZelle",
  "payPaypal",
]);

function collectLeaks(value: unknown, path = "", depth = 0): string[] {
  if (depth > 8 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((v, i) => collectLeaks(v, `${path}[${i}]`, depth + 1));
  const out: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    const topLevel = depth === 0;
    if (FORBIDDEN_KEYS.includes(key) && !(topLevel && ALLOWED_EVENT_KEYS.has(key))) {
      out.push(here);
    }
    out.push(...collectLeaks(child, here, depth + 1));
  }
  return out;
}

/** A host's working blob with PII in every place it actually lives. */
const rawEvent = {
  id: "evt1",
  title: "Kendrick Reunion",
  address: "The Grand Hall, 4 Vine St",
  shareToken: "door-token-abc12345",
  _ownerUserId: "11111111-1111-1111-1111-111111111111",
  payVenmo: "@kendricks",
  reminderLog: [{ sentAt: "2026-08-01T00:00:00Z", presetId: "day-of" }],
  thankYouDraft: { message: "internal", signOff: "Love, T" },
  thankYouCards: [{ guestId: "g1" }],
  affiliateClicks: [{ url: "x" }],
  reminderTimes: { "day-of": "09:00" },
  reminderPresetIds: ["day-of"],
  rsvpReminderOffsetDays: [3],
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
      children: 1,
      email: "wren@example.com",
      phone: "+14155550111",
      address: "12 Elm St",
      dietary: "no shellfish",
      accessibilityNotes: "step-free",
      shirtSize: "L",
      extraShirts: [{ size: "M", qty: 2 }],
      invitedAt: "2026-07-01T00:00:00Z",
      lastReminderAt: "2026-08-01T00:00:00Z",
      reminderCount: 2,
      preferredLanguage: "es",
      payment: { status: "paid", paidAmount: 40, history: [{ amount: 40 }] },
      plusOnes: [{ name: "Ada", dietary: "vegan", shirtSize: "S", isChild: false }],
    },
    { id: "g2", name: "Sam Kendrick", status: "pending", email: "sam@example.com", phone: "+1415" },
  ],
  checkIns: [{ guestId: "g1", at: "2026-08-29T18:00:00Z", heads: 3 }],
};

describe("public event payload carries no personal data", () => {
  it("has zero forbidden fields anywhere in the anonymous payload", () => {
    const out = sanitizePublicEvent(rawEvent, null, null)!;
    // Host contact survives only where that host opted in, so it is checked
    // separately; everything else must be gone at any depth.
    const hostsRemoved = { ...out, hosts: undefined };
    expect(collectLeaks(hostsRemoved)).toEqual([]);
  });

  it("counts down to zero guest contact fields (was 6 emails, 6 phones)", () => {
    const out = sanitizePublicEvent(rawEvent, null, null)!;
    const guests = out.guests as Record<string, unknown>[];
    const emails = guests.filter((g) => g.email !== undefined).length;
    const phones = guests.filter((g) => g.phone !== undefined).length;
    expect([emails, phones]).toEqual([0, 0]);
    expect(guests).toHaveLength(2);
  });

  it("never leaks the door-staff share token to a caller without it", () => {
    expect(sanitizePublicEvent(rawEvent, null, null)!.shareToken).toBeUndefined();
    expect(sanitizePublicEvent(rawEvent, null, "wrong-token")!.shareToken).toBeUndefined();
    expect(sanitizePublicEvent(rawEvent, null, "door-token-abc12345")!.shareToken).toBe(
      "door-token-abc12345",
    );
  });

  it("keeps the invitation itself intact", () => {
    const out = sanitizePublicEvent(rawEvent, null, null)!;
    expect(out.title).toBe("Kendrick Reunion");
    expect(out.address).toBe("The Grand Hall, 4 Vine St");
    expect(out.payVenmo).toBe("@kendricks");
    expect(out.checkIns).toBeDefined();
    const guests = out.guests as Record<string, unknown>[];
    expect(guests[0]).toMatchObject({ status: "yes", adults: 2, children: 1 });
    expect(guests[0]!.name).toBeUndefined();
    expect((guests[0]!.plusOnes as Record<string, unknown>[])[0]).toEqual({
      isChild: false,
    });

  });

  it("retains the trusted demo marker only as internal presentation state", () => {
    const out = sanitizePublicEvent({ ...rawEvent, isDemoInvitation: true }, null, null)!;
    expect(out._isDemo).toBe(true);
    expect(out.isDemoInvitation).toBeUndefined();
  });
});

describe("an identified guest still gets their own details", () => {
  const out = sanitizePublicEvent(rawEvent, "g1", null)!;
  const [me, other] = out.guests as Record<string, unknown>[];

  it("returns their own contact, needs, sizes and payment record", () => {
    expect(me!.email).toBe("wren@example.com");
    expect(me!.phone).toBe("+14155550111");
    expect(me!.dietary).toBe("no shellfish");
    expect(me!.accessibilityNotes).toBe("step-free");
    expect(me!.shirtSize).toBe("L");
    expect(me!.payment).toBeDefined();
  });

  it("returns their own RSVP and named plus-ones in full", () => {
    expect(me!.status).toBe("yes");
    expect(me!.adults).toBe(2);
    expect((me!.plusOnes as Record<string, unknown>[])[0]).toMatchObject({
      name: "Ada",
      dietary: "vegan",
      shirtSize: "S",
    });
  });

  it("still gives them nobody else's details, and no staff token", () => {
    expect(other!.email).toBeUndefined();
    expect(other!.phone).toBeUndefined();
    expect(out.shareToken).toBeUndefined();
    expect(out.thankYouDraft).toBeUndefined();
  });
});

describe("public share links (designs, AI packages)", () => {
  it("strips the owner's account id and the token itself", () => {
    const row = {
      id: "d1",
      title: "Save the date",
      content: { layers: [] },
      user_id: "22222222-2222-2222-2222-222222222222",
      share_token: "tok_abc",
      event_id: "evt1",
      project_id: "prj1",
      environment: "production",
    };
    const out = sanitizePublicShareRow(row) as Record<string, unknown>;
    for (const key of SHARE_PRIVATE_FIELDS) expect(out[key], key).toBeUndefined();
    expect(out.title).toBe("Save the date");
    expect(out.content).toBeDefined();
  });
});

describe("every public consumer of the event RPCs goes through the sanitizer", () => {
  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) sourceFiles(full, out);
      else if (/\.(ts|tsx)$/.test(entry.name) && entry.name !== "types.ts") out.push(full);
    }
    return out;
  }

  /**
   * Files that read a public event RPC but never return the blob to the
   * browser. Each is reviewed: they use the raw data server-side only.
   */
  const REVIEWED_SERVER_ONLY = new Set([
    "src/lib/rsvp-quick.server.ts", // builds a confirmation sentence
    "src/lib/announcements.functions.ts", // resolves slug -> event id
    // matches one guest across an occasion's gatherings; returns only that
    // guest's own name plus {eventId, guestId, status}, never the blob
    "src/lib/series.functions.ts",

  ]);

  it("no file reads get_public_event_* without sanitizing or being reviewed", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(ROOT, "src"))) {
      const rel = file.replace(ROOT + "/", "");
      const text = readFileSync(file, "utf8");
      if (!/get_public_event_by_(id|slug)/.test(text)) continue;
      if (REVIEWED_SERVER_ONLY.has(rel)) continue;
      if (text.includes("sanitizePublicEvent")) continue;
      offenders.push(rel);
    }
    expect(
      offenders,
      "A module reads the full public event blob without sanitizePublicEvent. That blob holds every guest's contact details, dietary and accessibility notes, payment record and the door-staff share token. Sanitize it, or add the file to REVIEWED_SERVER_ONLY if the blob never reaches the browser.",
    ).toEqual([]);
  });

  it("share-token RPC consumers strip the owner id", () => {
    for (const file of sourceFiles(join(ROOT, "src"))) {
      const text = readFileSync(file, "utf8");
      if (!/rpc\(\s*["']get_shared_(design|ai_package)["']/.test(text)) continue;
      expect(text, `${file} must call sanitizePublicShareRow`).toContain("sanitizePublicShareRow");
    }
  });
});
