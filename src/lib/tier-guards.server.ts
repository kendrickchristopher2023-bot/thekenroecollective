// Server-side tier resolution + gate helper used by every server function that
// must block Postcard (free) users from paid features. Single source of truth
// so the gates stay consistent across email, SMS, AI, exports, etc.

type Tier = "postcard" | "whisper" | "host" | "atelier";
const RANK: Record<Tier, number> = { postcard: 0, whisper: 1, host: 2, atelier: 3 };

function normalizeTier(raw: string | null | undefined): Tier {
  const t = String(raw ?? "").toLowerCase();
  if (!t) return "postcard";
  if (t.includes("atelier") || t.startsWith("studio_collective")) return "atelier";
  if (t.includes("host")) return "host";
  if (t.includes("whisper") || t === "whisper_onetime") return "whisper";
  return "postcard";
}

export interface ResolvedTier {
  tier: Tier;
  isOwner: boolean;
  isAdmin: boolean;
}

/**
 * Resolves the caller's effective tier. Owner/admin always considered
 * "atelier" for gate purposes. Falls back to `profiles.tier` when no active
 * subscription is found (covers whisper_onetime and manually set flags).
 */
export async function resolveUserTier(
  supabase: any,
  userId: string,
): Promise<ResolvedTier> {
  const [{ data: ownerFlag }, { data: adminFlag }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "owner" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  const isOwner = !!ownerFlag;
  const isAdmin = !!adminFlag;
  if (isOwner || isAdmin) return { tier: "atelier", isOwner, isAdmin };

  const [{ data: subs }, { data: profile }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("price_id,status,current_period_end")
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "past_due"]),
    supabase.from("profiles").select("tier").eq("id", userId).maybeSingle(),
  ]);
  const now = Date.now();
  let best: Tier = "postcard";
  for (const s of (subs as any[]) ?? []) {
    const stillActive = !s.current_period_end || new Date(s.current_period_end).getTime() > now;
    if (!stillActive) continue;
    const t = normalizeTier(s.price_id);
    if (RANK[t] > RANK[best]) best = t;
  }
  if (best === "postcard" && profile?.tier) {
    best = normalizeTier((profile as any).tier);
  }
  return { tier: best, isOwner, isAdmin };
}

export class UpgradeRequiredError extends Error {
  code = "upgrade_required" as const;
  status = 403;
  requiredTier: Tier;
  constructor(requiredTier: Tier, message?: string) {
    super(message ?? `Upgrade to ${requiredTier} required.`);
    this.requiredTier = requiredTier;
    this.name = "UpgradeRequiredError";
  }
  toResponse(): Response {
    return new Response(
      JSON.stringify({ code: this.code, requiredTier: this.requiredTier, message: this.message }),
      { status: this.status, headers: { "content-type": "application/json" } },
    );
  }
}

/**
 * Throws UpgradeRequiredError when the caller's resolved tier is below `min`.
 * Owner/admin always pass. Server functions catch by name/code on the client
 * to surface the UpgradeLimitModal.
 */
export async function assertMinTier(
  supabase: any,
  userId: string,
  min: Exclude<Tier, "postcard">,
  opts?: { message?: string },
): Promise<ResolvedTier> {
  const resolved = await resolveUserTier(supabase, userId);
  if (RANK[resolved.tier] < RANK[min]) {
    throw new UpgradeRequiredError(min, opts?.message);
  }
  return resolved;
}
