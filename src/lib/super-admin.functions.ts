// Super admin only (Christopher). Every function re-checks
// has_role(auth.uid(), 'super_admin') — never 'owner'.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "super_admin",
  });
  if (!data) throw new Error("Forbidden: super admin only");
  // super_admin is an owner-type account: MFA (aal2) is mandatory.
  const { assertOwnerMfaSatisfied } = await import("@/lib/owner-guard.server");
  await assertOwnerMfaSatisfied(supabase, userId);
}

/** Ban/delete are destructive and cross-tenant: never allowed on the demo host. */
async function assertNotDemoAction(action: string) {
  const { assertNotDemo } = await import("@/lib/demo-mode.server");
  await assertNotDemo(action);
}


const PERMANENT_BAN = "876000h";

async function audit(
  supabaseAdmin: any,
  actorUserId: string,
  action: string,
  target: { id: string; email: string | null },
  details: Record<string, unknown> = {},
) {
  const { data: actor } = await supabaseAdmin.auth.admin.getUserById(actorUserId);
  await supabaseAdmin.from("admin_audit_log").insert({
    actor_user_id: actorUserId,
    actor_email: actor?.user?.email ?? null,
    action,
    target_user_id: target.id,
    target_email: target.email,
    details,
  });
}

/** Blocks acting on yourself, and on the last super_admin / last owner. */
async function assertSafeTarget(supabaseAdmin: any, actorUserId: string, targetUserId: string) {
  if (actorUserId === targetUserId) {
    throw new Error("You cannot ban or delete your own account");
  }
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["super_admin", "owner"]);
  const list = (roles ?? []) as { user_id: string; role: string }[];
  for (const role of ["super_admin", "owner"]) {
    const holders = list.filter((r) => r.role === role).map((r) => r.user_id);
    if (holders.includes(targetUserId) && holders.length <= 1) {
      throw new Error(`Cannot remove the last ${role}`);
    }
  }
}

async function getTarget(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error("User not found");
  return { id: data.user.id, email: (data.user.email as string | null) ?? null };
}

function assertEmailConfirmation(typed: string, actual: string | null) {
  if (!actual || typed.trim().toLowerCase() !== actual.toLowerCase()) {
    throw new Error("Typed email does not match the target account");
  }
}

/* ----------------------------- ban / unban ----------------------------- */

export type BanDuration = "24h" | "168h" | "720h" | "permanent";

type ActionResult = { ok: true; message: string } | { error: string };

export const banUserAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; confirmEmail: string; duration: BanDuration }) => {
    if (!data.userId) throw new Error("User is required");
    if (!["24h", "168h", "720h", "permanent"].includes(data.duration)) {
      throw new Error("Invalid ban duration");
    }
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    try {
      await assertSuperAdmin(context.supabase, context.userId);
      await assertNotDemoAction("banning users");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const target = await getTarget(supabaseAdmin, data.userId);
      assertEmailConfirmation(data.confirmEmail, target.email);
      await assertSafeTarget(supabaseAdmin, context.userId, data.userId);

      const banDuration = data.duration === "permanent" ? PERMANENT_BAN : data.duration;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        ban_duration: banDuration,
      } as any);
      if (error) return { error: error.message };

      await audit(supabaseAdmin, context.userId, "user.ban", target, { duration: data.duration });
      return { ok: true, message: `${target.email} is banned (${data.duration})` };
    } catch (e: any) {
      return { error: e?.message || "Failed to ban user" };
    }
  });

export const unbanUserAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => {
    if (!data.userId) throw new Error("User is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    try {
      await assertSuperAdmin(context.supabase, context.userId);
      await assertNotDemoAction("unbanning users");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const target = await getTarget(supabaseAdmin, data.userId);
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        ban_duration: "none",
      } as any);
      if (error) return { error: error.message };
      await audit(supabaseAdmin, context.userId, "user.unban", target);
      return { ok: true, message: `${target.email} can sign in again` };
    } catch (e: any) {
      return { error: e?.message || "Failed to unban user" };
    }
  });

/* ------------------------------- deletion ------------------------------ */

export type DeletionPreflight = {
  email: string | null;
  activeEvents: number;
  archivedEvents: number;
  vendorProfiles: number;
  vendorReviewsReceived: number;
  openRfqThreads: number;
  sharedProjects: number;
  activeSubscriptions: number;
  activePasses: number;
  contacts: number;
  blockers: string[];
};

export const getUserDeletionPreflight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => {
    if (!data.userId) throw new Error("User is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<DeletionPreflight> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = await getTarget(supabaseAdmin, data.userId);
    const uid = data.userId;

    const [
      activeEvents,
      archivedEvents,
      vendors,
      rfqs,
      projects,
      subs,
      passes,
      contacts,
    ] = await Promise.all([
      supabaseAdmin.from("events").select("id").eq("user_id", uid).is("archived_at", null),
      supabaseAdmin.from("events").select("id").eq("user_id", uid).not("archived_at", "is", null),
      supabaseAdmin.from("vendors").select("id").eq("owner_user_id", uid),
      supabaseAdmin.from("rfq_requests").select("id, status").eq("requester_user_id", uid),
      supabaseAdmin.from("pm_projects").select("id").eq("owner_user_id", uid).is("archived_at", null),
      supabaseAdmin
        .from("subscriptions")
        .select("id, status")
        .eq("user_id", uid)
        .in("status", ["active", "trialing", "past_due"]),
      supabaseAdmin
        .from("one_time_passes")
        .select("id")
        .eq("user_id", uid)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString()),
      supabaseAdmin.from("contacts").select("id").eq("owner_user_id", uid),
    ]);

    const vendorIds = ((vendors.data ?? []) as any[]).map((v) => v.id);
    let reviewsReceived = 0;
    if (vendorIds.length) {
      const { data: revs } = await supabaseAdmin
        .from("vendor_reviews")
        .select("id")
        .in("vendor_id", vendorIds);
      reviewsReceived = (revs ?? []).length;
    }

    const projectIds = ((projects.data ?? []) as any[]).map((p) => p.id);
    let sharedProjects = 0;
    if (projectIds.length) {
      const { data: members } = await supabaseAdmin
        .from("pm_project_members")
        .select("project_id, user_id")
        .in("project_id", projectIds);
      sharedProjects = new Set(
        ((members ?? []) as any[]).filter((m) => m.user_id !== uid).map((m) => m.project_id),
      ).size;
    }

    const openRfq = ((rfqs.data ?? []) as any[]).filter(
      (r) => !["closed", "awarded", "cancelled", "canceled"].includes(String(r.status)),
    ).length;

    const blockers: string[] = [];
    if (vendorIds.length && reviewsReceived > 0) {
      blockers.push(
        `Owns ${vendorIds.length} vendor profile(s) with ${reviewsReceived} review(s) written by other users — deleting would erase their reviews. Transfer or archive the vendor profile first.`,
      );
    }
    if (openRfq > 0) {
      blockers.push(
        `${openRfq} open RFQ thread(s) with vendor bids — close or award them first so vendors keep their history.`,
      );
    }
    if (sharedProjects > 0) {
      blockers.push(
        `${sharedProjects} project(s) shared with other members — transfer ownership before deleting.`,
      );
    }
    if ((subs.data ?? []).length > 0) {
      blockers.push(
        `${(subs.data ?? []).length} active subscription(s) — cancel billing first (Subscriptions tab).`,
      );
    }

    return {
      email: target.email,
      activeEvents: (activeEvents.data ?? []).length,
      archivedEvents: (archivedEvents.data ?? []).length,
      vendorProfiles: vendorIds.length,
      vendorReviewsReceived: reviewsReceived,
      openRfqThreads: openRfq,
      sharedProjects,
      activeSubscriptions: (subs.data ?? []).length,
      activePasses: (passes.data ?? []).length,
      contacts: (contacts.data ?? []).length,
      blockers,
    };
  });

/**
 * Soft delete: archive events, anonymize the profile, drop personal CRM data,
 * permanently ban, and mark deletion_requested_at so the existing 30-day cron
 * performs the real auth deletion (reversible for 30 days).
 */
export const softDeleteUserAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; confirmEmail: string; reason?: string }) => {
    if (!data.userId) throw new Error("User is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    try {
      await assertSuperAdmin(context.supabase, context.userId);
      await assertNotDemoAction("deleting users");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const target = await getTarget(supabaseAdmin, data.userId);
      assertEmailConfirmation(data.confirmEmail, target.email);
      await assertSafeTarget(supabaseAdmin, context.userId, data.userId);

      const preflight = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("user_id", data.userId)
        .in("status", ["active", "trialing", "past_due"]);
      if ((preflight.data ?? []).length > 0) {
        return { error: "Cancel the active subscription before deleting this account." };
      }

      const now = new Date().toISOString();
      await supabaseAdmin
        .from("events")
        .update({ archived_at: now })
        .eq("user_id", data.userId)
        .is("archived_at", null);
      await supabaseAdmin.from("contacts").delete().eq("owner_user_id", data.userId);
      await supabaseAdmin.from("contact_groups").delete().eq("owner_user_id", data.userId);
      await supabaseAdmin
        .from("profiles")
        .update({
          display_name: "Deleted user",
          avatar_url: null,
          phone: null,
          sms_opt_in: false,
          deletion_requested_at: now,
        })
        .eq("id", data.userId);
      await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        ban_duration: PERMANENT_BAN,
      } as any);

      await audit(supabaseAdmin, context.userId, "user.soft_delete", target, {
        reason: data.reason ?? null,
      });
      return {
        ok: true,
        message: `${target.email} anonymized and scheduled for permanent deletion in 30 days`,
      };
    } catch (e: any) {
      return { error: e?.message || "Failed to delete user" };
    }
  });

/** Irreversible. Only allowed when the account has no footprint at all. */
export const hardDeleteUserAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; confirmEmail: string; reason?: string }) => {
    if (!data.userId) throw new Error("User is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    try {
      await assertSuperAdmin(context.supabase, context.userId);
      await assertNotDemoAction("deleting users");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const target = await getTarget(supabaseAdmin, data.userId);
      assertEmailConfirmation(data.confirmEmail, target.email);
      await assertSafeTarget(supabaseAdmin, context.userId, data.userId);

      const uid = data.userId;
      const [events, vendors, rfqs, projects, subs] = await Promise.all([
        supabaseAdmin.from("events").select("id").eq("user_id", uid).limit(1),
        supabaseAdmin.from("vendors").select("id").eq("owner_user_id", uid).limit(1),
        supabaseAdmin.from("rfq_requests").select("id").eq("requester_user_id", uid).limit(1),
        supabaseAdmin.from("pm_projects").select("id").eq("owner_user_id", uid).limit(1),
        supabaseAdmin.from("subscriptions").select("id").eq("user_id", uid).limit(1),
      ]);
      const footprint =
        (events.data ?? []).length +
        (vendors.data ?? []).length +
        (rfqs.data ?? []).length +
        (projects.data ?? []).length +
        (subs.data ?? []).length;
      if (footprint > 0) {
        return {
          error:
            "This account has events, vendor, RFQ, project or billing history. Use the reversible delete instead so other users' data isn't erased.",
        };
      }

      await audit(supabaseAdmin, context.userId, "user.hard_delete", target, {
        reason: data.reason ?? null,
      });
      const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (error) return { error: error.message };
      return { ok: true, message: `${target.email} permanently deleted` };
    } catch (e: any) {
      return { error: e?.message || "Failed to delete user" };
    }
  });

/* ------------------------------ audit log ------------------------------ */

export type AuditEntry = {
  id: string;
  actor_email: string | null;
  action: string;
  target_email: string | null;
  details: Record<string, string | number | boolean | null> | null;
  created_at: string;
};

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuditEntry[]> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("admin_audit_log")
      .select("id, actor_email, action, target_email, details, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as AuditEntry[];
  });

/* --------------------- profile / email maintenance --------------------- */

function safeOrigin(url: string | null | undefined): string | undefined {
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

/** Rename the account's display name (profiles + auth user metadata). */
export const updateUserProfileAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; displayName: string }) => {
    if (!data.userId) throw new Error("User is required");
    if (typeof data.displayName !== "string") throw new Error("Name is required");
    if (data.displayName.trim().length > 120) throw new Error("Name must be under 120 characters");
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    try {
      await assertSuperAdmin(context.supabase, context.userId);
      await assertNotDemoAction("editing user profiles");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const target = await getTarget(supabaseAdmin, data.userId);

      const { data: before } = await supabaseAdmin
        .from("profiles")
        .select("display_name")
        .eq("id", data.userId)
        .maybeSingle();

      const next = data.displayName.trim() || null;
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ display_name: next })
        .eq("id", data.userId);
      if (error) return { error: error.message };

      await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        user_metadata: { display_name: next },
      } as any);

      await audit(supabaseAdmin, context.userId, "user.profile_update", target, {
        from: (before as any)?.display_name ?? null,
        to: next,
      });
      return { ok: true, message: "Display name updated" };
    } catch (e: any) {
      return { error: e?.message || "Failed to update profile" };
    }
  });

/**
 * Change the sign-in email. `mode: "confirm"` leaves the new address
 * unconfirmed and sends a confirmation email; `mode: "immediate"` marks it
 * confirmed right away and requires typing the current address.
 */
export const changeUserEmailAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      userId: string;
      newEmail: string;
      mode: "confirm" | "immediate";
      confirmEmail?: string;
      redirectTo?: string;
    }) => {
      if (!data.userId) throw new Error("User is required");
      const email = String(data.newEmail ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Enter a valid email address");
      if (email.length > 255) throw new Error("Email is too long");
      if (data.mode !== "confirm" && data.mode !== "immediate") throw new Error("Invalid mode");
      return { ...data, newEmail: email };
    },
  )
  .handler(async ({ data, context }): Promise<ActionResult> => {
    try {
      await assertSuperAdmin(context.supabase, context.userId);
      await assertNotDemoAction("changing user email addresses");
      if (data.userId === context.userId) {
        throw new Error("Change your own email from your profile page");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const target = await getTarget(supabaseAdmin, data.userId);
      if (data.mode === "immediate") {
        assertEmailConfirmation(String(data.confirmEmail ?? ""), target.email);
      }
      if (target.email && target.email.toLowerCase() === data.newEmail) {
        return { error: "That is already the account's email address" };
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        email: data.newEmail,
        email_confirm: data.mode === "immediate",
      } as any);
      if (error) return { error: error.message };

      let message =
        data.mode === "immediate"
          ? `Email changed to ${data.newEmail} (confirmed)`
          : `Email changed to ${data.newEmail} — confirmation email sent`;

      if (data.mode === "confirm") {
        const redirectTo = safeOrigin(data.redirectTo);
        const { error: resendError } = await (supabaseAdmin.auth as any).resend({
          type: "signup",
          email: data.newEmail,
          ...(redirectTo ? { options: { emailRedirectTo: redirectTo } } : {}),
        });
        if (resendError) {
          message = `Email changed to ${data.newEmail}, but the confirmation email could not be sent (${resendError.message})`;
        }
      }

      await audit(supabaseAdmin, context.userId, "user.email_change", target, {
        from: target.email,
        to: data.newEmail,
        mode: data.mode,
      });
      return { ok: true, message };
    } catch (e: any) {
      return { error: e?.message || "Failed to change email" };
    }
  });

/** Send a password reset email to the account's current address. */
export const sendPasswordResetAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; redirectTo?: string }) => {
    if (!data.userId) throw new Error("User is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    try {
      await assertSuperAdmin(context.supabase, context.userId);
      await assertNotDemoAction("sending password resets");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const target = await getTarget(supabaseAdmin, data.userId);
      if (!target.email) return { error: "This account has no email address" };

      const redirectTo = safeOrigin(data.redirectTo);
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(target.email, {
        ...(redirectTo ? { redirectTo: `${redirectTo}/reset-password` } : {}),
      } as any);
      if (error) return { error: error.message };

      await audit(supabaseAdmin, context.userId, "user.password_reset_sent", target);
      return { ok: true, message: `Password reset sent to ${target.email}` };
    } catch (e: any) {
      return { error: e?.message || "Failed to send password reset" };
    }
  });

/** Resend the invitation email for an account that never confirmed. */
export const resendInviteAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; redirectTo?: string }) => {
    if (!data.userId) throw new Error("User is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    try {
      await assertSuperAdmin(context.supabase, context.userId);
      await assertNotDemoAction("resending invitations");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const target = await getTarget(supabaseAdmin, data.userId);
      if (!target.email) return { error: "This account has no email address" };

      const redirectTo = safeOrigin(data.redirectTo);
      const { error } = await (supabaseAdmin.auth as any).resend({
        type: "signup",
        email: target.email,
        ...(redirectTo ? { options: { emailRedirectTo: redirectTo } } : {}),
      });
      if (error) return { error: error.message };

      await audit(supabaseAdmin, context.userId, "user.invite_resent", target);
      return { ok: true, message: `Invitation resent to ${target.email}` };
    } catch (e: any) {
      return { error: e?.message || "Failed to resend invitation" };
    }
  });

/** Mark an account's email confirmed without waiting on the user. */
export const confirmUserEmailAsSuperAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => {
    if (!data.userId) throw new Error("User is required");
    return data;
  })
  .handler(async ({ data, context }): Promise<ActionResult> => {
    try {
      await assertSuperAdmin(context.supabase, context.userId);
      await assertNotDemoAction("confirming user email addresses");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const target = await getTarget(supabaseAdmin, data.userId);
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        email_confirm: true,
      } as any);
      if (error) return { error: error.message };
      await audit(supabaseAdmin, context.userId, "user.email_confirmed", target);
      return { ok: true, message: `${target.email} is confirmed` };
    } catch (e: any) {
      return { error: e?.message || "Failed to confirm email" };
    }
  });
