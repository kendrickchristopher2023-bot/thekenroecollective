/**
 * Server-side enforcement of the entrance plan gate.
 *
 * The picker warns a Whisper host that a premium entrance is preview only, but
 * the invitation payload is what guests actually read, so the gate has to hold
 * here too. A previous audit found features gated in the interface alone; this
 * closes that hole for entrances.
 */

import { gateEntrance, normalizeEntranceTier, type EntranceTier } from "@/lib/invite-entrances";

/** Small in-process cache so a shared invitation link is not one tier read per hit. */
const tierCache = new Map<string, { tier: EntranceTier; at: number }>();
const TTL_MS = 60_000;

async function ownerTier(ownerUserId: string): Promise<EntranceTier> {
  const hit = tierCache.get(ownerUserId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tier;

  let tier: EntranceTier = "postcard";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: ownerFlag }, { data: adminFlag }] = await Promise.all([
      supabaseAdmin.rpc("has_role", { _user_id: ownerUserId, _role: "owner" }),
      supabaseAdmin.rpc("has_role", { _user_id: ownerUserId, _role: "admin" }),
    ]);
    if (ownerFlag || adminFlag) {
      tier = "atelier";
    } else {
      const [{ data: subs }, { data: profile }] = await Promise.all([
        supabaseAdmin
          .from("subscriptions")
          .select("price_id,status,current_period_end")
          .eq("user_id", ownerUserId)
          .in("status", ["active", "trialing", "past_due"]),
        supabaseAdmin.from("profiles").select("tier").eq("id", ownerUserId).maybeSingle(),
      ]);
      const now = Date.now();
      const ranks: EntranceTier[] = ["postcard", "whisper", "host", "atelier"];
      const rankOf = (t: EntranceTier) => ranks.indexOf(t);
      for (const s of (subs as { price_id?: string; current_period_end?: string }[]) ?? []) {
        const live =
          !s.current_period_end || new Date(s.current_period_end).getTime() > now;
        if (!live) continue;
        const t = normalizeEntranceTier(s.price_id);
        if (rankOf(t) > rankOf(tier)) tier = t;
      }
      if (tier === "postcard" && (profile as { tier?: string } | null)?.tier) {
        tier = normalizeEntranceTier((profile as { tier?: string }).tier);
      }
    }
  } catch {
    // A tier lookup failure must never break an invitation. The included
    // envelope reveal is the safe answer.
    tier = "postcard";
  }
  tierCache.set(ownerUserId, { tier, at: Date.now() });
  return tier;
}

/**
 * Rewrites `inviteAnimation` on a public event blob to what the host's plan
 * actually allows. Call BEFORE the sanitizer strips `_ownerUserId`.
 */
export async function applyEntranceGate<T extends Record<string, unknown>>(row: T): Promise<T> {
  if (!row || typeof row !== "object") return row;
  const requested = row["inviteAnimation"] as string | undefined;
  if (!requested) return row;
  const owner = row["_ownerUserId"];
  if (typeof owner !== "string" || !owner) {
    return { ...row, inviteAnimation: gateEntrance(requested, "postcard") };
  }
  const tier = await ownerTier(owner);
  return { ...row, inviteAnimation: gateEntrance(requested, tier) };
}
