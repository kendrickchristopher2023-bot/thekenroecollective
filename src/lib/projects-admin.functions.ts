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

export type { AdminProjectRow, AdminProjectSort, AdminProjectScope } from "@/lib/projects-admin.types";
import type { AdminProjectRow } from "@/lib/projects-admin.types";

export const meCanAdminProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: isOwner }, { data: isAdmin }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    return { allowed: Boolean(isOwner || isAdmin), isOwner: Boolean(isOwner), isAdmin: Boolean(isAdmin) };
  });

const ProjectPageInput = z.object({
  search: z.string().optional().default(""),
  ownerEmail: z.string().optional().default(""),
  scope: z.enum(["active", "archived", "all"]).optional().default("active"),
  linked: z.enum(["all", "linked", "unlinked"]).optional().default("all"),
  sort: z
    .enum(["updated_desc", "updated_asc", "created_desc", "created_asc", "name_asc", "name_desc"])
    .optional()
    .default("updated_desc"),
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(500).optional().default(50),
});

/** Filtered, sorted, paginated projects for the owner/admin console. */
export const listAllProjectsAdminPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(ProjectPageInput, input ?? {}, "projects-admin.functions.ts:48"))
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { queryAdminProjects } = await import("@/lib/projects-admin.server");
    return queryAdminProjects(data);
  });

/** Legacy array shape kept for existing callers. */
export const listAllProjectsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z
      .object({
        search: z.string().optional().default(""),
        scope: z.enum(["active", "archived", "all"]).optional().default("active"),
        limit: z.number().int().min(1).max(500).optional().default(200),
      }), input ?? {}, "projects-admin.functions.ts:65"),
  )
  .handler(async ({ data, context }): Promise<AdminProjectRow[]> => {
    await assertOwnerOrAdmin(context);
    const { queryAdminProjects } = await import("@/lib/projects-admin.server");
    const res = await queryAdminProjects({
      search: data.search,
      ownerEmail: "",
      scope: data.scope,
      linked: "all",
      sort: "updated_desc",
      offset: 0,
      limit: data.limit,
    });
    return res.rows;
  });

export const adminUpdateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z
      .object({
        id: z.string().min(1),
        name: z.string().min(1).max(200),
        description: z.string().max(2000).nullable().optional(),
        color: z.string().max(32).nullable().optional(),
        eventId: z.string().max(200).nullable().optional(),
      }), input, "projects-admin.functions.ts:93"),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("pm_projects")
      .update({
        name: data.name,
        description: data.description ?? null,
        color: data.color ?? null,
        event_id: data.eventId ?? null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const idsInput = (input: unknown) =>
  parseInput(z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }), input, "projects-admin.functions.ts:113");

export const adminArchiveProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idsInput)
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("pm_projects")
      .update({ archived_at: new Date().toISOString() } as never)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const adminRestoreProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idsInput)
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("pm_projects")
      .update({ archived_at: null } as never)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const adminDeleteProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idsInput)
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Cascading: remove tasks, members, invites first to avoid orphans (FKs may already cascade; safe to attempt)
    await supabaseAdmin.from("pm_task_comments").delete().in("task_id", (
      (await supabaseAdmin.from("pm_tasks").select("id").in("project_id", data.ids)).data ?? []
    ).map((t: any) => t.id));
    await supabaseAdmin.from("pm_task_attachments").delete().in("task_id", (
      (await supabaseAdmin.from("pm_tasks").select("id").in("project_id", data.ids)).data ?? []
    ).map((t: any) => t.id));
    await supabaseAdmin.from("pm_tasks").delete().in("project_id", data.ids);
    await supabaseAdmin.from("pm_project_members").delete().in("project_id", data.ids);
    await supabaseAdmin.from("pm_invites").delete().in("project_id", data.ids);
    const { error } = await supabaseAdmin.from("pm_projects").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export type AdminProjectDetail = {
  project: AdminProjectRow;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    assignee_user_id: string | null;
    due_date: string | null;
    created_at: string;
    updated_at: string;
  }>;
  members: Array<{
    user_id: string;
    role: string;
    display_name: string | null;
    email: string | null;
    created_at: string;
  }>;
};

export const adminGetProjectDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => parseInput(z.object({ id: z.string().min(1) }), input, "projects-admin.functions.ts:186"))
  .handler(async ({ data, context }): Promise<AdminProjectDetail> => {
    await assertOwnerOrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: p, error: pe } = await supabaseAdmin
      .from("pm_projects")
      .select("id,owner_user_id,name,description,color,event_id,language,archived_at,created_at,updated_at")
      .eq("id", data.id)
      .maybeSingle();
    if (pe) throw new Error(pe.message);
    if (!p) throw new Error("Project not found");

    const { data: tasks } = await supabaseAdmin
      .from("pm_tasks")
      .select("id,title,status,assignee_user_id,due_date,created_at,updated_at")
      .eq("project_id", data.id)
      .order("updated_at", { ascending: false })
      .limit(500);

    const { data: members } = await supabaseAdmin
      .from("pm_project_members")
      .select("user_id,role,created_at")
      .eq("project_id", data.id);

    const memberRows = members ?? [];
    const allUserIds = Array.from(
      new Set([
        p.owner_user_id,
        ...memberRows.map((m) => m.user_id),
        ...(tasks ?? []).map((t) => t.assignee_user_id).filter(Boolean) as string[],
      ]),
    );

    const profiles: Record<string, { display_name: string | null }> = {};
    const emails: Record<string, string | null> = {};
    if (allUserIds.length) {
      const { data: ps } = await supabaseAdmin.from("profiles").select("id,display_name").in("id", allUserIds);
      for (const pr of ps ?? []) profiles[pr.id] = { display_name: pr.display_name };
      for (const uid of allUserIds) {
        try {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
          emails[uid] = u.user?.email ?? null;
        } catch {
          emails[uid] = null;
        }
      }
    }

    // Compose project row with counts
    const project: AdminProjectRow = {
      id: p.id,
      owner_user_id: p.owner_user_id,
      name: p.name,
      description: p.description,
      color: p.color,
      event_id: p.event_id,
      language: p.language,
      archived_at: p.archived_at ?? null,
      created_at: p.created_at,
      updated_at: p.updated_at,
      owner_email: emails[p.owner_user_id] ?? null,
      owner_display_name: profiles[p.owner_user_id]?.display_name ?? null,
      task_count: (tasks ?? []).length,
      member_count: memberRows.length + 1,
    };

    return {
      project,
      tasks: (tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status as string,
        assignee_user_id: t.assignee_user_id,
        due_date: t.due_date,
        created_at: t.created_at,
        updated_at: t.updated_at,
      })),
      members: [
        {
          user_id: p.owner_user_id,
          role: "owner",
          display_name: profiles[p.owner_user_id]?.display_name ?? null,
          email: emails[p.owner_user_id] ?? null,
          created_at: p.created_at,
        },
        ...memberRows.map((m) => ({
          user_id: m.user_id,
          role: m.role as string,
          display_name: profiles[m.user_id]?.display_name ?? null,
          email: emails[m.user_id] ?? null,
          created_at: m.created_at,
        })),
      ],
    };
  });

export const adminRemoveProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z.object({ projectId: z.string().min(1), userId: z.string().min(1) }), input, "projects-admin.functions.ts:286"),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("pm_project_members")
      .delete()
      .eq("project_id", data.projectId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminTransferProjectOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    parseInput(z.object({ projectId: z.string().min(1), newOwnerUserId: z.string().uuid() }), input, "projects-admin.functions.ts:303"),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("pm_projects")
      .update({ owner_user_id: data.newOwnerUserId, updated_at: new Date().toISOString() } as never)
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);
    // Ensure they are also no longer a duplicate member row
    await supabaseAdmin
      .from("pm_project_members")
      .delete()
      .eq("project_id", data.projectId)
      .eq("user_id", data.newOwnerUserId);
    return { ok: true };
  });
