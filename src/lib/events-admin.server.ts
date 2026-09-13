/**
 * Shared query core for the owner/admin "All events" console.
 *
 * Filtering, sorting and pagination all happen in SQL so the console never
 * relies on a client-side slice of a truncated 200-row page.
 */
import type {
  AdminEventDemoFilter,
  AdminEventRow,
  AdminEventScope,
  AdminEventSort,
  Json,
} from "@/lib/events-admin.types";

export type { AdminEventRow, AdminEventScope, AdminEventSort, AdminEventDemoFilter };

export type AdminEventQuery = {
  search: string;
  hostEmail: string;
  scope: AdminEventScope;
  demo: AdminEventDemoFilter;
  sort: AdminEventSort;
  offset: number;
  limit: number;
};

const SORTS: Record<AdminEventSort, { column: string; ascending: boolean }> = {
  updated_desc: { column: "updated_at", ascending: false },
  updated_asc: { column: "updated_at", ascending: true },
  created_desc: { column: "created_at", ascending: false },
  created_asc: { column: "created_at", ascending: true },
  title_asc: { column: "data->>title", ascending: true },
  title_desc: { column: "data->>title", ascending: false },
};

export async function queryAdminEvents(
  q: AdminEventQuery,
): Promise<{ rows: AdminEventRow[]; total: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getDemoScope } = await import("@/lib/demo-accounts.server");
  const { emailById, userIdsByEmailSearch } = await import("@/lib/admin-directory.server");
  const scope = await getDemoScope();

  const sort = SORTS[q.sort] ?? SORTS.updated_desc;
  let query = supabaseAdmin
    .from("events")
    .select("id,user_id,branded_slug,data,created_at,updated_at,archived_at,is_demo", {
      count: "exact",
    })
    .order(sort.column as never, { ascending: sort.ascending, nullsFirst: false })
    .range(q.offset, q.offset + q.limit - 1);

  // Production and the demo share one database: keep demo-owned events out of
  // the production console, and show only demo events on the demo host.
  if (scope.onlyUserId) {
    query = query.eq("user_id" as never, scope.onlyUserId as never);
  } else {
    if (q.demo === "production") {
      query = query.eq("is_demo" as never, false as never);
      for (const id of scope.excludeUserIds) query = query.neq("user_id" as never, id as never);
    } else if (q.demo === "demo") {
      query = query.eq("is_demo" as never, true as never);
    }
  }

  if (q.scope === "active") query = query.is("archived_at" as never, null);
  else if (q.scope === "archived") query = query.not("archived_at" as never, "is", null);

  const s = q.search.trim();
  if (s) {
    const like = `%${s}%`;
    query = query.or(
      `id.ilike.${like},branded_slug.ilike.${like},data->>title.ilike.${like},data->>hostName.ilike.${like}`,
    );
  }

  const he = q.hostEmail.trim();
  if (he) {
    const ids = await userIdsByEmailSearch(he);
    if (ids.length === 0) return { rows: [], total: 0 };
    query = query.in("user_id" as never, ids as never);
  }

  const { data: rows, error, count } = await query;
  if (error) throw new Error(error.message);

  const list = (rows ?? []) as any[];
  const userIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
  const profiles = new Map<string, string | null>();
  if (userIds.length) {
    const { data: ps } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name")
      .in("id", userIds);
    for (const p of ps ?? []) profiles.set(p.id, p.display_name);
  }
  const emails = userIds.length ? await emailById() : new Map<string, string | null>();

  return {
    total: count ?? list.length,
    rows: list.map((r) => ({
      id: r.id,
      user_id: r.user_id ?? null,
      branded_slug: r.branded_slug ?? null,
      data: (r.data ?? {}) as Json,
      created_at: r.created_at,
      updated_at: r.updated_at,
      archived_at: r.archived_at ?? null,
      is_demo: Boolean(r.is_demo),
      owner_email: r.user_id ? emails.get(r.user_id) ?? null : null,
      owner_display_name: r.user_id ? profiles.get(r.user_id) ?? null : null,
    })),
  };
}
