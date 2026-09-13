import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface Guest {
  id: string;
  name?: string;
  email?: string;
  invitedAt?: string;
}

interface EventData {
  id?: string;
  title?: string;
  date?: string;
  venue?: string;
  address?: string;
  image?: string;
  message?: string;
  brandedSlug?: string;
  /** Host-chosen From: display name for guest-facing email. */
  senderName?: string;
  hosts?: Array<{ name?: string; role?: string }>;
  guests?: Guest[];
}


export interface SendEventInvitesInput {
  eventId: string;
  /** When true, also emails guests who have already been invited. */
  resend?: boolean;
  /** Optional subset of guest IDs. When empty, emails all eligible guests. */
  guestIds?: string[];
}

export interface SendEventInvitesResult {
  sent: number;
  skipped: number;
  failed: number;
  reasons: Record<string, number>;
}

export const sendEventInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SendEventInvitesInput) => {
    if (!input?.eventId || typeof input.eventId !== "string") {
      throw new Error("eventId is required");
    }
    return {
      eventId: input.eventId,
      resend: Boolean(input.resend),
      guestIds: Array.isArray(input.guestIds) ? input.guestIds : undefined,
    };
  })
  .handler(async ({ data, context }): Promise<SendEventInvitesResult> => {
    const { supabase } = context;
    // Email invitations are included on EVERY plan, Postcard included
    // (2026-08-21 decision). There is deliberately no tier gate here — the
    // free tier's guest cap (75) is the cost ceiling. Do not re-add an
    // assertMinTier check without also updating tier-config, pricing, the FAQ
    // and the chatbot prompt.
    const { getRequestOrigin, formatInviteDate } = await import("@/lib/events-invites.server");
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    const { buildSenderName } = await import("@/lib/email/sender-name");
    const { personalInviteUrl, oneTapRsvpUrls } = await import("@/lib/invite-links");




    // RLS enforces owner/admin access. If the caller can't select the event,
    // treat that as "not found" from the caller's perspective.
    const { data: row, error } = await supabase
      .from("events")
      .select("id, data, archived_at")
      .eq("id", data.eventId)
      .maybeSingle();

    if (error) {
      console.error("sendEventInvites select failed", error);
      throw new Error("Could not load the event.");
    }
    if (!row || row.archived_at) {
      throw new Error("Event not found.");
    }

    const eventData = ((row as any).data || {}) as EventData;
    const allGuests = Array.isArray(eventData.guests) ? eventData.guests : [];
    const subset = data.guestIds && data.guestIds.length
      ? new Set(data.guestIds)
      : null;

    const eligible = allGuests.filter(
      (g) =>
        g?.id &&
        typeof g.email === "string" &&
        g.email.includes("@") &&
        (!subset || subset.has(g.id)),
    );

    if (!eligible.length) {
      return { sent: 0, skipped: 0, failed: 0, reasons: {} };
    }

    const origin = getRequestOrigin();
    const inviteBase = `${origin}/invite/${data.eventId}`;
    // Emails must carry the zone label ("6:00 PM EDT"): a guest reading an
    // inbox in another zone has no page context to correct a bare "6:00 PM".
    const { date: eventDate, timeWithZone: eventTime } = formatInviteDate(
      eventData.date,
      (eventData as any).timezone,
    );
    const hostName =
      Array.isArray(eventData.hosts) && eventData.hosts[0]?.name
        ? eventData.hosts[0]!.name
        : "";
    // Guests recognise the host and the occasion, not the platform.
    const fromName = buildSenderName({
      override: eventData.senderName,
      hostName,
      eventTitle: eventData.title,
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const reasons: Record<string, number> = {};
    const now = new Date().toISOString();

    // Mutate a fresh copy of guests so we can persist invitedAt at the end.
    const nextGuests = allGuests.map((g) => ({ ...g }));
    const guestIndex = new Map(nextGuests.map((g, i) => [g.id, i] as const));

    for (const g of eligible) {
      if (!data.resend && g.invitedAt) {
        skipped += 1;
        reasons["already_invited"] = (reasons["already_invited"] || 0) + 1;
        continue;
      }

      const idempotencyKey = data.resend
        ? `event-invite-${data.eventId}-${g.id}-${Date.now()}`
        : `event-invite-${data.eventId}-${g.id}`;

      const r = await enqueueTransactionalEmailServer({
        templateName: "event-invite",
        recipientEmail: g.email!,
        idempotencyKey,
        label: "event-invite",
        eventId: data.eventId,
        fromName,
        templateData: {
          guestName: g.name || "there",
          hostName,
          eventTitle: eventData.title || "You're invited",
          eventDate,
          eventTime,
          venue: eventData.venue || "",
          address: eventData.address || "",
          coverImage: eventData.image || "",
          message: eventData.message || "",
          // Personalized link: the invitation opens already knowing who this
          // guest is, so nobody is asked to search for their own name.
          inviteUrl: personalInviteUrl(inviteBase, g.id),
          ...oneTapRsvpUrls(inviteBase, g.id),
          // The emailed invitation inherits the host's chosen invitation
          // colors so the inbox matches the invitation page.
          accentColor: (eventData as any).color || "",
          textColor: (eventData as any).textColor || "",
          logo: (eventData as any).logo || "",
        },
      });

      if (r.ok) {
        sent += 1;
        const idx = guestIndex.get(g.id);
        if (idx !== undefined) nextGuests[idx].invitedAt = now;
      } else if (r.reason === "suppressed" || r.reason === "already_unsubscribed") {
        skipped += 1;
        reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      } else {
        failed += 1;
        reasons[r.reason || "unknown"] = (reasons[r.reason || "unknown"] || 0) + 1;
      }
    }

    if (sent > 0) {
      const nextData = { ...eventData, guests: nextGuests };
      const { error: updErr } = await supabase
        .from("events")
        .update({ data: nextData as any })
        .eq("id", data.eventId);
      if (updErr) {
        console.error("sendEventInvites update guests failed", updErr);
      }
      // Fire-and-forget: stamp first material use on any attached pass.
      const { markMaterialUse } = await import("@/lib/pass-material-use");
      await markMaterialUse(supabase, data.eventId, "invitation_sent", context.userId);
    }

    return { sent, skipped, failed, reasons };
  });

/** Lightweight status for the UI: how many guests are eligible / already invited. */
export const getEventInviteStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { eventId: string }) => {
    if (!input?.eventId) throw new Error("eventId is required");
    return { eventId: input.eventId };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("events")
      .select("data, archived_at")
      .eq("id", data.eventId)
      .maybeSingle();
    if (error || !row) {
      return { totalGuests: 0, withEmail: 0, alreadyInvited: 0 };
    }
    const guests = (((row as any).data?.guests) || []) as Guest[];
    const withEmail = guests.filter(
      (g) => typeof g?.email === "string" && g.email.includes("@"),
    );
    return {
      totalGuests: guests.length,
      withEmail: withEmail.length,
      alreadyInvited: withEmail.filter((g) => !!g.invitedAt).length,
    };
  });
