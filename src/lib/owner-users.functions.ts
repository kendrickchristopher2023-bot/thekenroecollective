import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StripeEnv } from "@/lib/stripe.server";

async function assertOwner(supabase: any, userId: string) {
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  await assertOwnerAccess(supabase, userId);
}

export type OwnerTier = "postcard" | "whisper" | "host" | "atelier";
const TIERS: OwnerTier[] = ["postcard", "whisper", "host", "atelier"];

const ACTIVE_STATUSES = ["active", "trialing", "past_due"];

function isManualSub(id: string | null | undefined): boolean {
  return !id || id.startsWith("manual_");
}

function tierFromPriceId(priceId: string | null | undefined): OwnerTier {
  const t = String(priceId ?? "").toLowerCase();
  if (t.includes("atelier")) return "atelier";
  if (t.includes("host")) return "host";
  if (t.includes("whisper")) return "whisper";
  return "postcard";
}

function safeRedirect(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return undefined;
    if (!/(^|\.)(kenroes|kenroecollective|thekenroecollective)\.com$|\.lovable\.app$/.test(u.hostname)) {
      return undefined;
    }
    return u.origin;
  } catch {
    return undefined;
  }
}

export type OwnerUserRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  confirmed: boolean;
  banned_until: string | null;
  profile_tier: OwnerTier;
  effective_tier: OwnerTier;
  roles: string[];
  active_subscriptions: {
    id: string;
    price_id: string;
    status: string;
    environment: string;
    manual: boolean;
    /** When this plan lapses. Null means open-ended. */
    ends_at: string | null;
  }[];

};

export type OwnerUsersResult = {
  rows: OwnerUserRow[];
  total: number;
  /** True only if the auth directory exceeded the hard paging ceiling. */
  truncated: boolean;
};

export const listUsersAsOwner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OwnerUsersResult> => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Previously this stopped after 5 pages (1,000 users) and silently dropped
    // everyone after that. The directory helper pages to completion.
    const { listAllAuthUsers } = await import("@/lib/admin-directory.server");
    const { users: everyone, truncated } = await listAllAuthUsers();

    // The demo host and the sample-wedding system account are ours, not
    // customers, so they are left out of the directory and its total.
    const { getDemoUserIds } = await import("@/lib/demo-accounts.server");
    const systemIds = new Set(await getDemoUserIds().catch(() => [] as string[]));
    const users = everyone.filter((u) => !systemIds.has(u.id));

    const ids = users.map((u) => u.id);
    const guard = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];

    const [{ data: profiles }, { data: subs }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, tier").in("id", guard),
      supabaseAdmin
        .from("subscriptions")
        .select("id, user_id, price_id, status, environment, stripe_subscription_id, current_period_end")
        .in("user_id", guard),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", guard),
    ]);

    const profileMap = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
    const roleMap = new Map<string, string[]>();
    for (const r of (roles ?? []) as any[]) {
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    }
    const subMap = new Map<string, any[]>();
    for (const s of (subs ?? []) as any[]) {
      subMap.set(s.user_id, [...(subMap.get(s.user_id) ?? []), s]);
    }

    const now = Date.now();
    const rank: Record<OwnerTier, number> = { postcard: 0, whisper: 1, host: 2, atelier: 3 };

    const rows: OwnerUserRow[] = users.map((u) => {
      const profile = profileMap.get(u.id);
      const profileTier = TIERS.includes(profile?.tier) ? (profile.tier as OwnerTier) : "postcard";
      const mine = (subMap.get(u.id) ?? []).filter(
        (s) =>
          ACTIVE_STATUSES.includes(s.status) &&
          (!s.current_period_end || new Date(s.current_period_end).getTime() > now),
      );
      let effective = profileTier;
      for (const s of mine) {
        const t = tierFromPriceId(s.price_id);
        if (rank[t] > rank[effective]) effective = t;
      }
      return {
        user_id: u.id,
        email: u.email ?? null,
        display_name: profile?.display_name ?? null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        confirmed: !!(u.email_confirmed_at || u.confirmed_at),
        banned_until: (u as any).banned_until ?? null,
        profile_tier: profileTier,
        effective_tier: effective,
        roles: roleMap.get(u.id) ?? [],
        active_subscriptions: mine.map((s) => ({
          id: s.id,
          price_id: s.price_id,
          status: s.status,
          environment: s.environment,
          manual: isManualSub(s.stripe_subscription_id),
          ends_at: s.current_period_end ?? null,

        })),
      };
    });

    return { rows, total: rows.length, truncated };
  });

type InviteResult = { ok: true; userId: string; invited: boolean } | { error: string };

export const inviteUserAsOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { email: string; displayName?: string; tier?: OwnerTier; redirectTo?: string }) => {
      if (!data.email?.trim()) throw new Error("Email is required");
      if (data.tier && !TIERS.includes(data.tier)) throw new Error("Invalid tier");
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<InviteResult> => {
    const { supabase, userId } = context;
    const { assertNotDemo } = await import("@/lib/demo-mode.server");
    await assertNotDemo("inviting users");
    await assertOwner(supabase, userId);


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const redirectTo = safeRedirect(data.redirectTo);

    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      ...(redirectTo ? { redirectTo } : {}),
      data: data.displayName ? { display_name: data.displayName.trim() } : undefined,
    });
    if (error || !invited?.user) {
      return { error: error?.message || "Failed to send invitation" };
    }

    const newUserId = invited.user.id;
    if (data.displayName?.trim()) {
      await supabaseAdmin
        .from("profiles")
        .update({ display_name: data.displayName.trim() })
        .eq("id", newUserId);
    }
    if (data.tier && data.tier !== "postcard") {
      await (await import("@/lib/owner-tier.server")).applyTier(supabaseAdmin, newUserId, data.tier);
    }
    return { ok: true, userId: newUserId, invited: true };
  });


type ChangeTierResult = { ok: true; tier: OwnerTier; warnings: string[] } | { error: string };

export const changeUserTierAsOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; tier: OwnerTier }) => {
    if (!data.userId) throw new Error("User is required");
    if (!TIERS.includes(data.tier)) throw new Error("Invalid tier");
    return data;
  })
  .handler(async ({ data, context }): Promise<ChangeTierResult> => {
    const { supabase, userId } = context;
    const { assertNotDemo } = await import("@/lib/demo-mode.server");
    await assertNotDemo("changing user tiers");
    await assertOwner(supabase, userId);


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const warnings = await (await import("@/lib/owner-tier.server")).applyTier(supabaseAdmin, data.userId, data.tier);
      return { ok: true, tier: data.tier, warnings };
    } catch (e: any) {
      return { error: e?.message || "Failed to change tier" };
    }
  });

/* ------------------------------------------------------------------ *
 * Super admin (Christopher only) — privileged role management.
 * Gated on has_role(auth.uid(), 'super_admin'), never on 'owner'.
 * ------------------------------------------------------------------ */

export const meIsSuperAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ isSuperAdmin: boolean }> => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    return { isSuperAdmin: !!data };
  });

export type ManagedRole = "owner" | "admin";

type SetRoleResult = { ok: true } | { error: string };

export const setUserRoleAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; role: ManagedRole; grant: boolean }) => {
    if (!data.userId) throw new Error("User is required");
    if (data.role !== "owner" && data.role !== "admin") throw new Error("Invalid role");
    return data;
  })
  .handler(async ({ data, context }): Promise<SetRoleResult> => {
    // The RPC itself re-checks super_admin, so privilege can't be bypassed
    // by calling it directly through the API.
    const { assertNotDemo } = await import("@/lib/demo-mode.server");
    await assertNotDemo("granting roles");

    const { error } = await context.supabase.rpc("super_admin_set_role", {
      _target_user_id: data.userId,
      _role: data.role,
      _grant: data.grant,
    });
    if (error) return { error: error.message };
    return { ok: true };
  });
