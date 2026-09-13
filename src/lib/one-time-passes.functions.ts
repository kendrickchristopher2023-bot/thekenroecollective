// Server functions for one-time single-event passes (Host $49, Atelier $99).
// A pass is granted server-side by the Stripe webhook (or confirmCheckoutSession).
// Users then attach it to a single event. Once attached, the pass grants the
// tier's features for that event through `getEventEntitlements`.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OneTimePass = {
  id: string;
  tier: "whisper" | "host" | "atelier";
  event_id: string | null;
  purchased_at: string;
  attached_at: string | null;
  expires_at: string;
  ai_generations_used: number;
  ai_generations_cap: number | null;
  environment: string;
  price_id: string | null;
  first_material_use_at?: string | null;
  refunded_at?: string | null;
  revoked_at?: string | null;
};

/** List the caller's one-time passes (both attached and unattached). */
export const listMyPasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OneTimePass[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("one_time_passes")
      .select("id,tier,event_id,purchased_at,attached_at,expires_at,ai_generations_used,ai_generations_cap,environment,price_id,first_material_use_at,refunded_at,revoked_at")
      .eq("user_id", userId)
      .order("purchased_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as OneTimePass[];
  });

/**
 * Attach an unattached pass to an event. Idempotent for the same
 * (pass, event) pair; refuses to move a pass to a second event.
 * Recomputes expires_at = min(event_date + 90d, purchased_at + 12mo).
 */
export const attachPassToEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({
      passId: z.string().uuid(),
      eventId: z.string().min(1).max(120),
    }), data, "one-time-passes.functions.ts:47"),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; expiresAt: string } | { error: string }> => {
    const { supabase } = context;

    // All ownership checks, expiry math, and the write happen inside the
    // vetted SECURITY DEFINER function so users cannot change tier,
    // expiry, or AI credit caps on their own pass rows.
    const { data: result, error } = await supabase.rpc("attach_pass_to_event", {
      _pass_id: data.passId,
      _event_id: data.eventId,
    });
    if (error) return { error: error.message };
    const row = (result ?? {}) as { ok?: boolean; expiresAt?: string; error?: string };
    if (row.error) return { error: row.error };
    if (!row.ok || !row.expiresAt) return { error: "Could not attach this pass." };
    return { ok: true, expiresAt: row.expiresAt };
  });


/**
 * Look up the active pass (if any) attached to a specific event for the
 * calling user, and return the tier + AI usage/cap. Used by the UI to
 * show badges and by AI code paths to check cap before generating.
 */
export const getEventPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({ eventId: z.string().min(1).max(120) }), data, "one-time-passes.functions.ts:78"),
  )
  .handler(async ({ data, context }): Promise<OneTimePass | null> => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("one_time_passes")
      .select("id,tier,event_id,purchased_at,attached_at,expires_at,ai_generations_used,ai_generations_cap,environment,price_id,first_material_use_at,refunded_at,revoked_at")
      .eq("user_id", userId)
      .eq("event_id", data.eventId)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("attached_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as OneTimePass | null) ?? null;
  });

/**
 * Consume one AI generation credit against an Atelier pass. Atomic via
 * `public.consume_ai_credit` — returns remaining credits, or 0 when the
 * cap is exhausted / the pass is expired. Callers should upsell to the
 * Atelier subscription when this returns null/0.
 */
export const consumePassAiCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z.object({ passId: z.string().uuid() }), data, "one-time-passes.functions.ts:105"),
  )
  .handler(async ({ data, context }): Promise<{ remaining: number } | { error: string; code?: string }> => {
    const { supabase, userId } = context;
    const { data: remaining, error } = await supabase.rpc("consume_ai_credit", {
      _pass_id: data.passId,
      _user: userId,
    });
    if (error) return { error: error.message };
    if (remaining == null) return { error: "AI generation cap reached for this pass.", code: "upgrade_atelier" };
    return { remaining: Number(remaining) };
  });
