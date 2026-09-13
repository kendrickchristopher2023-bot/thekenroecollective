// Fire-and-forget material-use stamping for one-time passes.
// Called from every delivery action (invitation, SMS, AI gen, export,
// announcement, check-in) so the 24h refund engine can tell whether a pass
// was actually consumed. Failures are logged but never break the caller.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function markMaterialUse(
  supabase: SupabaseClient<any, any, any>,
  eventId: string | null | undefined,
  reason: string,
  userId?: string,
): Promise<void> {
  if (!eventId) return;
  try {
    // Uses the auth'd supabase client — RLS on one_time_passes limits
    // scope to the caller's own passes via the SECURITY DEFINER RPC.
    await supabase.rpc("mark_pass_material_use", {
      _user: userId ?? null,
      _event_id: eventId,
      _reason: reason,
    } as never);
  } catch (err) {
    console.warn("markMaterialUse failed (non-blocking)", { eventId, reason, err });
  }
}

/** Service-role variant for cron / server-role paths where there's no user. */
export async function markMaterialUseByEventServiceRole(
  eventId: string | null | undefined,
  reason: string,
): Promise<void> {
  if (!eventId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("mark_pass_material_use_by_event", {
      _event_id: eventId,
      _reason: reason,
    } as never);
  } catch (err) {
    console.warn("markMaterialUseByEventServiceRole failed (non-blocking)", { eventId, reason, err });
  }
}
