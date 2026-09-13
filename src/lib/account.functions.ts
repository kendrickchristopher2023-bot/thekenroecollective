// Account-level actions: data export, deletion request, deletion cancel.
// All routed through requireSupabaseAuth so the caller is always the owner.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ExportResult = {
  generated_at: string;
  user: { id: string; email: string | null };
  profile: any;
  events: any[];
  referrals: any[];
  subscriptions: any[];
  support_tickets: any[];
};

/**
 * Return every row keyed to the caller's user_id across the tables that hold
 * their personal data.  Meant to be handed straight to the browser as a
 * downloadable JSON blob (GDPR / CCPA data-portability).
 */
export const exportMyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExportResult> => {
    const { supabase, userId } = context;
    const [profile, events, referrals, subs, tickets, user] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("events").select("*").eq("user_id", userId),
      supabase
        .from("referrals")
        .select("*")
        .or(`referrer_user_id.eq.${userId},referred_user_id.eq.${userId}`),
      supabase.from("subscriptions").select("*").eq("user_id", userId),
      // ai_draft (internal AI reply draft) is not readable by the authenticated role.
      supabase
        .from("support_tickets")
        .select("id,user_id,contact_email,contact_name,subject,message,final_reply,status,created_at,updated_at")
        .eq("user_id", userId),
      supabase.auth.getUser(),
    ]);
    return {
      generated_at: new Date().toISOString(),
      user: {
        id: userId,
        email: user.data.user?.email ?? null,
      },
      profile: profile.data ?? null,
      events: events.data ?? [],
      referrals: referrals.data ?? [],
      subscriptions: subs.data ?? [],
      support_tickets: tickets.data ?? [],
    };
  });

/**
 * Mark the current user's profile for deletion. A cron job hard-deletes the
 * auth user + cascades after 30 days.  Idempotent; returns the timestamp.
 */
export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ requested_at: string } | { error: string }> => {
    // Never let a prospect delete the shared demo account.
    const { assertNotDemo } = await import("@/lib/demo-mode.server");
    await assertNotDemo("account deletion");
    const { data, error } = await context.supabase.rpc("request_account_deletion");

    if (error) return { error: error.message };
    return { requested_at: data as unknown as string };
  });

/** Cancel a pending deletion. Safe to call even if none was pending. */
export const cancelAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true } | { error: string }> => {
    const { error } = await context.supabase.rpc("cancel_account_deletion");
    if (error) return { error: error.message };
    return { ok: true };
  });

/** Reads deletion_requested_at from the caller's profile (for banner display). */
export const getDeletionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ requested_at: string | null }> => {
    const { data } = await context.supabase
      .from("profiles")
      .select("deletion_requested_at")
      .eq("id", context.userId)
      .maybeSingle();
    return { requested_at: (data as any)?.deletion_requested_at ?? null };
  });
