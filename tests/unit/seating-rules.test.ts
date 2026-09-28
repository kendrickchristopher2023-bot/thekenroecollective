// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock("@/lib/events-sync.functions", () => ({
  fetchEventById: vi.fn(),
  fetchEventBySlug: vi.fn(),
  fetchOwnedEventById: vi.fn(),
  upsertEvent: vi.fn(),
  deleteEventRemote: vi.fn(),
}));

describe("seating together rules", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("places an existing pair next to each other when the rule is added", async () => {
    const store = await import("@/lib/events-store");
    const event = {
      id: "event-1",
      title: "Dinner",
      date: "2027-01-01T18:00:00",
      venue: "Home",
      description: "",
      message: "",
      createdAt: new Date().toISOString(),
      guests: [
        { id: "chris", name: "Chris", email: "", phone: "", status: "yes" as const },
        { id: "tenia", name: "Tenia", email: "", phone: "", status: "yes" as const },
        { id: "adrian", name: "Adrian", email: "", phone: "", status: "yes" as const },
      ],
      seatingTables: [
        { id: "table-1", label: "Dinner Table", shape: "round" as const, capacity: 6, guestIds: ["chris", "tenia", "adrian"] },
      ],
    };
    localStorage.setItem("kcc.events.v1", JSON.stringify([event]));

    store.addSeatingRule("event-1", { type: "together", guestAId: "chris", guestBId: "adrian" });

    const saved = (JSON.parse(localStorage.getItem("kcc.events.v1") ?? "[]") as typeof event[]).find(
      (item) => item.id === "event-1",
    );
    expect(saved?.seatingTables?.[0]?.guestIds).toEqual(["chris", "adrian", "tenia"]);
  });

  it("moves linked guests together when either guest is moved", async () => {
    const store = await import("@/lib/events-store");
    const event = {
      id: "event-2",
      title: "Dinner",
      date: "2027-01-01T18:00:00",
      venue: "Home",
      description: "",
      message: "",
      createdAt: new Date().toISOString(),
      guests: [
        { id: "chris", name: "Chris", email: "", phone: "", status: "yes" as const },
        { id: "adrian", name: "Adrian", email: "", phone: "", status: "yes" as const },
      ],
      seatingRules: [{ id: "rule-1", type: "together" as const, guestAId: "chris", guestBId: "adrian" }],
      seatingTables: [
        { id: "one", label: "One", shape: "round" as const, capacity: 6, guestIds: ["chris"] },
        { id: "two", label: "Two", shape: "round" as const, capacity: 6, guestIds: ["adrian"] },
      ],
    };
    localStorage.setItem("kcc.events.v1", JSON.stringify([event]));

    store.assignGuestToTable("event-2", "two", "chris");

    const saved = (JSON.parse(localStorage.getItem("kcc.events.v1") ?? "[]") as typeof event[]).find(
      (item) => item.id === "event-2",
    );
    expect(saved?.seatingTables?.[0]?.guestIds).toEqual([]);
    expect(saved?.seatingTables?.[1]?.guestIds).toEqual(["chris", "adrian"]);
  });

  it("repairs an older saved chart whose together pair has another guest between them", async () => {
    const store = await import("@/lib/events-store");
    const event = {
      id: "event-3",
      title: "Dinner",
      date: "2027-01-01T18:00:00",
      venue: "Home",
      description: "",
      message: "",
      createdAt: new Date().toISOString(),
      guests: [
        { id: "chris", name: "Chris", email: "", phone: "", status: "yes" as const },
        { id: "tenia", name: "Tenia", email: "", phone: "", status: "yes" as const },
        { id: "adrian", name: "Adrian", email: "", phone: "", status: "yes" as const },
      ],
      seatingRules: [{ id: "rule-1", type: "together" as const, guestAId: "chris", guestBId: "adrian" }],
      seatingTables: [
        { id: "one", label: "Dinner Table", shape: "round" as const, capacity: 6, guestIds: ["chris", "tenia", "adrian"] },
      ],
    };
    localStorage.setItem("kcc.events.v1", JSON.stringify([event]));

    store.enforceSeatingRules("event-3");

    const saved = (JSON.parse(localStorage.getItem("kcc.events.v1") ?? "[]") as typeof event[])[0];
    expect(saved?.seatingTables?.[0]?.guestIds).toEqual(["chris", "adrian", "tenia"]);
  });
});