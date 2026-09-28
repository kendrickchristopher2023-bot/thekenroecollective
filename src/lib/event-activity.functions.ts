import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EventActivityEntry = {
  id: string;
  eventId: string;
  eventTitle: string;
  guestId: string | null;
  guestName: string | null;
  action: "guest.checked_in" | "guest.checked_out" | "walkin.added";
  actorType: "authenticated_user" | "door_link";
  actorUserId: string | null;
  actorLabel: string;
  heads: number | null;
  /** Where the guest is seated at this gathering, when a seating chart exists. */
  tableLabel: string | null;
  note: string | null;
  occurredAt: string;
};

export const listEventActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z.object({
      eventId: z.string().max(120).optional(),
      action: z.enum(["all", "guest.checked_in", "guest.checked_out", "walkin.added"]).default("all"),
      limit: z.number().int().min(1).max(500).default(200),
    }), input, "event-activity.functions.ts:25"),
  )
  .handler(async ({ data, context }): Promise<EventActivityEntry[]> => {
    const [{ data: isAdmin }, { data: isOwner }, { data: isSuperAdmin }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
    ]);
    if (!isAdmin && !isOwner && !isSuperAdmin) throw new Error("Admin or owner access required.");

    let query = context.supabase
      .from("event_activity_log")
      .select("id,event_id,guest_id,guest_name,action,actor_type,actor_user_id,details,occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(data.limit);
    if (data.eventId) query = query.eq("event_id", data.eventId);
    if (data.action !== "all") query = query.eq("action", data.action);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const eventIds = Array.from(new Set((rows ?? []).map((row) => row.event_id)));
    const actorIds = Array.from(new Set((rows ?? []).flatMap((row) => row.actor_user_id ? [row.actor_user_id] : [])));
    const [{ data: eventRows }, { data: profiles }] = await Promise.all([
      eventIds.length
        ? context.supabase.from("events").select("id,data").in("id", eventIds)
        : Promise.resolve({ data: [] as Array<{ id: string; data: unknown }> }),
      actorIds.length
        ? context.supabase.from("profiles").select("id,display_name").in("id", actorIds)
        : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null }> }),
    ]);
    // Seat location is resolved at read time from the gathering's seating chart
    // so the report shows the table a guest belongs to, not a stale snapshot.
    const seatMaps = new Map<string, Map<string, string>>();
    for (const row of eventRows ?? []) {
      const data = (row.data ?? {}) as {
        seatingTables?: Array<{ kind?: string; label?: string; guestIds?: string[] }>;
      };
      const seats = new Map<string, string>();
      for (const table of data.seatingTables ?? []) {
        if (table.kind === "element") continue;
        for (const guestId of table.guestIds ?? []) {
          if (guestId) seats.set(guestId, String(table.label || "Table"));
        }
      }
      seatMaps.set(row.id, seats);
    }
    const titles = new Map((eventRows ?? []).map((row) => [row.id, String((row.data as { title?: string } | null)?.title || "Untitled gathering")]));
    const names = new Map((profiles ?? []).map((row) => [row.id, row.display_name || "Signed-in user"]));

    return (rows ?? []).map((row) => {
      const details = (row.details ?? {}) as Record<string, unknown>;
      return {
        id: row.id,
        eventId: row.event_id,
        eventTitle: titles.get(row.event_id) ?? "Unknown gathering",
        guestId: row.guest_id,
        guestName: row.guest_name,
        action: row.action as EventActivityEntry["action"],
        actorType: row.actor_type as EventActivityEntry["actorType"],
        actorUserId: row.actor_user_id,
        actorLabel: row.actor_user_id ? names.get(row.actor_user_id) ?? "Signed-in user" : "Door check-in link",
        heads: typeof details.heads === "number" ? details.heads : null,
        tableLabel: (row.guest_id ? seatMaps.get(row.event_id)?.get(row.guest_id) : undefined) ?? null,
        note: typeof details.note === "string" && details.note ? details.note : null,
        occurredAt: row.occurred_at,
      };
    });
  });