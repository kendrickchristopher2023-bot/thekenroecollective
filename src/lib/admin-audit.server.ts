// Shared audit trail for owner/admin actions that cross normal ownership
// boundaries. Writing an audit row must never block a permitted action, so
// every helper here swallows its own errors.

/** Inserts one admin_audit_log row. Best effort. */
export async function logAdminAction(args: {
  actorUserId: string;
  action: string;
  targetUserId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: actor } = await (supabaseAdmin as any).auth.admin.getUserById(args.actorUserId);
    await (supabaseAdmin as any).from("admin_audit_log").insert({
      actor_user_id: args.actorUserId,
      actor_email: actor?.user?.email ?? null,
      action: args.action,
      target_user_id: args.targetUserId ?? null,
      details: args.details ?? {},
    });
  } catch {
    /* ignore */
  }
}

/**
 * Logs an event mutation performed by an owner/admin on events they don't
 * personally own. Events the actor owns are skipped: those are ordinary edits.
 */
export async function logAdminEventAction(args: {
  sb: any;
  actorUserId: string;
  action: string;
  eventIds: string[];
}): Promise<void> {
  try {
    const { data: rows } = await args.sb
      .from("events")
      .select("id,user_id,data")
      .in("id", args.eventIds.slice(0, 500));
    const foreign = (rows ?? []).filter(
      (r: { user_id: string | null }) => r.user_id !== args.actorUserId,
    );
    if (!foreign.length) return;
    for (const r of foreign) {
      await logAdminAction({
        actorUserId: args.actorUserId,
        action: args.action,
        targetUserId: r.user_id ?? null,
        details: {
          event_id: r.id,
          event_title: (r.data as any)?.title ?? null,
          event_owner_user_id: r.user_id ?? null,
        },
      });
    }
  } catch {
    /* ignore */
  }
}
