import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureAdminOrOwner } from "./notifications.server";

export interface AdminNotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read: boolean;
}


export const listAdminNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminNotificationItem[]> => {
    const { supabase, userId } = context;
    if (!(await ensureAdminOrOwner(supabase, userId))) return [];

    const { data: notes, error } = await supabase
      .from("admin_notifications")
      .select("id, kind, title, body, link, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !notes) return [];

    const { data: reads } = await supabase
      .from("admin_notification_reads")
      .select("notification_id")
      .eq("user_id", userId);
    const readSet = new Set((reads ?? []).map((r: any) => r.notification_id));

    return notes.map((n: any) => ({ ...n, read: readSet.has(n.id) }));
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("admin_notification_reads")
      .upsert({ notification_id: data.id, user_id: userId });
    return { ok: !error };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await ensureAdminOrOwner(supabase, userId))) return { ok: false };
    const { data: notes } = await supabase
      .from("admin_notifications")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!notes?.length) return { ok: true };
    const rows = notes.map((n: any) => ({ notification_id: n.id, user_id: userId }));
    const { error } = await supabase
      .from("admin_notification_reads")
      .upsert(rows, { onConflict: "notification_id,user_id" });
    return { ok: !error };
  });
