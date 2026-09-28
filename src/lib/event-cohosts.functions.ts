// Co-hosts / collaborators on a single event.
//
// Access model (authoritative in the DB, see the event_members migration):
// - The event owner (events.user_id) always keeps full control. Platform
//   owner/admin accounts can also manage any event's collaborators (same
//   override the events RLS policies grant); those actions are audit-logged.
// - An ACTIVE member with role 'cohost' can read AND edit the event.
// - An ACTIVE member with role 'viewer' can only read it.
// Everything here is a thin wrapper: policy decisions live in the
// owns_event / event_collaborator_role / can_edit_event security-definer
// helpers so a client cannot talk its way past them.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertEventOwner, collaboratorSeatState, sendCohostInvite } from "@/lib/event-cohosts.server";
import { COLLABORATOR_INVITE_TTL_DAYS } from "@/lib/tier-limits";

const COLS =
  "id,event_id,invited_email,role,status,created_at,accepted_at,expires_at,token";

function inviteExpiry(): string {
  return new Date(Date.now() + COLLABORATOR_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export interface EventMemberRow {
  id: string;
  event_id: string;
  invited_email: string;
  role: "cohost" | "viewer";
  status: "invited" | "active" | "revoked";
  created_at: string;
  accepted_at: string | null;
  expires_at: string | null;
  token: string;
}

export const listEventMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ eventId: z.string().min(1).max(120) }), i, "event-cohosts.functions.ts:39"))
  .handler(async ({ data, context }): Promise<EventMemberRow[]> => {
    const sb = context.supabase as any;
    const event = await assertEventOwner(sb, data.eventId, context.userId);
    // No grandfathering: reading the list also enforces the host's current cap,
    // so over-cap collaborators are revoked before they're shown as having access.
    await collaboratorSeatState(sb, data.eventId, event.user_id).catch(() => null);
    const { data: rows, error } = await sb
      .from("event_members")
      .select(COLS)
      .eq("event_id", data.eventId)
      .neq("status", "revoked")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as EventMemberRow[];
  });

export const inviteEventMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(z
      .object({
        eventId: z.string().min(1).max(120),
        email: z.string().email().max(200),
        role: z.enum(["cohost", "viewer"]).default("cohost"),
      }), i, "event-cohosts.functions.ts:65"),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { assertNotDemoCaller, logDemoGuard } = await import("@/lib/demo-mode.server");
    await assertNotDemoCaller("invite", context, { eventId: data.eventId });
    const { isShowcaseEvent, SHOWCASE_READONLY_MESSAGE } = await import("@/lib/showcase");
    if (isShowcaseEvent(data.eventId)) {
      await logDemoGuard("invite", { eventId: data.eventId, showcase: true }, context.userId);
      throw new Error(SHOWCASE_READONLY_MESSAGE);
    }
    const event = await assertEventOwner(sb, data.eventId, context.userId, "event.collaborator_invite_override");

    const email = data.email.trim().toLowerCase();
    const selfEmail = String((context.claims as any)?.email ?? "").toLowerCase();
    if (email === selfEmail) throw new Error("You already have full access to this event.");

    // The unique index is on (event_id, lower(invited_email)) — an expression
    // index, which PostgREST's onConflict cannot target. Re-invite by hand.
    const { data: existing } = await sb
      .from("event_members")
      .select("id")
      .eq("event_id", data.eventId)
      .ilike("invited_email", email)
      .maybeSingle();

    // Seats come from the HOST's tier, not the caller's. Re-inviting somebody
    // who already holds a seat doesn't consume a new one.
    if (!existing) {
      const seats = await collaboratorSeatState(sb, data.eventId, event.user_id);
      if (!seats.canInvite) {
        const { UpgradeRequiredError } = await import("@/lib/tier-guards.server");
        if (seats.cap === 0) {
          throw new UpgradeRequiredError(
            "whisper",
            "Collaborators are a paid feature. Upgrade to share this event with a co-host or viewer.",
          );
        }
        throw new UpgradeRequiredError(
          "atelier",
          `Your plan includes ${seats.cap} collaborator${seats.cap === 1 ? "" : "s"} per event and ${seats.used} ${seats.used === 1 ? "is" : "are"} in use. Remove one or upgrade to invite another.`,
        );
      }
    }

    const { data: row, error } = existing
      ? await sb
          .from("event_members")
          .update({ role: data.role, status: "invited", invited_by: context.userId, expires_at: inviteExpiry() })
          .eq("id", (existing as { id: string }).id)
          .select(COLS)
          .single()
      : await sb
          .from("event_members")
          .insert({
            event_id: data.eventId,
            invited_email: email,
            role: data.role,
            status: "invited",
            invited_by: context.userId,
            expires_at: inviteExpiry(),
          })
          .select(COLS)
          .single();
    if (error) throw new Error(error.message);


    const title = String((event.data as any)?.title ?? "an event");
    const emailed = await sendCohostInvite({
      email,
      token: (row as EventMemberRow).token,
      role: data.role,
      eventTitle: title,
      inviterUserId: context.userId,
      sb,
      eventId: data.eventId,
    });
    return { ...(row as EventMemberRow), emailed };
  });

export const resendEventMemberInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ memberId: z.string().uuid() }), i, "event-cohosts.functions.ts:139"))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: member, error } = await sb
      .from("event_members")
      .select("id,event_id,invited_email,role,token,status")
      .eq("id", data.memberId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!member) throw new Error("Invitation not found.");
    if (member.status === "active") throw new Error("This collaborator already accepted.");
    const { assertNotDemoCaller } = await import("@/lib/demo-mode.server");
    await assertNotDemoCaller("invite", context, { eventId: member.event_id, resend: true });
    const event = await assertEventOwner(sb, member.event_id, context.userId, "event.collaborator_resend_override");
    // A resend restarts the clock, so an invite that went stale becomes usable.
    await sb.from("event_members").update({ expires_at: inviteExpiry() }).eq("id", member.id);
    const emailed = await sendCohostInvite({
      email: member.invited_email,
      token: member.token,
      role: member.role,
      eventTitle: String((event.data as any)?.title ?? "an event"),
      inviterUserId: context.userId,
      sb,
    });
    return { ok: true, emailed };
  });

export const removeEventMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ memberId: z.string().uuid() }), i, "event-cohosts.functions.ts:166"))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: member, error } = await sb
      .from("event_members")
      .select("id,event_id")
      .eq("id", data.memberId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!member) return { ok: true };
    await assertEventOwner(sb, member.event_id, context.userId, "event.collaborator_remove_override");
    const { error: delErr } = await sb.from("event_members").delete().eq("id", data.memberId);
    if (delErr) throw new Error(delErr.message);
    return { ok: true };
  });

/** Accept an invite. The RPC verifies the signed-in email matches the invite. */
export const acceptEventMemberInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ token: z.string().min(8).max(200) }), i, "event-cohosts.functions.ts:185"))
  .handler(async ({ data, context }) => {
    const { data: eventId, error } = await (context.supabase as any).rpc(
      "accept_event_member_invite",
      { _token: data.token },
    );
    if (error) throw new Error(error.message);
    return { eventId: eventId as string };
  });

/** Events shared WITH the caller (accepted collaborations), for the dashboard. */
export const listSharedEventIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows, error } = await (context.supabase as any)
      .from("event_members")
      .select("event_id,role")
      .eq("user_id", context.userId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    return (rows ?? []) as { event_id: string; role: "cohost" | "viewer" }[];
  });

/** Seat usage for the collaborator card (host's tier, not the viewer's). */
export const getCollaboratorSeats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ eventId: z.string().min(1).max(120) }), i, "event-cohosts.functions.ts:211"))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const event = await assertEventOwner(sb, data.eventId, context.userId);
    return collaboratorSeatState(sb, data.eventId, event.user_id);
  });
