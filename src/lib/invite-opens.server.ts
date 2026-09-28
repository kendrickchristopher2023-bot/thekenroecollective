// Server-only helpers for invitation open tracking.
//
// Writes go through the SECURITY DEFINER function public.record_invite_open,
// which refuses any guest id that is not actually on that event, so the anon
// role never touches the table directly.
import { createClient } from "@supabase/supabase-js";
import { isLikelyBotUserAgent, type InviteOpenRow } from "@/lib/invite-opens";

function publishableClient() {
  return createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Is the caller a host/co-host of this event? A host previewing their own
 * invitation must never show up as a guest open.
 */
async function callerCanEditEvent(request: Request, eventId: string): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return false;
  try {
    const client = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: user } = await client.auth.getUser(token);
    if (!user?.user) return false;
    const { data } = await client.rpc("can_edit_event", { _event_id: eventId, _user_id: user.user.id });
    return data === true;
  } catch {
    return false;
  }
}

export type RecordOpenResult = { recorded: boolean; reason?: "bot" | "host" | "error" };

export async function recordInviteOpenServer(input: {
  eventId: string;
  guestId: string;
  request: Request;
}): Promise<RecordOpenResult> {
  // 1. Bot filter: mail scanners and link unfurlers pre-fetch invitation URLs.
  //    They are excluded three ways — this call only happens from JS after the
  //    page mounts, only after a dwell delay on a visible tab, and only when
  //    the user agent looks like a real browser.
  if (isLikelyBotUserAgent(input.request.headers.get("user-agent"))) {
    return { recorded: false, reason: "bot" };
  }

  // 2. Never count the host's own preview of their invitation.
  if (await callerCanEditEvent(input.request, input.eventId)) {
    return { recorded: false, reason: "host" };
  }

  try {
    const { error } = await publishableClient().rpc("record_invite_open", {
      _event_id: input.eventId,
      _guest_id: input.guestId,
    });
    if (error) return { recorded: false, reason: "error" };
    return { recorded: true };
  } catch {
    return { recorded: false, reason: "error" };
  }
}

export function mapOpenRows(rows: any[] | null | undefined): InviteOpenRow[] {
  return (rows ?? []).map((r) => ({
    guestId: String(r.guest_id),
    firstOpenedAt: String(r.first_opened_at),
    lastOpenedAt: String(r.last_opened_at),
    openCount: Number(r.open_count ?? 1),
  }));
}
