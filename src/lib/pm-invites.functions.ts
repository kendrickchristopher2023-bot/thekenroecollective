import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RoleSchema = z.enum(["admin", "editor", "viewer"]);

function genToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function assertProjectAdmin(sb: any, projectId: string, userId: string) {
  const { data: canAdmin } = await sb.rpc("pm_is_project_admin", {
    _project_id: projectId,
    _user_id: userId,
  });
  if (!canAdmin) throw new Error("Only project admins can manage invitations.");
}

/**
 * Enforce project-seat limit BEFORE inserting a new invite/member.
 * Seats include: the owner + accepted members + outstanding (unaccepted,
 * unexpired) invites. Seat cap is based on the PROJECT OWNER's tier plus
 * their PM add-on status — never the invitee's.
 *
 * - Any tier without the PM add-on: 0 seats → PM add-on required.
 * - PM add-on on Postcard/Whisper/Host: 5 seats.
 * - PM add-on on Atelier: 20 seats.
 * Teams larger than the cap are handled through /contact — there are no
 * separate Projects seat SKUs, so never surface an "upgrade" dead end.
 */
async function assertSeatAvailable(sb: any, projectId: string) {
  const { data: project } = await sb
    .from("pm_projects")
    .select("owner_user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project?.owner_user_id) throw new Error("Project not found.");

  const { getEffectiveProjectSeats, PM_ADDON_SEAT_LIMITS } = await import("@/lib/tier-limits");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Resolve the owner's effective tier + PM add-on status. We use the admin
  // client because the caller (context user) might not be able to read the
  // owner's subscription rows under RLS.
  const PM_PRICE_IDS = new Set([
    "pm_addon_monthly",
    "pm_addon_yearly",
    "host_pm_bundle_monthly",
    "host_pm_bundle_yearly",
    "pm_solo_monthly",
    "pm_solo_yearly",
    "atelier_studio_monthly",
    "atelier_studio_yearly",
  ]);
  const [{ data: ownerProfile }, { data: ownerSubs }, { data: isOwnerRole }] = await Promise.all([
    supabaseAdmin.from("profiles").select("tier").eq("id", project.owner_user_id).maybeSingle(),
    supabaseAdmin
      .from("subscriptions")
      .select("price_id,status,current_period_end")
      .eq("user_id", project.owner_user_id)
      .in("status", ["active", "trialing", "past_due"]),
    supabaseAdmin.rpc("has_role", { _user_id: project.owner_user_id, _role: "owner" }),
  ]);
  const now = Date.now();
  const activePriceIds: string[] = ((ownerSubs as any[]) ?? [])
    .filter((s) => !s.current_period_end || new Date(s.current_period_end).getTime() > now)
    .map((s) => String(s.price_id ?? ""))
    .filter(Boolean);
  const hasPmAddon = activePriceIds.some((p) => PM_PRICE_IDS.has(p));

  function normalizeTier(raw: string | null | undefined): "postcard" | "whisper" | "host" | "atelier" {
    const t = String(raw ?? "").toLowerCase();
    if (!t) return "postcard";
    if (t.includes("atelier") || t.startsWith("studio_collective")) return "atelier";
    if (t.includes("host")) return "host";
    if (t.includes("whisper")) return "whisper";
    return "postcard";
  }
  const RANK = { postcard: 0, whisper: 1, host: 2, atelier: 3 } as const;
  let tier: "postcard" | "whisper" | "host" | "atelier" = normalizeTier(ownerProfile?.tier);
  for (const pid of activePriceIds) {
    const t = normalizeTier(pid);
    if (RANK[t] > RANK[tier]) tier = t;
  }
  // Owner-role accounts always have PM access with the Atelier seat cap.
  // Every other user must have the PM add-on regardless of tier.
  const limit = isOwnerRole
    ? PM_ADDON_SEAT_LIMITS.atelier
    : getEffectiveProjectSeats(tier, hasPmAddon);

  if (limit <= 0) {
    const err = new Error(
      "Project Management add-on required to invite collaborators. Add it from /pricing.",
    );
    (err as any).code = "pm_addon_required";
    throw err;
  }

  if (!Number.isFinite(limit)) return; // safety: never reached (all caps are finite)

  const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
    sb.from("pm_project_members").select("user_id", { count: "exact", head: true }).eq("project_id", projectId),
    sb
      .from("pm_invites")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("accepted_at", null),
  ]);
  // Owner counts as a seat. Members are non-owner collaborators; pending
  // invites are reserved seats.
  const used = 1 + (memberCount ?? 0) + (pendingCount ?? 0);
  if (used >= limit) {
    const err = new Error(
      `You've used all ${limit} seat${limit === 1 ? "" : "s"} on this project (that includes you and any pending invites). ` +
        `Remove a collaborator to free a seat, or tell us about your team at ` +
        `${SITE_URL}/contact and we'll open up more.`,
    );
    (err as any).code = "seat_limit_reached";
    (err as any).limit = limit;
    (err as any).used = used;
    throw err;
  }
}

const SITE_URL = "https://thekenroecollective.com";

async function sendInviteEmail(args: {
  email: string;
  token: string;
  role: string;
  projectId: string;
  inviterUserId: string;
  sb: any;
}): Promise<boolean> {
  try {
    const [{ data: project }, { data: inviterProfile }] = await Promise.all([
      args.sb.from("pm_projects").select("name").eq("id", args.projectId).maybeSingle(),
      args.sb.from("profiles").select("display_name").eq("id", args.inviterUserId).maybeSingle(),
    ]);
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    const res = await enqueueTransactionalEmailServer({
      templateName: "pm-invite",
      recipientEmail: args.email,
      idempotencyKey: `pm-invite:${args.token}`,
      templateData: {
        projectName: project?.name ?? "a project",
        inviterName: inviterProfile?.display_name ?? undefined,
        role: args.role,
        acceptUrl: `${SITE_URL}/projects/accept-invite/${args.token}`,
        siteName: "The Kenroe Collective",
      },
      label: "pm-invite",
    });
    return !!res.ok;
  } catch (err) {
    console.error("sendInviteEmail failed", err);
    return false;
  }
}

export const createPmInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    parseInput(z
      .object({
        project_id: z.string().uuid(),
        email: z.string().email().max(200),
        role: RoleSchema.default("editor"),
      }), i, "pm-invites.functions.ts:172"),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertProjectAdmin(sb, data.project_id, context.userId);
    await assertSeatAvailable(sb, data.project_id);

    const token = genToken();
    const email = data.email.trim().toLowerCase();
    const { data: row, error } = await sb
      .from("pm_invites")
      .insert({
        project_id: data.project_id,
        email,
        role: data.role,
        token,
        invited_by: context.userId,
      })
      .select("id,email,role,token,expires_at,created_at,accepted_at")
      .single();
    if (error) throw new Error(error.message);

    const emailed = await sendInviteEmail({
      email,
      token,
      role: data.role,
      projectId: data.project_id,
      inviterUserId: context.userId,
      sb,
    });

    return { ...row, emailed };
  });

export const resendPmInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ invite_id: z.string().uuid() }), i, "pm-invites.functions.ts:208"))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: invite, error: invErr } = await sb
      .from("pm_invites")
      .select("id,project_id,email,role,token,accepted_at")
      .eq("id", data.invite_id)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!invite) throw new Error("Invitation not found.");
    if (invite.accepted_at) throw new Error("This invitation was already accepted.");
    await assertProjectAdmin(sb, invite.project_id, context.userId);

    // Bump expiry to 14 days out.
    const newExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await sb
      .from("pm_invites")
      .update({ expires_at: newExpiry })
      .eq("id", invite.id);

    const emailed = await sendInviteEmail({
      email: invite.email,
      token: invite.token,
      role: invite.role,
      projectId: invite.project_id,
      inviterUserId: context.userId,
      sb,
    });

    return { ok: true, emailed, expires_at: newExpiry };
  });

// Names/emails for a project's owner + members, so the UI can show who's
// who instead of raw user ids. Scoped to callers who are themselves a
// member (or the owner) of the project.
export const getProjectMemberProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ project_id: z.string().uuid() }), i, "pm-invites.functions.ts:245"))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: isMember } = await sb.rpc("pm_is_project_member", {
      _project_id: data.project_id,
      _user_id: context.userId,
    });
    if (!isMember) throw new Error("Forbidden");

    const [{ data: members }, { data: project }] = await Promise.all([
      sb.from("pm_project_members").select("user_id").eq("project_id", data.project_id),
      sb.from("pm_projects").select("owner_user_id").eq("id", data.project_id).maybeSingle(),
    ]);
    const userIds = Array.from(
      new Set(
        [...(members ?? []).map((m: any) => m.user_id), project?.owner_user_id].filter(Boolean),
      ),
    ) as string[];
    if (!userIds.length) return {};

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,display_name")
      .in("id", userIds);
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name as string | null]));

    const out: Record<string, { display_name: string | null; email: string | null }> = {};
    await Promise.all(
      userIds.map(async (uid) => {
        let email: string | null = null;
        try {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
          email = u.user?.email ?? null;
        } catch {
          email = null;
        }
        out[uid] = { display_name: profileMap.get(uid) ?? null, email };
      }),
    );
    return out;
  });

export const listPmInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ project_id: z.string().uuid() }), i, "pm-invites.functions.ts:290"))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    await assertProjectAdmin(sb, data.project_id, context.userId);
    const { data: rows, error } = await sb
      .from("pm_invites")
      .select("id,email,role,token,expires_at,created_at,accepted_at")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const cancelPmInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ invite_id: z.string().uuid() }), i, "pm-invites.functions.ts:305"))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: invite, error: inviteErr } = await sb
      .from("pm_invites")
      .select("project_id")
      .eq("id", data.invite_id)
      .maybeSingle();
    if (inviteErr) throw new Error(inviteErr.message);
    if (!invite) throw new Error("Invitation not found.");
    await assertProjectAdmin(sb, invite.project_id, context.userId);
    const { error } = await sb.from("pm_invites").delete().eq("id", data.invite_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const acceptPmInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ token: z.string().min(8).max(200) }), i, "pm-invites.functions.ts:323"))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const email = ((context.claims as any)?.email ?? "").toString().toLowerCase();

    const { data: invite, error: invErr } = await sb
      .from("pm_invites")
      .select("id,project_id,email,role,expires_at,accepted_at")
      .eq("token", data.token)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!invite) throw new Error("Invitation not found.");
    if (invite.accepted_at) throw new Error("This invitation has already been accepted.");
    if (new Date(invite.expires_at as string) < new Date())
      throw new Error("This invitation has expired. Ask the project admin to send a new one.");
    if (email && String(invite.email).toLowerCase() !== email)
      throw new Error(
        `This invitation is for ${invite.email}. Sign in with that email to accept.`,
      );

    const { error: memErr } = await sb
      .from("pm_project_members")
      .upsert(
        { project_id: invite.project_id, user_id: context.userId, role: invite.role },
        { onConflict: "project_id,user_id" },
      );
    if (memErr) throw new Error(memErr.message);

    await sb
      .from("pm_invites")
      .update({ accepted_at: new Date().toISOString(), accepted_user_id: context.userId })
      .eq("id", invite.id);

    return { project_id: invite.project_id as string };
  });
