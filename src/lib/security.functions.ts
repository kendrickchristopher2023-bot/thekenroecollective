import { toUserMessage } from "@/lib/user-error";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Record a sign-in from a device fingerprint. If this is the first time we
 * see the (user, device_hash) pair, send a security email to the user.
 * All failures are swallowed — auth flows must never break because we
 * couldn't record a device.
 */
export const recordSignInDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { deviceHash: string; userAgent?: string; ipHash?: string }) => input)
  .handler(async ({ data, context }) => {
    const deviceHash = (data.deviceHash || "").slice(0, 128);
    if (!deviceHash || deviceHash.length < 8) return { ok: false, reason: "invalid_device" };

    const userAgent = (data.userAgent || "").slice(0, 500) || null;
    const ipHash = (data.ipHash || "").slice(0, 128) || null;

    // Check whether this device is already known.
    const { data: existing } = await context.supabase
      .from("user_known_devices")
      .select("id")
      .eq("user_id", context.userId)
      .eq("device_hash", deviceHash)
      .maybeSingle();

    if (existing) {
      await context.supabase
        .from("user_known_devices")
        .update({ last_seen_at: new Date().toISOString(), ip_hash: ipHash ?? undefined })
        .eq("id", (existing as any).id);
      return { ok: true, newDevice: false };
    }

    // Insert as a known device (use RLS-bypassing admin so the write reliably lands).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("user_known_devices").insert({
        user_id: context.userId,
        device_hash: deviceHash,
        user_agent: userAgent,
        ip_hash: ipHash,
      } as any);

      // Look up the user's email + display name for the security email.
      const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
      const email = userRes?.user?.email;
      const displayName =
        (userRes?.user?.user_metadata as any)?.display_name ||
        (email ? email.split("@")[0] : "there");

      // Skip the very first device we ever record for this account (initial sign-up).
      const { count } = await supabaseAdmin
        .from("user_known_devices")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId);

      if (email && (count ?? 0) > 1) {
        const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
        await enqueueTransactionalEmailServer({
          templateName: "security-new-device",
          recipientEmail: email,
          idempotencyKey: `new-device:${context.userId}:${deviceHash.slice(0, 24)}`,
          label: "security-new-device",
          templateData: {
            displayName,
            userAgent: userAgent ?? "a new device",
            when: new Date().toUTCString(),
          },
        });
      }
    } catch (err) {
      console.error("recordSignInDevice failed:", err);
      return { ok: false, reason: "insert_failed" };
    }

    return { ok: true, newDevice: true };
  });

/** List known devices for the signed-in user (for the profile Security tab). */
export const listMyDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_known_devices")
      .select("id, device_hash, user_agent, label, first_seen_at, last_seen_at")
      .eq("user_id", context.userId)
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { devices: data ?? [] };
  });

/** Rename a device to something friendlier. */
export const updateMyDeviceLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; label: string }) => input)
  .handler(async ({ data, context }) => {
    const label = (data.label || "").trim().slice(0, 80);
    const { error } = await context.supabase
      .from("user_known_devices")
      .update({ label: label || null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Forget a device — next sign-in from it will trigger a new-device email again. */
export const revokeMyDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_known_devices")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Sign out all other sessions for the current user (keeps this session active).
 * Uses Auth Admin API to revoke all refresh tokens, then the current session
 * is re-established by the still-valid access token in the caller's tab.
 */
export const signOutOtherSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Revoke all refresh tokens for the user. Access tokens keep working
      // until they expire (~1h), so the caller's current tab stays signed in
      // until their next refresh.
      const { error } = await supabaseAdmin.auth.admin.signOut(context.userId, "others" as any);
      if (error) throw new Error(error.message);
      return { ok: true };
    } catch (e) {
      // Fallback: revoke all sessions if "others" scope isn't supported.
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.auth.admin.signOut(context.userId);
        return { ok: true, allSignedOut: true };
      } catch (err) {
        throw new Error(toUserMessage(err, "Failed"));
      }
    }
  });
