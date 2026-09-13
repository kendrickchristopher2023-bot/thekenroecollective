import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Range = "7d" | "30d" | "90d" | "1y";

function sinceForRange(range: Range): string {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

type Input = { range?: Range; since?: string; until?: string } | undefined;

/**
 * Resolves an explicit custom window when provided, otherwise the preset
 * range. `until` is exclusive; callers pass the end of the selected day.
 */
function resolveWindow(data: NonNullable<Input>): { since: string; until: string } {
  const untilRaw = data.until ? new Date(data.until) : new Date();
  const until = Number.isNaN(untilRaw.getTime()) ? new Date() : untilRaw;
  if (data.since) {
    const s = new Date(data.since);
    if (!Number.isNaN(s.getTime())) return { since: s.toISOString(), until: until.toISOString() };
  }
  return { since: sinceForRange((data.range ?? "30d") as Range), until: until.toISOString() };
}

async function assertOwner(context: { supabase: any; userId: string }) {
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  await assertOwnerAccess(context.supabase, context.userId);
}

export const getOwnerAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { since, until } = resolveWindow(data);
    const { getDemoScope } = await import("@/lib/demo-accounts.server");
    const scope = await getDemoScope();
    const { data: snapshot, error } = await context.supabase.rpc(
      "owner_analytics_snapshot_v3" as any,
      {
        _since: since,
        _until: until,
        _exclude_user_ids: scope.excludeUserIds.length ? scope.excludeUserIds : null,
        _only_user_id: scope.onlyUserId,
      } as any,
    );
    if (error) throw new Error(error.message);
    return { range: data.range ?? "custom", since, until, snapshot, isDemo: scope.isDemo };
  });

export const getOwnerContactsAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { since, until } = resolveWindow(data);
    const { getDemoScope } = await import("@/lib/demo-accounts.server");
    const scope = await getDemoScope();
    const { data: snapshot, error } = await context.supabase.rpc(
      "owner_contacts_snapshot_v3" as any,
      {
        _since: since,
        _until: until,
        _exclude_user_ids: scope.excludeUserIds.length ? scope.excludeUserIds : null,
        _only_user_id: scope.onlyUserId,
      } as any,
    );
    if (error) throw new Error(error.message);
    return { range: data.range ?? "custom", since, until, snapshot, isDemo: scope.isDemo };
  });
