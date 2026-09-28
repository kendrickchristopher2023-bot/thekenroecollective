import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Proves the scheduled-text mechanism end to end without a provider call:
 * a stub database client records every write, so we can assert that pending
 * outbox rows are created, that an opted-out number is skipped, and that the
 * once-only claim is taken on the "sms" channel.
 */

vi.mock("@/lib/tier-guards.server", () => ({
  resolveUserTier: async () => ({ tier: "host", isOwner: false, isAdmin: false }),
}));
vi.mock("@/lib/tier-limits", () => ({
  canSendSms: () => true,
  getEffectiveSmsCap: () => Number.POSITIVE_INFINITY,
  isUnlimited: () => true,
}));

type Recorded = { table: string; op: string; payload: unknown };

function stubAdmin(consent: Array<{ phone_number: string; opted_out: boolean }>) {
  const writes: Recorded[] = [];
  const chain = (table: string, result: unknown): any => {
    const api: any = {
      select: () => api,
      eq: () => api,
      neq: () => api,
      is: () => api,
      in: () => api,
      limit: () => api,
      delete: () => {
        writes.push({ table, op: "delete", payload: null });
        return api;
      },
      maybeSingle: async () => result,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
      insert: async (payload: unknown) => {
        writes.push({ table, op: "insert", payload });
        return { error: null };
      },
      upsert: async (payload: unknown) => {
        writes.push({ table, op: "upsert", payload });
        return { error: null };
      },
    };
    return api;
  };
  const admin = {
    from: (table: string) => {
      if (table === "profiles") return chain(table, { data: { sms_pack_enabled: true } });
      if (table === "sms_consent_log") return chain(table, { data: consent });
      if (table === "sms_outbox") return chain(table, { count: 0, data: [] });
      return chain(table, { data: [], error: null });
    },
  };
  return { admin, writes };
}

const eventData = {
  title: "Tenia's supper",
  date: "2030-06-01T18:00:00",
  timezone: "America/New_York",
  hosts: [{ name: "Christopher" }],
  reminderSmsEnabled: true,
  reminderSmsBody: "",
} as never;

describe("scheduled reminder texts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queues one pending outbox row per consenting guest and claims the send", async () => {
    const { queueReminderSmsBatch } = await import("@/lib/event-reminders.server");
    const { admin, writes } = stubAdmin([{ phone_number: "5551230000", opted_out: false }]);

    const res = await queueReminderSmsBatch({
      admin: admin as never,
      eventId: "evt-1",
      ownerUserId: "user-1",
      eventData,
      guests: [
        { id: "g1", name: "Ada", phone: "+1 555 123 0000" },
        { id: "g2", name: "Ben", phone: "" },
      ] as never,
      presetId: "1d",
    });

    expect(res.queued).toBe(1);
    expect(res.skipped).toBe(1);

    const claims = writes.filter((w) => w.table === "event_reminder_sends" && w.op === "insert");
    expect(claims).toHaveLength(1);
    expect((claims[0]!.payload as { channel: string }).channel).toBe("sms");

    const outbox = writes.find((w) => w.table === "sms_outbox" && w.op === "insert");
    expect(outbox).toBeTruthy();
    const rows = outbox!.payload as Array<{ status: string; to_phone: string; body: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.body).toContain("Tenia's supper");
  });

  it("never queues a number that opted out", async () => {
    const { queueReminderSmsBatch } = await import("@/lib/event-reminders.server");
    const { admin, writes } = stubAdmin([{ phone_number: "5551230000", opted_out: true }]);

    const res = await queueReminderSmsBatch({
      admin: admin as never,
      eventId: "evt-1",
      ownerUserId: "user-1",
      eventData,
      guests: [{ id: "g1", name: "Ada", phone: "+1 555 123 0000" }] as never,
      presetId: "1d",
    });

    expect(res.queued).toBe(0);
    expect(res.skipped).toBe(1);
    expect(writes.some((w) => w.table === "sms_outbox" && w.op === "insert")).toBe(false);
  });

  it("appends the opt-out wording only the first time a number is texted", async () => {
    const { queueReminderSmsBatch } = await import("@/lib/event-reminders.server");
    const { admin, writes } = stubAdmin([]);

    await queueReminderSmsBatch({
      admin: admin as never,
      eventId: "evt-1",
      ownerUserId: "user-1",
      eventData,
      guests: [{ id: "g1", name: "Ada", phone: "+1 555 999 0000" }] as never,
      presetId: "1d",
    });

    const outbox = writes.find((w) => w.table === "sms_outbox" && w.op === "insert");
    const rows = outbox!.payload as Array<{ body: string }>;
    expect(rows[0]!.body.toLowerCase()).toContain("stop");
    expect(writes.some((w) => w.table === "sms_consent_log" && w.op === "upsert")).toBe(true);
  });
});
