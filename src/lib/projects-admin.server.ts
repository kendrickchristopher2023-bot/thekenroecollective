/**
 * Shared query core for the owner/admin "All projects" console: SQL-side
 * filtering, sorting and pagination, plus a single directory lookup for owner
 * emails instead of one auth call per row.
 */
import { withoutAccounts } from "@/lib/owner-account-filter";
import type {
  AdminProjectLinked,
  AdminProjectRow,
  AdminProjectScope,
  AdminProjectSort,
} from "@/lib/projects-admin.types";

export type { AdminProjectRow, AdminProjectScope, AdminProjectSort };

export type AdminProjectQuery = {
  search: string;
  ownerEmail: string;
  scope: AdminProjectScope;
  linked: AdminProjectLinked;
  sort: AdminProjectSort;
  offset: number;
  limit: number;
};

const SORTS: Record<AdminProjectSort, { column: string; ascending: boolean }> = {
  updated_desc: { column: "updated_at", ascending: false },
  updated_asc: { column: "updated_at", ascending: true },
  created_desc: { column: "created_at", ascending: false },
  created_asc: { column: "created_at", ascending: true },
  name_asc: { column: "name", ascending: true },
  name_desc: { column: "name", ascending: false },
};

export async function queryAdminProjects(
  q: AdminProjectQuery,
): Promise<{ rows: AdminProjectRow[]; total: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { emailById, userIdsByEmailSearch } = await import("@/lib/admin-directory.server");

  const sort = SORTS[q.sort] ?? SORTS.updated_desc;
  let query = supabaseAdmin
    .from("pm_projects")
    .select(
      "id,owner_user_id,name,description,color,event_id,language,archived_at,created_at,updated_at",
      { count: "exact" },
    )
    .order(sort.column as never, { ascending: sort.ascending, nullsFirst: false })
    .range(q.offset, q.offset + q.limit - 1);

  if (q.scope === "active") query = query.is("archived_at" as never, null);
  else if (q.scope === "archived") query = query.not("archived_at" as never, "is", null);

  if (q.linked === "linked") query = query.not("event_id" as never, "is", null);
  else if (q.linked === "unlinked") query = query.is("event_id" as never, null);

  const s = q.search.trim();
  if (s) {
    const like = `%${s}%`;
    query = query.or(
      `id.ilike.${like},name.ilike.${like},description.ilike.${like},event_id.ilike.${like}`,
    );
  }

  // Sample boards belonging to the demo host or the sample-wedding account are
  // demonstration material, so they stay out of the console and its total.
  const { getDemoUserIds } = await import("@/lib/demo-accounts.server");
  const systemIds = await getDemoUserIds().catch(() => [] as string[]);
  if (systemIds.length) {
    query = withoutAccounts(query as any, "owner_user_id", systemIds);
  }

  const oe = q.ownerEmail.trim();
  if (oe) {
    const ids = await userIdsByEmailSearch(oe);
    if (ids.length === 0) return { rows: [], total: 0 };
    query = query.in("owner_user_id" as never, ids as never);
  }

  const { data: rows, error, count } = await query;
  if (error) throw new Error(error.message);

  const list = (rows ?? []) as any[];
  const ids = list.map((r) => r.id);
  const userIds = Array.from(new Set(list.map((r) => r.owner_user_id).filter(Boolean))) as string[];

  const profiles = new Map<string, string | null>();
  if (userIds.length) {
    const { data: ps } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name")
      .in("id", userIds);
    for (const p of ps ?? []) profiles.set(p.id, p.display_name);
  }
  const emails = userIds.length ? await emailById() : new Map<string, string | null>();

  const taskCounts: Record<string, number> = {};
  const memberCounts: Record<string, number> = {};
  if (ids.length) {
    const { data: ts } = await supabaseAdmin
      .from("pm_tasks")
      .select("project_id")
      .in("project_id", ids);
    for (const t of ts ?? []) taskCounts[t.project_id] = (taskCounts[t.project_id] ?? 0) + 1;
    const { data: ms } = await supabaseAdmin
      .from("pm_project_members")
      .select("project_id")
      .in("project_id", ids);
    for (const m of ms ?? []) memberCounts[m.project_id] = (memberCounts[m.project_id] ?? 0) + 1;
  }

  return {
    total: count ?? list.length,
    rows: list.map((r) => ({
      id: r.id,
      owner_user_id: r.owner_user_id,
      name: r.name,
      description: r.description ?? null,
      color: r.color ?? null,
      event_id: r.event_id ?? null,
      language: r.language ?? null,
      archived_at: r.archived_at ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      owner_email: r.owner_user_id ? emails.get(r.owner_user_id) ?? null : null,
      owner_display_name: r.owner_user_id ? profiles.get(r.owner_user_id) ?? null : null,
      task_count: taskCounts[r.id] ?? 0,
      member_count: (memberCounts[r.id] ?? 0) + 1, // include owner
    })),
  };
}
