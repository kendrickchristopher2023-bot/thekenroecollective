// Atelier AI cap enforcement for one-time passes.
// Order:
//  1) If user has an active Atelier subscription → allow (no counter).
//  2) Else if an attached Atelier pass exists for this event → atomically
//     consume one credit; return { code: "upgrade_atelier" } when exhausted.
//  3) Otherwise pass through — the existing has_ai_packages_access gate
//     already denied or subscription/entitlement covers it.
import type { SupabaseClient } from "@supabase/supabase-js";

export type AiCapResult =
  | { ok: true; remaining?: number }
  | { code: "upgrade_atelier"; error: string; used?: number; cap?: number }
  | { error: string };

export async function enforceAtelierAiCap(
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  eventId?: string | null,
): Promise<AiCapResult> {
  // 1) Active Atelier subscription short-circuits the counter.
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("price_id,status,current_period_end")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"]);
  const hasAtelier = (subs ?? []).some((s: any) => {
    const pid = String(s.price_id ?? "");
    if (!/atelier/i.test(pid)) return false;
    if (/trial/i.test(pid)) return false;
    const cpe = s.current_period_end ? new Date(s.current_period_end) : null;
    return !cpe || cpe > new Date();
  });
  if (hasAtelier) return { ok: true };

  if (!eventId) return { ok: true };

  // 2) Look for an attached Atelier pass on this event.
  const { data: pass } = await supabase
    .from("one_time_passes")
    .select("id,ai_generations_cap,ai_generations_used")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("tier", "atelier")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (!pass) return { ok: true };

  const { data: remaining, error } = await supabase.rpc("consume_ai_credit", {
    _pass_id: (pass as any).id,
    _user: userId,
  } as never);
  if (error) return { error: error.message };
  if (remaining == null) {
    return {
      code: "upgrade_atelier",
      error: "AI generation cap reached for this Atelier pass.",
      used: (pass as any).ai_generations_used ?? undefined,
      cap: (pass as any).ai_generations_cap ?? undefined,
    };
  }
  return { ok: true, remaining: Number(remaining) };
}
