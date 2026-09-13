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

describe("thank-you composer persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("round-trips paragraphs, emoji, sign-off, and GIF without creating a duplicate card", async () => {
    const store = await import("@/lib/events-store");
    const event = {
      id: "event-1",
      title: "Reunion",
      date: "2027-01-01T18:00:00",
      venue: "Home",
      description: "",
      message: "",
      createdAt: new Date().toISOString(),
      guests: [],
      thankYouCards: [],
    };
    localStorage.setItem("kcc.events.v1", JSON.stringify([event]));
    const message = "First paragraph 🎉\n\nSecond paragraph stays verbatim.";
    const gif = "https://media.giphy.com/media/example/giphy.gif";

    store.setThankYouDraft("event-1", { message, signOff: "Chris & family", gif });

    const raw = JSON.parse(localStorage.getItem("kcc.events.v1") ?? "[]");
    expect(raw[0].thankYouDraft).toMatchObject({ message, signOff: "Chris & family", gif });
    expect(raw[0].thankYouCards).toEqual([]);
  });
});