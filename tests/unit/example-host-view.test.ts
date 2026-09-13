// The read-only host view of the showcase: what it shows, what it must never
// show, and that the page offers no way to act.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { clockLabel, EXAMPLE_NOTE, shapeExampleHostView } from "@/lib/example-host-view";
import type { KEvent } from "@/lib/events-store";

const event = {
  id: "showcase-wedding",
  title: "Amara & Elias",
  date: "2027-06-12T17:00",
  timezone: "America/New_York",
  venue: "The Orchard House",
  address: "12 Orchard Lane",
  capacity: 60,
  hosts: [
    { id: "h1", role: "Bride", name: "Amara Okafor", email: "amara@example.com", phone: "(555) 555-0101" },
    { id: "h2", role: "Groom", name: "Elias Brandt", email: "elias@example.com" },
  ],
  guests: [
    { id: "g1", name: "Nia Bell", status: "yes", email: "nia@example.com", phone: "(555) 555-0110", address: "1 Elm St", dietary: "vegetarian", plusOnes: [{ name: "Theo Bell" }], notes: "private" },
    { id: "g2", name: "Ravi Sen", status: "maybe", email: "ravi@example.com", children: 1 },
    { id: "g3", name: "Ida Lund", status: "no", email: "ida@example.com" },
    { id: "g4", name: "Kofi Mensah", status: "pending", email: "kofi@example.com" },
  ],
  seatingTables: [
    { id: "t1", label: "Table 1", shape: "round", capacity: 8, guestIds: ["g1", "g2"] },
    { id: "bar", label: "Bar", shape: "rect", capacity: 0, guestIds: [], kind: "element" },
  ],
  timelineBlocks: [
    { id: "b2", time: "18:30", title: "Dinner", durationMin: 90, owner: "Caterer" },
    { id: "b1", time: "17:00", title: "Ceremony", durationMin: 30 },
  ],
  songUrl: "https://example.com/song.mp3",
  songTitle: "The Long Table",
  voiceMessage: "https://example.com/note.mp3",
  thankYouDraft: "never shown",
} as unknown as KEvent;

describe("shapeExampleHostView", () => {
  const view = shapeExampleHostView(event, {
    bring: [{ id: "i1", name: "A salad", slotsNeeded: 2, claims: [{ name: "Nia", dish: "fennel" }] }],
    photos: [{ id: "p1", url: "https://example.com/p1.jpg", label: "Nia" }],
    wishes: 3,
    comments: 2,
  });

  it("uses the dashboard's own RSVP arithmetic", () => {
    expect(view.counts).toMatchObject({ invited: 4, yes: 1, maybe: 1, no: 1, pending: 1, dietary: 1 });
    // Nia + named plus-one Theo. A "maybe" counts no adult until it becomes a
    // yes (the dashboard's rule), but its child is still expected.
    expect(view.counts.adults).toBe(2);
    expect(view.counts.children).toBe(1);
  });

  it("keeps names, seats and dietary notes, and nothing private", () => {
    expect(view.guests.map((g) => g.name)).toEqual(["Nia Bell", "Ravi Sen", "Ida Lund", "Kofi Mensah"]);
    expect(view.guests[0]).toMatchObject({ table: "Table 1", dietary: "vegetarian", plusOnes: ["Theo Bell"], party: 2 });
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/@example\.com/);
    expect(json).not.toMatch(/555-01/);
    expect(json).not.toContain("1 Elm St");
    expect(json).not.toContain("private");
    expect(json).not.toContain("never shown");
  });

  it("leaves venue elements out of seating and sorts the run of show", () => {
    expect(view.tables.map((t) => t.label)).toEqual(["Table 1"]);
    expect(view.tables[0].seated).toEqual(["Nia Bell", "Ravi Sen"]);
    expect(view.runOfShow.map((b) => b.time)).toEqual(["17:00", "18:30"]);
  });

  it("carries the bring list, photos, song, note and sample counts", () => {
    expect(view.bring[0]).toMatchObject({ title: "A salad", slots: 2, claimedBy: ["Nia (fennel)"] });
    expect(view.photos).toHaveLength(1);
    expect(view.song?.title).toBe("The Long Table");
    expect(view.voiceNote?.url).toContain("note.mp3");
    expect(view.wishes).toBe(3);
    expect(view.comments).toBe(2);
  });

  it("formats wall-clock times without shifting them", () => {
    expect(clockLabel("17:00")).toBe("5:00 PM");
    expect(clockLabel("09:05")).toBe("9:05 AM");
    expect(clockLabel("00:30")).toBe("12:30 AM");
  });
});

describe("the example page offers no way to act", () => {
  const page = readFileSync("src/routes/example.host.tsx", "utf8");
  const fns = readFileSync("src/lib/showcase.functions.ts", "utf8");

  it("says the one calm line", () => {
    expect(EXAMPLE_NOTE).toBe("This is an example. Create your own event to try it.");
    expect(page).toContain("EXAMPLE_NOTE");
  });

  it("imports nothing that can send, export, invite, regenerate, duplicate or download", () => {
    for (const forbidden of [
      "sendEventInvites",
      "sendInvites",
      "downloadCsv",
      "exportGuests",
      "inviteCollaborator",
      "regenerateInviteNarration",
      "duplicateEvent",
      "getPieceAudioUrl",
      "studioCompose",
      "uploadEventPhoto",
      "claimBringItem",
      "upsertEvent",
    ]) {
      expect(page, forbidden).not.toContain(forbidden);
    }
    expect(page).not.toMatch(/\.download\b/);
    expect(page).not.toContain("<a ");
  });

  it("renders every action switched off, and audio without a download control", () => {
    const disabledActions = page.match(/<DisabledAction/g) ?? [];
    expect(disabledActions.length).toBeGreaterThan(0);
    expect(page).toMatch(/function DisabledAction[\s\S]*?disabled\s+aria-disabled="true"/);
    const audios = page.match(/<audio[\s\S]*?\/>/g) ?? [];
    expect(audios.length).toBeGreaterThan(0);
    for (const a of audios) expect(a).toContain('controlsList="nodownload"');
  });

  it("is kept out of search and reads the showcase through its own server call", () => {
    expect(page).toContain('{ name: "robots", content: "noindex, nofollow" }');
    expect(page).toContain("fetchExampleHostView");
    expect(fns).toMatch(/\.eq\("id", SHOWCASE_EVENT_ID\)/);
    const sitemap = readFileSync("src/routes/sitemap[.]xml.ts", "utf8");
    expect(sitemap).not.toContain("/example");
  });

  it("counts the host view and the create tap with a verified identity only", () => {
    expect(page).toContain('kind: "example_host_view"');
    expect(page).toContain('kind: "example_create"');
    expect(fns).toContain('"example_host_view"');
    expect(fns).toContain('"example_create"');
    expect(fns).not.toMatch(/userId: z\.string\(\)/);
    expect(fns).toContain("supabaseAdmin.auth.getUser(token)");
  });
});
