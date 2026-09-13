// "Ask the host to add me" — the fallback when a guest can't find themselves on
// a broadly shared invite.
//
// The public submit path goes through the security-definer RPC
// `request_guest_addition` (validation + per-event rate limiting live in the
// database), so anon never touches the table directly. Host-side listing and
// approval run under the caller's own RLS.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export interface GuestRequestRow {
  id: string;
  event_id: string;
  name: string;
  contact: string;
  note: string | null;
  party_size: number;
  status: "pending" | "approved" | "dismissed";
  created_at: string;
}

const submitSchema = z.object({
  eventId: z.string().min(1).max(100),
  name: z.string().min(2).max(120),
  contact: z.string().min(5).max(200),
  note: z.string().max(500).optional(),
  partySize: z.number().int().min(1).max(20).optional(),
});

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Public: a guest asks the host to add them to the list. */
export const submitGuestRequest = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => parseInput(submitSchema, i, "guest-requests.functions.ts:52"))
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    const supabasePublic = publicClient();
    const { data: res, error } = await (supabasePublic as any).rpc("request_guest_addition", {
      _event_id: data.eventId,
      _name: data.name,
      _contact: data.contact,
      _note: data.note ?? null,
      _party_size: data.partySize ?? 1,
    });
    if (error) {
      console.error("request_guest_addition failed", error);
      return { ok: false, reason: "failed" };
    }
    const ok = !!res?.ok;
    if (!ok) return { ok: false, reason: String(res?.reason || "failed") };

    // Best-effort host alerts: email + in-app bell by default, SMS if opted in,
    // to the owner and every co-host. The in-app "Requests to join" list stays
    // the source of truth, so a failed alert must not fail the request itself.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { notifyHostsOfJoinRequest } = await import("@/lib/host-notify.server");
      const { getRequestOrigin } = await import("@/lib/events-invites.server");
      const [{ data: evRow }, { data: reqRow }] = await Promise.all([
        supabaseAdmin.from("events").select("data").eq("id", data.eventId).maybeSingle(),
        supabaseAdmin
          .from("event_guest_requests")
          .select("id")
          .eq("event_id", data.eventId)
          .ilike("contact", data.contact)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const eventData = (((evRow as any)?.data) || {}) as Record<string, any>;
      const requestId = String((reqRow as any)?.id || "");
      const { committedHeadcount } = await import("@/lib/events-store");
      await notifyHostsOfJoinRequest(supabaseAdmin as any, {
        requestId: requestId || `${data.eventId}-${data.contact.toLowerCase()}`,
        eventId: data.eventId,
        eventData,
        guestName: data.name,
        contact: data.contact,
        note: data.note ?? null,
        partySize: data.partySize ?? 1,
        origin: getRequestOrigin(),
        committed: committedHeadcount(eventData as any),
      });
      if (requestId) {
        await supabaseAdmin
          .from("event_guest_requests")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", requestId);
      }
    } catch (err) {
      console.error("guest-request host alerts failed", err);
    }

    return { ok: true };
  });

/** Host/co-host: pending and recent requests for one event. */
export const listGuestRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ eventId: z.string().min(1) }), i, "guest-requests.functions.ts:117"))
  .handler(async ({ data, context }): Promise<{ requests: GuestRequestRow[] }> => {
    const { data: rows, error } = await context.supabase
      .from("event_guest_requests")
      .select("id, event_id, name, contact, note, party_size, status, created_at")
      .eq("event_id", data.eventId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("listGuestRequests failed", error);
      return { requests: [] };
    }
    return { requests: (rows as GuestRequestRow[]) || [] };
  });

/**
 * Host/co-host: mark a request approved or dismissed, then tell the requester
 * what happened. Silence either way is not acceptable, so the notice is sent
 * whenever the contact they gave is an email address. Phone-only requesters
 * are flagged back to the host so they can text or call.
 */
export const resolveGuestRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(z
      .object({
        id: z.string().uuid(),
        status: z.enum(["approved", "dismissed"]),
        /** Approvals only: whether the party was seated or waitlisted. */
        outcome: z.enum(["confirmed", "waitlisted"]).optional(),
        /** Approvals only: amount their whole party owes, when payments are on. */
        amountDue: z.number().min(0).optional(),
      }), i, "guest-requests.functions.ts:150"),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; notified: boolean }> => {
    const { data: row, error: readErr } = await context.supabase
      .from("event_guest_requests")
      .select("id, event_id, name, contact, party_size")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr || !row) {
      throw new Error("Could not find that request.");
    }

    const { error } = await context.supabase
      .from("event_guest_requests")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) {
      console.error("resolveGuestRequest failed", error);
      throw new Error("Could not update that request.");
    }

    const contact = String((row as any).contact || "");
    if (!contact.includes("@")) return { ok: true, notified: false };

    try {
      const { data: ev } = await context.supabase
        .from("events")
        .select("data")
        .eq("id", (row as any).event_id)
        .maybeSingle();
      const eventData = (((ev as any)?.data) || {}) as Record<string, any>;
      const { partyPhrase, formatMoney } = await import("@/lib/guest-request-review");
      const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
      const { getRequestOrigin } = await import("@/lib/events-invites.server");
      const origin = getRequestOrigin();
      // Opt-in only: only a host who ticked "share my contact details" has them
      // printed in a guest-facing email.
      const hostContact = (eventData.hosts || [])
        .map((h: any) => (h?.showContact === true ? h?.email || h?.phone : ""))
        .find((c: any) => typeof c === "string" && c.length > 3);


      await enqueueTransactionalEmailServer({
        templateName:
          data.status === "approved" ? "guest-request-approved" : "guest-request-declined",
        recipientEmail: contact,
        idempotencyKey: `guest-request-${data.status}-${data.id}-${(row as any).party_size}`,
        label: `guest-request-${data.status}`,
        eventId: (row as any).event_id,
        templateData:
          data.status === "approved"
            ? {
                eventName: eventData.title || "the event",
                guestName: (row as any).name,
                partyPhrase: partyPhrase((row as any).party_size),
                amountDue: data.amountDue && data.amountDue > 0 ? formatMoney(data.amountDue) : "",
                waitlisted: data.outcome === "waitlisted",
                inviteUrl: `${origin}/invite/${(row as any).event_id}`,
              }
            : {
                eventName: eventData.title || "the event",
                guestName: (row as any).name,
                hostContact: hostContact || "",
              },
      });
      return { ok: true, notified: true };
    } catch (err) {
      console.error("guest-request outcome notice failed", err);
      return { ok: true, notified: false };
    }
  });

/** Public: self-add, only allowed when the host opened the guest list. */
export const selfAddGuest = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    parseInput(z
      .object({
        eventId: z.string().min(1).max(100),
        name: z.string().min(2).max(80),
        email: z.string().max(200).optional(),
        phone: z.string().max(40).optional(),
      }), i, "guest-requests.functions.ts:232"),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string; guestId?: string }> => {
    const supabasePublic = publicClient();
    const { data: res, error } = await (supabasePublic as any).rpc("public_self_add_guest", {
      _event_id: data.eventId,
      _name: data.name,
      _email: data.email ?? null,
      _phone: data.phone ?? null,
    });
    if (error) {
      console.error("public_self_add_guest failed", error);
      return { ok: false, reason: "failed" };
    }
    if (!res?.ok) return { ok: false, reason: String(res?.reason || "failed") };
    return { ok: true, guestId: String(res.guestId) };
  });
