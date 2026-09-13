import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertOwnerOrAdmin(ctx: { supabase: any; userId: string }) {
  // Owner-type accounts must satisfy mandatory MFA; plain admins are unaffected.
  const g = await import("@/lib/owner-guard.server");
  if (await g.hasOwnerRole(ctx.supabase, ctx.userId)) {
    await g.assertOwnerMfaSatisfied(ctx.supabase, ctx.userId);
    return;
  }
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

export type { Json, AdminEventRow } from "@/lib/events-admin.types";

export const meCanAdminEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: isOwner }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    return { allowed: Boolean(isOwner || isAdmin), isOwner: Boolean(isOwner), isAdmin: Boolean(isAdmin) };
  });

const PageInput = z.object({
  search: z.string().optional().default(""),
  hostEmail: z.string().optional().default(""),
  scope: z.enum(["active", "archived", "all"]).optional().default("active"),
  demo: z.enum(["production", "demo", "all"]).optional().default("production"),
  sort: z
    .enum(["updated_desc", "updated_asc", "created_desc", "created_asc", "title_asc", "title_desc"])
    .optional()
    .default("updated_desc"),
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(500).optional().default(50),
});

/** Filtered, sorted, paginated events for the owner/admin console. */
export const listAllEventsAdminPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(PageInput, input ?? {}, "events-admin.functions.ts:47"))
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { queryAdminEvents } = await import("@/lib/events-admin.server");
    return queryAdminEvents(data);
  });

/** Legacy list shape (array only), used by the announcements picker. */
export const listAllEventsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z
      .object({
        search: z.string().optional().default(""),
        scope: z.enum(["active", "archived", "all"]).optional().default("active"),
        limit: z.number().int().min(1).max(500).optional().default(200),
      }), input ?? {}, "events-admin.functions.ts:64"),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { queryAdminEvents } = await import("@/lib/events-admin.server");
    const res = await queryAdminEvents({
      search: data.search,
      hostEmail: "",
      scope: data.scope,
      demo: "production",
      sort: "updated_desc",
      offset: 0,
      limit: data.limit,
    });
    return res.rows;
  });


export const adminUpdateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z
      .object({
        id: z.string().min(1),
        data: z.record(z.string(), z.unknown()),
        brandedSlug: z.string().nullable().optional(),
      }), input, "events-admin.functions.ts:91"),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { logAdminEventAction } = await import("@/lib/admin-audit.server");
    await logAdminEventAction({
      sb: context.supabase,
      actorUserId: context.userId,
      action: "admin_event_update",
      eventIds: [data.id],
    });
    const slug = data.brandedSlug ? data.brandedSlug.toLowerCase() : null;
    const { error } = await context.supabase
      .from("events")
      .update({
        data: data.data as never,
        branded_slug: slug,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const idsInput = (input: unknown) =>
  parseInput(z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }), input, "events-admin.functions.ts:116");

export const adminArchiveEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idsInput)
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { logAdminEventAction } = await import("@/lib/admin-audit.server");
    await logAdminEventAction({
      sb: context.supabase,
      actorUserId: context.userId,
      action: "admin_event_archive",
      eventIds: data.ids,
    });
    const { error } = await context.supabase
      .from("events")
      .update({ archived_at: new Date().toISOString() } as never)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const adminRestoreEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idsInput)
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { logAdminEventAction } = await import("@/lib/admin-audit.server");
    await logAdminEventAction({
      sb: context.supabase,
      actorUserId: context.userId,
      action: "admin_event_restore",
      eventIds: data.ids,
    });
    const { error } = await context.supabase
      .from("events")
      .update({ archived_at: null } as never)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const adminDeleteEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idsInput)
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    // Log before the rows disappear, otherwise there is nothing left to record.
    const { logAdminEventAction } = await import("@/lib/admin-audit.server");
    await logAdminEventAction({
      sb: context.supabase,
      actorUserId: context.userId,
      action: "admin_event_delete",
      eventIds: data.ids,
    });
    const { error } = await context.supabase.from("events").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export type RecentUpdateRow = {
  id: string;
  branded_slug: string | null;
  title: string | null;
  updated_at: string;
  created_at: string;
  is_new: boolean;
  archived_at: string | null;
  user_id: string | null;
  updated_by_email: string | null;
  updated_by_name: string | null;
};

export const recentEventUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z.object({ limit: z.number().int().min(1).max(50).optional().default(5) }), input ?? {}, "events-admin.functions.ts:192"),
  )
  .handler(async ({ data, context }): Promise<RecentUpdateRow[]> => {
    await assertOwnerOrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getDemoScope } = await import("@/lib/demo-accounts.server");
    const scope = await getDemoScope();

    let rq = supabaseAdmin
      .from("events")
      .select("id,user_id,branded_slug,data,created_at,updated_at,archived_at")
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (scope.onlyUserId) rq = rq.eq("user_id" as never, scope.onlyUserId as never);
    else for (const id of scope.excludeUserIds) rq = rq.neq("user_id" as never, id as never);

    const { data: rows, error } = await rq;
    if (error) throw new Error(error.message);


    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))) as string[];
    const profiles: Record<string, { display_name: string | null }> = {};
    const emails: Record<string, string | null> = {};
    if (userIds.length) {
      const { data: ps } = await supabaseAdmin
        .from("profiles")
        .select("id,display_name")
        .in("id", userIds);
      for (const p of ps ?? []) profiles[p.id] = { display_name: p.display_name };
      for (const uid of userIds) {
        try {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
          emails[uid] = u.user?.email ?? null;
        } catch {
          emails[uid] = null;
        }
      }
    }

    return (rows ?? []).map((r) => {
      const row = r as typeof r & { archived_at: string | null };
      const d = (row.data ?? {}) as Record<string, unknown>;
      const title = typeof d.title === "string" ? (d.title as string) : null;
      return {
        id: row.id,
        branded_slug: row.branded_slug,
        title,
        updated_at: row.updated_at,
        created_at: row.created_at,
        is_new: Math.abs(new Date(row.updated_at).getTime() - new Date(row.created_at).getTime()) < 2000,
        archived_at: row.archived_at ?? null,
        user_id: row.user_id,
        updated_by_email: row.user_id ? emails[row.user_id] ?? null : null,
        updated_by_name: row.user_id ? profiles[row.user_id]?.display_name ?? null : null,
      };
    });
  });

