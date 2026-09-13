// Owner-only first-party error monitoring.
//
// logAppError is intentionally unauthenticated (guests hit errors too) and
// insert-only; the RLS policy on app_error_logs allows anon INSERT and grants
// SELECT/UPDATE to owners only.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { insertErrorLog } from "@/lib/error-monitoring.server";

// The logger must never be the thing that throws. Over-long fields are
// truncated rather than rejected, so a long error message can still be
// recorded instead of raising a second, more confusing error.
const cap = (n: number) =>
  z
    .string()
    .transform((s) => (s.length > n ? s.slice(0, n) : s))
    .catch("");

const LogInput = z.object({
  message: cap(2000),
  errorName: cap(200).optional().nullable(),
  stack: cap(8000).optional().nullable(),
  route: cap(500).optional().nullable(),
  source: cap(60).optional().nullable(),
  userAgent: cap(500).optional().nullable(),
  release: cap(120).optional().nullable(),
});


export const logAppError = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => parseInput(LogInput, input, "error-monitoring.functions.ts:32"))
  .handler(async ({ data }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const host = getRequestHeader("host") ?? null;
    await insertErrorLog({ ...data, host });
    return { ok: true };
  });

async function assertOwner(context: { supabase: any; userId: string }) {
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  await assertOwnerAccess(context.supabase, context.userId);
}

const RangeInput = z.object({
  since: z.string().optional(),
  until: z.string().optional(),
  status: z.string().optional(),
});

export type ErrorGroup = {
  fingerprint: string;
  message: string;
  error_name: string;
  count: number;
  first_seen: string;
  last_seen: string;
  routes: string[];
  sources: string[];
  resolved: boolean;
  latest_stack: string | null;
  latest_user_agent: string | null;
  latest_user_id: string | null;
  environments: string[];
};

/** Owner-only. Groups raw rows by fingerprint for the console. */
export const listErrorGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => parseInput(RangeInput, input ?? {}, "error-monitoring.functions.ts:68"))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const since = data.since ?? new Date(Date.now() - 7 * 864e5).toISOString();
    const until = data.until ?? new Date().toISOString();

    const { data: rows, error } = await context.supabase
      .from("app_error_logs")
      .select(
        "id,created_at,fingerprint,error_name,message,stack,route,source,environment,user_id,user_agent,resolved_at",
      )
      .gte("created_at", since)
      .lt("created_at", until)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const groups = new Map<string, ErrorGroup>();
    for (const r of (rows as any[]) ?? []) {
      const existing = groups.get(r.fingerprint);
      if (!existing) {
        groups.set(r.fingerprint, {
          fingerprint: r.fingerprint,
          message: r.message,
          error_name: r.error_name,
          count: 1,
          first_seen: r.created_at,
          last_seen: r.created_at,
          routes: r.route ? [r.route] : [],
          sources: r.source ? [r.source] : [],
          resolved: !!r.resolved_at,
          latest_stack: r.stack ?? null,
          latest_user_agent: r.user_agent ?? null,
          latest_user_id: r.user_id ?? null,
          environments: r.environment ? [r.environment] : [],
        });
        continue;
      }
      existing.count += 1;
      if (r.created_at < existing.first_seen) existing.first_seen = r.created_at;
      if (r.created_at > existing.last_seen) existing.last_seen = r.created_at;
      if (r.route && !existing.routes.includes(r.route)) existing.routes.push(r.route);
      if (r.source && !existing.sources.includes(r.source)) existing.sources.push(r.source);
      if (r.environment && !existing.environments.includes(r.environment)) {
        existing.environments.push(r.environment);
      }
      // Any unresolved occurrence keeps the group open.
      if (!r.resolved_at) existing.resolved = false;
    }

    let list = Array.from(groups.values());
    if (data.status === "unresolved") list = list.filter((g) => !g.resolved);
    if (data.status === "resolved") list = list.filter((g) => g.resolved);
    list.sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));

    const totalRows = ((rows as any[]) ?? []).length;
    const dayAgo = Date.now() - 864e5;
    const last24h = ((rows as any[]) ?? []).filter(
      (r) => new Date(r.created_at).getTime() >= dayAgo,
    ).length;

    return {
      since,
      until,
      totals: {
        occurrences: totalRows,
        last24h,
        groups: groups.size,
        unresolvedGroups: Array.from(groups.values()).filter((g) => !g.resolved).length,
      },
      groups: list,
    };
  });

/** Owner-only. Recent raw occurrences for one fingerprint. */
export const getErrorGroupDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z.object({ fingerprint: z.string().min(1).max(200) }), input, "error-monitoring.functions.ts:146"),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { data: rows, error } = await context.supabase
      .from("app_error_logs")
      .select(
        "id,created_at,error_name,message,stack,route,source,environment,release,user_id,user_agent,resolved_at",
      )
      .eq("fingerprint", data.fingerprint)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);
    return { occurrences: (rows as any[]) ?? [] };
  });

/** Owner-only. Marks every occurrence in a group resolved (or reopens it). */
export const setErrorGroupResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    parseInput(z.object({ fingerprint: z.string().min(1).max(200), resolved: z.boolean() }), input, "error-monitoring.functions.ts:166"),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const patch = data.resolved
      ? { resolved_at: new Date().toISOString(), resolved_by: context.userId }
      : { resolved_at: null, resolved_by: null };
    const { error } = await context.supabase
      .from("app_error_logs")
      .update(patch as any)
      .eq("fingerprint", data.fingerprint);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
