// getProjectLinkedEvent must never let a board member ask about an
// arbitrary event, and must never hand back guest lists, emails, phones,
// RSVPs or notes. These tests pin both rules.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { toLinkedEventLabel } from "@/lib/pm-events.functions";

const src = readFileSync("src/lib/pm-events.functions.ts", "utf8");
const start = src.indexOf("export const getProjectLinkedEvent");
const body = src.slice(start);

describe("linked event label is minimal", () => {
  it("returns only id, title, date and timezone even when the event is full of private data", () => {
    const label = toLinkedEventLabel({
      id: "abc123",
      data: {
        title: "Smith Wedding",
        date: "2027-06-19",
        timezone: "America/New_York",
        guests: [{ name: "Real Person", email: "real@example.org", phone: "919-555-1212" }],
        rsvpNotes: "private note",
        message: "host-only message",
      },
    });
    expect(label).toEqual({
      id: "abc123",
      title: "Smith Wedding",
      date: "2027-06-19",
      timezone: "America/New_York",
    });
    expect(Object.keys(label).sort()).toEqual(["date", "id", "timezone", "title"]);
    expect(JSON.stringify(label)).not.toContain("real@example.org");
    expect(JSON.stringify(label)).not.toContain("private note");
  });

  it("falls back to a generic title when the event has none", () => {
    expect(toLinkedEventLabel({ id: "x", data: {} })).toEqual({ id: "x", title: "Linked event" });
  });
});

describe("getProjectLinkedEvent cannot be steered by the client", () => {
  it("takes only projectId from the browser, never an event id", () => {
    expect(body).toContain("z.object({ projectId: z.string().uuid() })");
    expect(body).not.toContain("eventId: z.string()");
  });
  it("reads the linked event from the project on the server", () => {
    expect(body).toContain('.from("pm_projects")');
    expect(body).toContain('.select("event_id")');
    expect(body).toContain('.eq("id", proj.event_id)');
  });
  it("checks board membership before touching the events table", () => {
    expect(body.indexOf("pm_is_project_member")).toBeGreaterThan(-1);
    expect(body.indexOf("pm_is_project_member")).toBeLessThan(body.indexOf('.from("events")'));
  });
});
