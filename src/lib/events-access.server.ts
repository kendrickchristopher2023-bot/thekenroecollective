/**
 * Default-safe data-access layer for the `events` table.
 *
 * WHY THIS EXISTS
 * Demo/seed events live in the same database as production data (and, for
 * historical reasons, some of them are owned by a real account). Every
 * aggregate report used to have to *remember* to exclude them, which is
 * discipline rather than a boundary, so each new report leaked demo numbers.
 *
 * The default is now inverted: this accessor excludes demo rows unless a
 * caller opts in explicitly. Aggregate/reporting code must go through
 * `eventsReadQuery` instead of calling `.from("events")` directly. A guard
 * test (tests/unit/events-demo-boundary.test.ts) fails the build when a
 * reporting module bypasses it.
 *
 * Nothing here deletes, hides or mutates data: demo rows stay fully intact and
 * are still returned on demo surfaces.
 */

/** Which slice of events a caller wants. Omit for the safe production slice. */
export type EventsDemoMode = "production" | "demo" | "all";

export type EventsReadOptions = {
  /**
   * Explicit override. Leave unset to follow the current request
   * (production request -> production rows, demo request -> demo rows).
   */
  mode?: EventsDemoMode;
};

/** Resolve the slice for the current request unless the caller overrides it. */
export async function resolveEventsDemoMode(
  options: EventsReadOptions = {},
): Promise<EventsDemoMode> {
  if (options.mode) return options.mode;
  const { isDemoRequest } = await import("@/lib/demo-mode.server");
  return (await isDemoRequest()) ? "demo" : "production";
}

/**
 * Apply the demo boundary to an existing `events` query builder.
 * Marker-based, so it holds regardless of which account owns the row.
 */
export function applyEventsDemoFilter<T>(query: T, mode: EventsDemoMode): T {
  const q = query as any;
  if (mode === "demo") return q.eq("is_demo", true) as T;
  if (mode === "production") return q.eq("is_demo", false) as T;
  return query;
}

/**
 * The one blessed read path for the events table.
 *
 * ```ts
 * const { query } = await eventsReadQuery("id,user_id,data");
 * const { data } = await query.is("archived_at", null);
 * ```
 */
export async function eventsReadQuery(
  select: string,
  options: EventsReadOptions & { count?: "exact" } = {},
): Promise<{ mode: EventsDemoMode; isDemo: boolean; query: any }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const mode = await resolveEventsDemoMode(options);
  const base = options.count
    ? supabaseAdmin.from("events").select(select as never, { count: options.count })
    : supabaseAdmin.from("events").select(select as never);
  return { mode, isDemo: mode === "demo", query: applyEventsDemoFilter(base, mode) };
}
