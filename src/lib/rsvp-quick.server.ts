import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { formatEventDate } from "@/lib/datetime";
import type { QuickRsvpAnswer } from "@/lib/invite-links";
import { personalInviteUrl } from "@/lib/invite-links";

/** Publishable-key client: RSVP writes go through the public SECURITY DEFINER RPC. */
function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

/** Service-role client, used only to read the guest's own contact details. */
function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface QuickRsvpOutcome {
  ok: boolean;
  /** Status actually stored — may be "waitlisted" when the event is full. */
  status: string | null;
  reason: string | null;
  /** Plain-language confirmation line for the guest. */
  confirmation: string;
  guestName: string;
  eventTitle: string;
  whenLine: string;
  venue: string;
}

/**
 * Record a one-tap answer and nothing else.
 *
 * The whole point is that the answer is captured before any follow-up
 * questions: plus-ones, dietary needs and shirt sizes are asked afterwards and
 * are always optional. `public_update_guest` stays authoritative for capacity
 * and waitlist routing.
 */
export async function recordQuickRsvp(args: {
  eventId: string;
  guestId: string;
  answer: QuickRsvpAnswer;
  origin?: string;
}): Promise<QuickRsvpOutcome> {
  const sb = publicClient();
  const { data: result, error } = await sb.rpc("public_update_guest", {
    _event_id: args.eventId,
    _guest_id: args.guestId,
    _patch: { status: args.answer } as never,
  });

  const { data: eventRow } = await sb.rpc("get_public_event_by_id", { _id: args.eventId });
  const ev = ((eventRow ?? {}) as Record<string, unknown>) || {};
  const title = String(ev.title || "the event");
  const parts = ev.date ? formatEventDate(String(ev.date), (ev.timezone as string) ?? null) : null;
  const whenLine = parts?.full ?? "";
  const venue = String(ev.venue || ev.address || "");

  const guests = Array.isArray(ev.guests) ? (ev.guests as Record<string, unknown>[]) : [];
  const guestName = String(guests.find((g) => g.id === args.guestId)?.name || "");

  if (error) {
    return {
      ok: false,
      status: null,
      reason: "error",
      confirmation: "",
      guestName,
      eventTitle: title,
      whenLine,
      venue,
    };
  }

  const r = (result ?? {}) as { ok?: boolean; reason?: string; status?: string };
  const status = r.status ?? args.answer;
  const ok = r.ok !== false;

  let confirmation = "";
  if (ok) {
    if (status === "waitlisted") {
      confirmation = `You're on the waiting list for ${title}. We will email you the moment a place opens up.`;
    } else if (args.answer === "yes") {
      confirmation = whenLine
        ? `You're confirmed. We'll see you ${whenLine}${venue ? ` at ${venue}` : ""}.`
        : "You're confirmed. Thank you for answering.";
    } else if (args.answer === "maybe") {
      confirmation = `Thank you. We've marked you as a maybe for ${title}. You can change your answer any time from this page.`;
    } else {
      confirmation = `Thank you for letting us know you can't make it to ${title}. Your answer has been saved.`;
    }
  }

  if (ok) {
    // Confirmation email so an elderly guest has proof it worked and never
    // needs to RSVP twice or telephone the host. Best effort, never fatal.
    try {
      await sendQuickRsvpConfirmation({
        eventId: args.eventId,
        guestId: args.guestId,
        answer: args.answer,
        status,
        eventTitle: title,
        whenLine,
        venue,
        confirmation,
        origin: args.origin,
      });
    } catch (e) {
      console.error("rsvp confirmation email failed", e);
    }
  }

  return {
    ok,
    status,
    reason: r.reason ?? null,
    confirmation,
    guestName,
    eventTitle: title,
    whenLine,
    venue,
  };
}

async function sendQuickRsvpConfirmation(args: {
  eventId: string;
  guestId: string;
  answer: QuickRsvpAnswer;
  status: string;
  eventTitle: string;
  whenLine: string;
  venue: string;
  confirmation: string;
  origin?: string;
}) {
  const admin = adminClient();
  if (!admin) return;
  const { data: row } = await admin
    .from("events")
    .select("data")
    .eq("id", args.eventId)
    .maybeSingle();
  const data = ((row as { data?: Record<string, unknown> } | null)?.data ?? {}) as Record<string, unknown>;
  const guests = Array.isArray(data.guests) ? (data.guests as Record<string, unknown>[]) : [];
  const guest = guests.find((g) => g.id === args.guestId);
  const email = typeof guest?.email === "string" ? guest.email.trim() : "";
  if (!email.includes("@")) return;

  const hosts = Array.isArray(data.hosts) ? (data.hosts as Record<string, unknown>[]) : [];
  const hostName = String(hosts[0]?.name || "");
  const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
  const { buildSenderName } = await import("@/lib/email/sender-name");
  const origin = args.origin || "https://thekenroecollective.com";

  await enqueueTransactionalEmailServer({
    templateName: "rsvp-confirmation",
    recipientEmail: email,
    idempotencyKey: `rsvp-confirmation-${args.eventId}-${args.guestId}-${args.status}`,
    label: "rsvp-confirmation",
    eventId: args.eventId,
    guestId: args.guestId,
    fromName: buildSenderName({
      override: data.senderName as string | undefined,
      hostName,
      eventTitle: args.eventTitle,
    }),
    templateData: {
      guestName: String(guest?.name || "there"),
      hostName,
      eventTitle: args.eventTitle,
      whenLine: args.whenLine,
      venue: args.venue,
      answer: args.answer,
      status: args.status,
      confirmation: args.confirmation,
      inviteUrl: personalInviteUrl(`${origin}/invite/${args.eventId}`, args.guestId),
      accentColor: (data.color as string) || "",
    },
  });
}
