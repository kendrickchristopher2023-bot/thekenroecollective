import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SendEventReminderInput {
  eventId: string;
  /** Preset the host is sending, or "manual" for an ad-hoc nudge. */
  presetId?: string;
  /** Guests the host picked. Required — reminders are never blind-sent. */
  guestIds: string[];
}

export interface SendEventReminderResult {
  sent: number;
  skipped: number;
  failed: number;
  /** How many of the recipients had already declined. Reported, never dropped. */
  declined: number;
}

/**
 * Host-triggered "send this reminder now" for a chosen audience.
 *
 * A manual send does exactly what the host's selection says. The automatic
 * exclusion of guests who declined belongs to the SCHEDULED worker only: if a
 * host deliberately ticks someone who said no, that is the host's call, and the
 * count they confirmed must be the count that is reached.
 */
export const sendEventReminderNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SendEventReminderInput) => {
    if (!input?.eventId || typeof input.eventId !== "string") {
      throw new Error("eventId is required");
    }
    const guestIds = Array.isArray(input.guestIds) ? input.guestIds.filter((g) => typeof g === "string") : [];
    if (!guestIds.length) throw new Error("Pick at least one guest.");
    return {
      eventId: input.eventId,
      presetId: typeof input.presetId === "string" && input.presetId ? input.presetId : "manual",
      guestIds: guestIds.slice(0, 1000),
    };
  })
  .handler(async ({ data, context }): Promise<SendEventReminderResult> => {
    const { supabase } = context;
    const { sendReminderBatch, adminClient } = await import("@/lib/event-reminders.server");

    // RLS decides whether this caller may touch the event.
    const { data: row, error } = await supabase
      .from("events")
      .select("id, data, archived_at")
      .eq("id", data.eventId)
      .maybeSingle();
    if (error) throw new Error("Could not load the event.");
    if (!row || (row as any).archived_at) throw new Error("Event not found.");

    const admin = adminClient();
    if (!admin) throw new Error("Reminders are not configured.");

    const eventData = ((row as any).data || {}) as any;
    const picked = new Set(data.guestIds);
    const guests = (Array.isArray(eventData.guests) ? eventData.guests : []).filter(
      (g: any) => g?.id && picked.has(g.id),
    );
    const declined = guests.filter((g: any) => (g.status || "pending") === "no").length;
    if (!guests.length) return { sent: 0, skipped: 0, failed: 0, declined: 0 };

    // A manual send is deliberate, so it does not consume the automatic
    // once-only claim and is never blocked by it.
    const out = await sendReminderBatch({
      admin,
      eventId: data.eventId,
      eventData,
      guests,
      presetId: data.presetId,
      claim: false,
    });
    return { ...out, declined };
  });

export interface ReminderLastSent {
  /** Latest reminder EMAIL per guest id, ISO. Never an invitation timestamp. */
  email: Record<string, string>;
  /** Latest reminder SMS per guest id, ISO. */
  sms: Record<string, string>;
}

/**
 * Genuine last-reminder timestamps, per guest, per channel.
 *
 * Email comes from event_reminder_sends (written by both the scheduled worker
 * and manual sends); SMS from sms_outbox. Invitation `invitedAt` is deliberately
 * NOT used here — "invited Aug 26" and "reminded Aug 26" mean different things
 * and a host must never read one as the other.
 */
export const getReminderLastSent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { eventId: string }) => {
    if (!input?.eventId || typeof input.eventId !== "string") throw new Error("eventId is required");
    return { eventId: input.eventId };
  })
  .handler(async ({ data, context }): Promise<ReminderLastSent> => {
    const { supabase } = context;
    // RLS gate: the caller must be able to read the event itself.
    const { data: row } = await supabase
      .from("events")
      .select("id")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!row) throw new Error("Event not found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email: Record<string, string> = {};
    const sms: Record<string, string> = {};

    const { data: emailRows } = await supabaseAdmin
      .from("event_reminder_sends")
      .select("guest_id, sent_at, channel")
      .eq("event_id", data.eventId)
      .eq("channel", "email")
      .order("sent_at", { ascending: false })
      .limit(5000);
    for (const r of emailRows ?? []) {
      const id = (r as any).guest_id as string | null;
      const at = (r as any).sent_at as string | null;
      if (!id || !at) continue;
      if (!email[id] || at > email[id]!) email[id] = at;
    }

    const { data: smsRows } = await supabase
      .from("sms_outbox")
      .select("guest_id, sent_at, created_at, status")
      .eq("event_id", data.eventId)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(2000);
    for (const r of smsRows ?? []) {
      const id = (r as any).guest_id as string | null;
      const at = ((r as any).sent_at || (r as any).created_at) as string | null;
      if (!id || !at) continue;
      if (!sms[id] || at > sms[id]!) sms[id] = at;
    }

    return { email, sms };
  });
