// Invitation open tracking — server functions.
//
// recordInviteOpen is public (guests have no account). Reads are host-only and
// verified server-side with public.can_edit_event; the owner-wide health read
// requires the owner/admin role. One guest can never see another's open status.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { InviteOpenRow } from "@/lib/invite-opens";

export const recordInviteOpen = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    parseInput(z
      .object({
        eventId: z.string().min(1).max(120),
        guestId: z.string().min(1).max(60),
      }), input, "invite-opens.functions.ts:18"),
  )
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    try {
      const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
      const limited = enforceIpRateLimit(request, { scope: "invite-open", max: 60, windowMs: 60 * 1000 });
      if (limited) throw limited;
    } catch (e) {
      if (e instanceof Response) throw e;
    }
    const { recordInviteOpenServer } = await import("@/lib/invite-opens.server");
    return recordInviteOpenServer({ eventId: data.eventId, guestId: data.guestId, request });
  });

export interface InviteOpensPayload {
  eventId: string;
  rows: InviteOpenRow[];
  /** Event creation time, used to report "not tracked" for older events. */
  eventCreatedAt: string | null;
}

export const getInviteOpens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(z.object({ eventId: z.string().min(1).max(120) }), input, "invite-opens.functions.ts:43"))
  .handler(async ({ data, context }): Promise<InviteOpensPayload> => {
    const supabase = context.supabase as any;
    const { data: mayEdit, error: rpcError } = await supabase.rpc("can_edit_event", {
      _event_id: data.eventId,
      _user_id: context.userId,
    });
    if (rpcError) throw new Error("Could not verify access to this event");
    if (mayEdit !== true) throw new Response("Forbidden", { status: 403 });

    const { mapOpenRows } = await import("@/lib/invite-opens.server");
    const [{ data: rows }, { data: eventRow }] = await Promise.all([
      supabase
        .from("event_invite_opens")
        .select("guest_id,first_opened_at,last_opened_at,open_count")
        .eq("event_id", data.eventId),
      supabase.from("events").select("created_at").eq("id", data.eventId).maybeSingle(),
    ]);

    return {
      eventId: data.eventId,
      rows: mapOpenRows(rows),
      eventCreatedAt: (eventRow?.created_at as string | null) ?? null,
    };
  });

export interface InviteHealthEvent {
  eventId: string;
  title: string;
  guests: number;
  opened: number;
  openedNoAnswer: number;
  rate: number;
  redFlag: boolean;
  repeatOpeners: number;
}

/**
 * Owner-level product health: a high "opened but never answered" rate on any
 * event means the RSVP flow is failing, not that guests are rude.
 */
export const getInviteOpenHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ events: InviteHealthEvent[]; generatedAt: string }> => {
    const supabase = context.supabase as any;
    const [{ data: isOwner }, { data: isSuper }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
      supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
      supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    if (isOwner !== true && isSuper !== true && isAdmin !== true) {
      throw new Response("Forbidden", { status: 403 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mapOpenRows } = await import("@/lib/invite-opens.server");
    const { isRsvpFlowRedFlag, openWithoutAnswerRate } = await import("@/lib/invite-opens");

    const { data: openRows } = await supabaseAdmin
      .from("event_invite_opens")
      .select("event_id,guest_id,first_opened_at,last_opened_at,open_count");
    const grouped = new Map<string, any[]>();
    for (const r of (openRows ?? []) as any[]) {
      const list = grouped.get(String(r.event_id)) ?? [];
      list.push(r);
      grouped.set(String(r.event_id), list);
    }
    if (grouped.size === 0) return { events: [], generatedAt: new Date().toISOString() };

    const { data: events } = await supabaseAdmin
      .from("events")
      .select("id,data")
      .in("id", Array.from(grouped.keys()));

    const out: InviteHealthEvent[] = [];
    for (const ev of (events ?? []) as any[]) {
      const guests = Array.isArray(ev.data?.guests) ? ev.data.guests : [];
      const statusById = new Map<string, string>(
        guests.map((g: any) => [String(g.id), String(g.status ?? "pending")]),
      );
      const rows = mapOpenRows(grouped.get(String(ev.id)));
      const opened = rows.length;
      const openedNoAnswer = rows.filter((r) => {
        const s = statusById.get(r.guestId);
        return !s || s === "pending" || s === "invited";
      }).length;
      out.push({
        eventId: String(ev.id),
        title: String(ev.data?.title ?? ev.id),
        guests: guests.length,
        opened,
        openedNoAnswer,
        rate: openWithoutAnswerRate(opened, openedNoAnswer),
        redFlag: isRsvpFlowRedFlag(opened, openedNoAnswer),
        repeatOpeners: rows.filter((r) => r.openCount > 2).length,
      });
    }
    out.sort((a, b) => b.rate - a.rate || b.openedNoAnswer - a.openedNoAnswer);
    return { events: out, generatedAt: new Date().toISOString() };
  });
