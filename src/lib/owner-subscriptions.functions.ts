import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from "@/lib/stripe.server";

async function assertOwner(supabase: any, userId: string) {
  const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
  await assertOwnerAccess(supabase, userId);
}

export type OwnerSubscriptionRow = {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  product_id: string;
  price_id: string;
  status: string;
  environment: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  created_at: string | null;
};

export const listAllSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OwnerSubscriptionRow[]> => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: subs, error } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Plans held by the demo host or the sample-wedding system account are ours,
    // not revenue, so they never appear in this list.
    const { getDemoUserIds } = await import("@/lib/demo-accounts.server");
    const systemIds = new Set(await getDemoUserIds().catch(() => [] as string[]));
    const list = ((subs ?? []) as any[]).filter((s) => !systemIds.has(s.user_id));
    const userIds = Array.from(new Set(list.map((s) => s.user_id).filter(Boolean)));

    const emailMap: Record<string, string | null> = {};
    for (const uid of userIds) {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        emailMap[uid] = data?.user?.email ?? null;
      } catch {
        emailMap[uid] = null;
      }
    }

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameMap = new Map<string, string | null>(
      (profiles ?? []).map((p: any) => [p.id, p.display_name ?? null]),
    );

    return list.map((s) => ({
      id: s.id,
      user_id: s.user_id,
      email: emailMap[s.user_id] ?? null,
      display_name: nameMap.get(s.user_id) ?? null,
      stripe_subscription_id: s.stripe_subscription_id,
      stripe_customer_id: s.stripe_customer_id,
      product_id: s.product_id,
      price_id: s.price_id,
      status: s.status,
      environment: s.environment,
      current_period_end: s.current_period_end,
      cancel_at_period_end: s.cancel_at_period_end,
      created_at: s.created_at,
    }));
  });

type CancelResult = { ok: true; status: string; cancel_at_period_end: boolean } | { error: string };

export const cancelSubscriptionAsOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscriptionId: string; mode: "immediate" | "period_end" }) => data)
  .handler(async ({ data, context }): Promise<CancelResult> => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: rowErr } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_subscription_id, environment, user_id")
      .eq("id", data.subscriptionId)
      .maybeSingle();
    if (rowErr || !row) return { error: "Subscription not found" };

    const env = (row.environment === "live" ? "live" : "sandbox") as StripeEnv;
    const stripeSubId = (row.stripe_subscription_id as string) ?? "";
    const isManual = !stripeSubId || stripeSubId.startsWith("manual_");

    // Manually created subscriptions have a fake `manual_*` id with nothing
    // behind it in Stripe — cancel them locally instead of calling the API.
    if (isManual) {
      const immediate = data.mode === "immediate";
      const nextStatus = immediate ? "canceled" : "active";
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: nextStatus,
          cancel_at_period_end: !immediate,
          updated_at: new Date().toISOString(),
          ...(immediate ? { current_period_end: new Date().toISOString() } : {}),
        })
        .eq("id", data.subscriptionId);
      if (immediate) {
        await supabaseAdmin
          .from("profiles")
          .update({ tier: "postcard" })
          .eq("id", row.user_id as string);
      }
      return { ok: true, status: nextStatus, cancel_at_period_end: !immediate };
    }

    try {
      const stripe = createStripeClient(env);
      let updated: any;
      if (data.mode === "immediate") {
        updated = await stripe.subscriptions.cancel(stripeSubId);
      } else {
        updated = await stripe.subscriptions.update(stripeSubId, {
          cancel_at_period_end: true,
        });
      }
      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: updated.status,
          cancel_at_period_end: updated.cancel_at_period_end ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.subscriptionId);
      return {
        ok: true,
        status: updated.status,
        cancel_at_period_end: updated.cancel_at_period_end ?? false,
      };
    } catch (e) {
      return { error: getStripeErrorMessage(e) };
    }
  });

const PLAN_TO_PROFILE_TIER: Record<string, "whisper" | "host" | "atelier"> = {
  whisper_onetime: "whisper",
  whisper_monthly: "whisper",
  whisper_yearly: "whisper",
  host_onetime: "host",
  host_monthly: "host",
  host_yearly: "host",
  atelier_onetime: "atelier",
  atelier_monthly: "atelier",
  atelier_yearly: "atelier",
  atelier_trial_30d: "atelier",
};

type CreateManualResult = { ok: true; id: string } | { error: string };

export const createManualSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      email: string;
      priceId:
        | "whisper_onetime"
        | "whisper_monthly"
        | "whisper_yearly"
        | "host_onetime"
        | "host_monthly"
        | "host_yearly"
        | "atelier_onetime"
        | "atelier_monthly"
        | "atelier_yearly";
      periodEnd?: string | null;
      note?: string;
    }) => {
      if (!data.email?.trim()) throw new Error("Email is required");
      if (!PLAN_TO_PROFILE_TIER[data.priceId]) throw new Error("Invalid plan");
      return data;
    },
  )
  .handler(async ({ data, context }): Promise<CreateManualResult> => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Look up user by email across the WHOLE directory. This used to scan only
    // the first 200 accounts, so comps for anyone past that page failed with a
    // misleading "no user found" and silently never applied.
    let targetUserId: string | null = null;
    try {
      const { listAllAuthUsers } = await import("@/lib/admin-directory.server");
      const { users } = await listAllAuthUsers({ force: true });
      const wanted = data.email.trim().toLowerCase();
      targetUserId = users.find((u) => (u.email ?? "").toLowerCase() === wanted)?.id ?? null;
    } catch (e: any) {
      return { error: e?.message || "Failed to look up user" };
    }

    if (!targetUserId) return { error: `No user found with email ${data.email}` };

    const manualId = `manual_${crypto.randomUUID()}`;
    const tier = PLAN_TO_PROFILE_TIER[data.priceId];
    const periodEnd = data.periodEnd ? new Date(data.periodEnd).toISOString() : null;

    // Granting the same plan twice used to stack a second active row, because
    // every call mints a fresh manual id and nothing in the table prevents
    // duplicates. One account still carries a pair from an earlier one-off
    // grant. Reuse any active granted row for this account instead of adding
    // another, so a double click or a re-grant extends the existing comp.
    const { data: existingGranted } = await supabaseAdmin
      .from("subscriptions")
      .select("id, created_at")
      .eq("user_id", targetUserId)
      .eq("status", "active")
      .like("stripe_subscription_id", "manual_%")
      .order("created_at", { ascending: true });

    let subscriptionId: string;
    if (existingGranted && existingGranted.length > 0) {
      const keep = existingGranted[0]!.id as string;
      const { error: updErr } = await supabaseAdmin
        .from("subscriptions")
        .update({
          product_id: `manual_${tier}`,
          price_id: data.priceId,
          status: "active",
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd,
          cancel_at_period_end: false,
        })
        .eq("id", keep);
      if (updErr) return { error: updErr.message };
      subscriptionId = keep;
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("subscriptions")
        .insert({
          user_id: targetUserId,
          stripe_subscription_id: manualId,
          stripe_customer_id: `manual_cust_${targetUserId.slice(0, 8)}`,
          product_id: `manual_${tier}`,
          price_id: data.priceId,
          status: "active",
          environment: "live",
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd,
          cancel_at_period_end: false,
        })
        .select("id")
        .single();
      if (insErr) return { error: insErr.message };
      subscriptionId = inserted!.id as string;
    }


    // Mirror tier onto profile so entitlements pick it up even before next read.
    await supabaseAdmin
      .from("profiles")
      .update({ tier })
      .eq("id", targetUserId);

    return { ok: true, id: subscriptionId };
  });
