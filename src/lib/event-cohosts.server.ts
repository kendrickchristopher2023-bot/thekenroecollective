// Server-only helpers for event collaborators. Kept out of the .functions.ts
// wrapper so server-function code splitting can't strip them.
export const COHOST_SITE_URL = "https://thekenroecollective.com";

/**
 * Loads the event and hard-fails unless the caller may manage its collaborators.
 * Matches the events RLS pattern: the literal host, OR a platform owner/admin.
 * Platform-owner overrides are written to admin_audit_log so every action that
 * crosses a normal ownership boundary leaves a trail.
 */
export async function assertEventOwner(
  sb: any,
  eventId: string,
  userId: string,
  auditAction?: string,
) {
  const { data: row, error } = await sb
    .from("events")
    .select("id,user_id,data")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Event not found.");
  if (row.user_id !== userId) {
    const [owner, admin] = await Promise.all([
      sb.rpc("has_role", { _user_id: userId, _role: "owner" }),
      sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (owner?.data !== true && admin?.data !== true) {
      throw new Error("Only the event's host can manage collaborators.");
    }
    if (auditAction) {
      await auditOverride(userId, auditAction, {
        event_id: row.id,
        event_title: (row.data as any)?.title ?? null,
        event_owner_user_id: row.user_id,
      });
    }
  }
  return row as { id: string; user_id: string; data: Record<string, unknown> };
}

/** Best-effort audit row; auditing must never block a permitted action. */
async function auditOverride(
  actorUserId: string,
  action: string,
  details: Record<string, unknown>,
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: actor } = await (supabaseAdmin as any).auth.admin.getUserById(actorUserId);
    await (supabaseAdmin as any).from("admin_audit_log").insert({
      actor_user_id: actorUserId,
      actor_email: actor?.user?.email ?? null,
      action,
      target_user_id: (details as any).event_owner_user_id ?? null,
      details,
    });
  } catch {
    /* ignore */
  }
}


export async function sendCohostInvite(args: {
  email: string;
  token: string;
  role: string;
  eventTitle: string;
  inviterUserId: string;
  sb: any;
  eventId?: string;
}): Promise<boolean> {
  try {
    const { data: inviterProfile } = await args.sb
      .from("profiles")
      .select("display_name")
      .eq("id", args.inviterUserId)
      .maybeSingle();
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    const res = await enqueueTransactionalEmailServer({
      templateName: "pm-invite",
      recipientEmail: args.email,
      idempotencyKey: `event-cohost:${args.token}`,
      templateData: {
        projectName: args.eventTitle,
        inviterName: inviterProfile?.display_name ?? undefined,
        role: args.role === "viewer" ? "viewer" : "co-host",
        acceptUrl: `${COHOST_SITE_URL}/cohost/${args.token}`,
        siteName: "The Kenroe Collective",
      },
      label: "event-cohost-invite",
      ...(args.eventId ? { eventId: args.eventId } : {}),
    });
    return !!res.ok;
  } catch (err) {
    console.error("sendCohostInvite failed", err);
    return false;
  }
}

/**
 * Collaborator seat accounting for ONE event.
 *
 * Seats always come from the EVENT OWNER's tier (`ownerUserId`), never the
 * caller's — a platform owner acting on someone else's event, or a collaborator
 * with their own Atelier plan, must not change what the host is allowed.
 *
 * DOWNGRADE BEHAVIOUR (Christopher's rule, no grandfathering): when the owner's
 * plan no longer covers the seats in use, the over-cap collaborators are
 * revoked immediately so the host is always back at or under the cap and can
 * still invite someone new within it. Removal order is deterministic and
 * least-harm: pending invites first, then viewers, then the most recently
 * added co-hosts — the longest-standing co-hosts are the last to lose access.
 * Upgrading restores the seats (nothing is destroyed beyond the revoked rows).
 */
export async function collaboratorSeatState(
  sb: any,
  eventId: string,
  ownerUserId: string,
): Promise<{
  tier: string;
  cap: number;
  used: number;
  canInvite: boolean;
  revokedForDowngrade: number;
}> {
  const [{ resolveUserTier }, { TIER_LIMITS }] = await Promise.all([
    import("@/lib/tier-guards.server"),
    import("@/lib/tier-limits"),
  ]);
  const resolved = await resolveUserTier(sb, ownerUserId);
  const cap = TIER_LIMITS[resolved.tier].collaboratorSeats;
  const { data: rows } = await sb
    .from("event_members")
    .select("id,role,status,expires_at,created_at")
    .eq("event_id", eventId)
    .neq("status", "revoked");
  const nowMs = Date.now();
  type Row = {
    id: string;
    role: "cohost" | "viewer";
    status: string;
    expires_at: string | null;
    created_at: string;
  };
  // Expired, unaccepted invites don't hold a seat.
  const holding = ((rows ?? []) as Row[]).filter((r) => {
    if (r.status === "active") return true;
    return !r.expires_at || new Date(r.expires_at).getTime() > nowMs;
  });

  let revokedForDowngrade = 0;
  if (holding.length > cap) {
    // Keep order: active co-hosts (oldest first) → active viewers → pending.
    const rank = (r: Row) =>
      (r.status === "active" ? 0 : 2) + (r.status === "active" && r.role === "viewer" ? 1 : 0);
    const keepFirst = [...holding].sort(
      (a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at),
    );
    const drop = keepFirst.slice(cap);
    if (drop.length) {
      const { error } = await sb
        .from("event_members")
        .update({ status: "revoked" })
        .in(
          "id",
          drop.map((r) => r.id),
        );
      if (!error) revokedForDowngrade = drop.length;
    }
  }

  const used = Math.max(0, holding.length - revokedForDowngrade);
  return { tier: resolved.tier, cap, used, canInvite: used < cap, revokedForDowngrade };
}

