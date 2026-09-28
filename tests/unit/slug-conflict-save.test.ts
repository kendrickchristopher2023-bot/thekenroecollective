// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A branded link claimed by another event can never succeed on retry. The save
 * must still land (without the link) instead of pinning the queue in "Syncing"
 * and blocking every other edit on that event.
 */

const upsertCalls: any[] = [];

vi.mock("@/lib/events-sync.functions", () => ({
  upsertEvent: vi.fn(async (args: any) => {
    upsertCalls.push(args.data);
    if (args.data.brandedSlug) {
      throw new Error("The link /e/2027-kendrick was just claimed by another event. Try a different one.");
    }
    return { ok: true };
  }),
  fetchMyEvents: vi.fn(async () => []),
  fetchEventById: vi.fn(async () => null),
  fetchPublicEventById: vi.fn(async () => null),
  fetchPublicEventBySlug: vi.fn(async () => null),
  deleteEventRemote: vi.fn(async () => ({ ok: true })),
  myRecentEventCreations: vi.fn(async () => ({ createdAts: [] })),
  fetchSharedEvents: vi.fn(async () => []),
}));

vi.mock("@/integrations/supabase/client", () => {
  // Chainable stub: every query resolves to an empty result, so hydration keeps
  // the localStorage copy and the push queue is what we exercise.
  const rows: Record<string, any[]> = { events: [{ id: "e1", user_id: "u1" }] };
  const makeQuery = (table: string) => {
    const q: any = {
      then: (res: any) => Promise.resolve({ data: table === "events" ? rows.events : [], error: null }).then(res),
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
    };
    for (const m of ["select", "eq", "in", "is", "order", "limit", "neq"]) q[m] = () => q;
    return q;
  };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        getUser: async () => ({ data: { user: { id: "u1" } } }),
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
      from: (table: string) => makeQuery(table),
    },
  };
});

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn(), message: vi.fn() } }));

describe("slug conflict during save", () => {
  beforeEach(() => {
    upsertCalls.length = 0;
    toastError.mockClear();
    localStorage.clear();
  });

  it("saves the event without the conflicting link and clears the queue", async () => {
    const event = {
      id: "e1",
      title: "The Kendrick Family Reunion",
      brandedSlug: "2027-kendrick",
      guests: [],
      createdAt: new Date().toISOString(),
      _ownerUserId: "u1",
    };
    localStorage.setItem("kcc.events.v1", JSON.stringify([event]));
    localStorage.setItem("kcc.events.v1.pending", JSON.stringify(["e1"]));

    const store = await import("@/lib/events-store");
    // Populate the in-memory cache from localStorage the way the app does.
    store.refreshEventsFromCloud();
    await new Promise((r) => setTimeout(r, 50));
    const ok = await store.saveEventsNow("e1");

    expect(upsertCalls.length).toBeGreaterThanOrEqual(2);
    expect(upsertCalls.at(-1)?.brandedSlug).toBeNull();
    expect(ok).toBe(true);
    expect(JSON.parse(localStorage.getItem("kcc.events.v1.pending") ?? "[]")).toEqual([]);
    expect(toastError).toHaveBeenCalled();
  });
});
