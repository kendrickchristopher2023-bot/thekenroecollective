/**
 * Host-facing in-app notifications (the header bell for regular hosts).
 *
 * Rows are written server-side, one per recipient, so RLS only needs to scope
 * reads and read-state updates to the signed-in user.
 */
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface HostNotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read: boolean;
}

export const listHostNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HostNotificationItem[]> => {
    const { data, error } = await context.supabase
      .from("host_notifications")
      .select("id, kind, title, body, link, created_at, read_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return (data as any[]).map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      created_at: n.created_at,
      read: !!n.read_at,
    }));
  });

export const markHostNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ id: z.string().uuid() }), i, "host-notifications.functions.ts:43"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("host_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id);
    return { ok: !error };
  });

export const dismissHostNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ id: z.string().uuid() }), i, "host-notifications.functions.ts:54"))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("host_notifications")
      .delete()
      .eq("id", data.id);
    return { ok: !error };
  });
