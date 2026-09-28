// Counts of guest-left notes (invitation comments + well wishes) per event, so
// the dashboard and the event editor can badge them without loading every row.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseInput } from "@/lib/user-error";
import { nullSafe } from "@/lib/zod-nullsafe";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface GuestNoteCounts {
  unreadComments: number;
  comments: number;
  wishes: number;
}

export const fetchGuestNoteCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(nullSafe(z
      .object({ eventIds: z.array(z.string().min(1).max(120)).max(100) })), input, "input"),
  )
  .handler(async ({ data, context }): Promise<Record<string, GuestNoteCounts>> => {
    const out: Record<string, GuestNoteCounts> = {};
    if (data.eventIds.length === 0) return out;
    for (const id of data.eventIds) out[id] = { unreadComments: 0, comments: 0, wishes: 0 };

    const [comments, wishes] = await Promise.all([
      context.supabase
        .from("event_comments")
        .select("event_id,author_role,host_read_at")
        .in("event_id", data.eventIds)
        .is("removed_at", null),
      context.supabase
        .from("event_well_wishes")
        .select("event_id")
        .in("event_id", data.eventIds),
    ]);

    for (const row of (comments.data ?? []) as Array<{
      event_id: string;
      author_role: string | null;
      host_read_at: string | null;
    }>) {
      const bucket = out[row.event_id];
      if (!bucket) continue;
      if (row.author_role !== "guest") continue;
      bucket.comments += 1;
      if (!row.host_read_at) bucket.unreadComments += 1;
    }
    for (const row of (wishes.data ?? []) as Array<{ event_id: string }>) {
      const bucket = out[row.event_id];
      if (bucket) bucket.wishes += 1;
    }
    return out;
  });
