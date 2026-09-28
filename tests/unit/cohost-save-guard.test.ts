// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RECURRENCE GUARD: a co-host's edit must reach the server.
 *
 * maySyncEvent() used to short-circuit on the cached `_ownerUserId` tag
 * (`if (localOwner && localOwner !== userId) return false;`) before it ever
 * consulted event_members. Every shared event is tagged with the HOST's
 * user_id, so a co-host's queued write was dropped AND the event was deleted
 * from their local cache — the event appeared to vanish from their app.
 */

const upsertCalls: any[] = [];

vi.mock("@/lib/events-sync.functions", () => ({
  upsertEvent: vi.fn(async (args: any) => {
    upsertCalls.push(args.data);
    return { ok: true };
  }),
  fetchMyEvents: vi.fn(async () => []),
  fetchEventById: vi.fn(async () => null),
  fetchPublicEventById: vi.fn(async () => null),
  fetchPublicEventBySlug: vi.fn(async () => null),
  deleteEventRemote: vi.fn(async () => ({ ok: true })),
  myRecentEventCreations: vi.fn(async () => ({ createdAts: [] })),
  fetchSharedEvents: vi.fn(async () => [{ id: "e1", user_id: "u1", data: { id: "e1", title: "The Kendrick Family Reunion", guests: [] }, role: "cohost" }]),
}));

const sharedEvent = {
  id: "e1",
  title: "The Kendrick Family Reunion",
  guests: [],
  createdAt: new Date().toISOString(),
};

vi.mock("@/integrations/supabase/client", () => {
  // Signed-in user is u2, a co-host on event e1 owned by u1.
  const makeQuery = (table: string) => {
    const q: any = {
      then: (res: any) =>
        Promise.resolve({
          data:
            table === "events"
              ? [{ id: "e1", user_id: "u1", data: sharedEvent }]
              : table === "event_members"
                ? [{ event_id: "e1", role: "cohost" }]
                : [],
          error: null,
        }).then(res),
      maybeSingle: async () => ({
        data: table === "event_members" ? { role: "cohost" } : null,
        error: null,
      }),
      single: async () => ({ data: null, error: null }),
    };
    for (const m of ["select", "eq", "in", "is", "order", "limit", "neq"]) q[m] = () => q;
    return q;
  };
  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: { user: { id: "u2" } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        getUser: async () => ({ data: { user: { id: "u2" } } }),
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
      from: (table: string) => makeQuery(table),
    },
  };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

describe("co-host saves on a shared event", () => {
  beforeEach(() => {
    upsertCalls.length = 0;
    localStorage.clear();
  });

  it("syncs the edit instead of discarding it and dropping the event", async () => {
    const event = { ...sharedEvent, _ownerUserId: "u1" };
    localStorage.setItem("kcc.events.v1.owner", "u2");
    localStorage.setItem("kcc.events.v1.u.u2", JSON.stringify([event]));
    localStorage.setItem("kcc.events.v1.u.u2.pending", JSON.stringify(["e1"]));

    const store = await import("@/lib/events-store");
    store.refreshEventsFromCloud();
    await new Promise((r) => setTimeout(r, 80));
    await store.saveEventsNow("e1");

    expect(upsertCalls.map((c) => c.id)).toContain("e1");
    // And the shared event must still be there afterwards.
    const cached = JSON.parse(localStorage.getItem("kcc.events.v1.u.u2") ?? "[]");
    expect(cached.map((e: any) => e.id)).toContain("e1");
  });
});
