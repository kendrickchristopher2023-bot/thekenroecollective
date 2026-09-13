// Product review and feedback for paying Kenroe customers.
//
// One row per submission in `product_feedback`. Nothing is ever shown publicly
// unless the customer ticked the consent box AND an owner approved it.
// The reminder choice lives in `product_feedback_prompt` so "Remind me later"
// and "Don't ask again" follow the customer across devices.
/* eslint-disable @typescript-eslint/no-explicit-any -- the generated Supabase types do not include these new tables yet. */
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SNOOZE_DAYS = 14;
/** A customer must have been around this long before we ever ask. */
const MIN_ACCOUNT_AGE_DAYS = 3;

export type FeedbackPromptState = {
  /** True when the reminder card should be rendered right now. */
  shouldShow: boolean;
  /** Already left feedback. */
  submitted: boolean;
  eligible: boolean;
  /** Name we suggest for a public testimonial. */
  suggestedName: string;
  reason: string;
};

const EnvInput = z
  .object({ environment: z.enum(["live", "sandbox"]).optional() })
  .optional()
  .transform((v) => v ?? {});

function firstName(raw: string | null | undefined, email: string | null | undefined): string {
  const fromName = String(raw ?? "")
    .trim()
    .split(/\s+/)[0];
  if (fromName) return fromName;
  const local = String(email ?? "").split("@")[0] ?? "";
  const cleaned =
    local
      .replace(/[._-]+/g, " ")
      .trim()
      .split(/\s+/)[0] ?? "";
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Usage signal: an active paid subscription, an account at least a few days
 * old, and at least one real thing built (an event or an eCard).
 */
export const getFeedbackPromptState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(EnvInput, i, "product-feedback.functions.ts:53"))
  .handler(async ({ data, context }): Promise<FeedbackPromptState> => {
    const sb = context.supabase as any;
    const userId = context.userId;

    const [{ data: promptRow }, { data: mine }, { data: profile }] = await Promise.all([
      sb
        .from("product_feedback_prompt")
        .select("snooze_until,dismissed_forever,submitted_at")
        .eq("user_id", userId)
        .maybeSingle(),
      sb.from("product_feedback").select("id").eq("user_id", userId).limit(1),
      sb.from("profiles").select("display_name,created_at").eq("id", userId).maybeSingle(),
    ]);

    const suggestedName = firstName(profile?.display_name, (context.claims as any)?.email ?? null);
    const submitted = (mine?.length ?? 0) > 0 || !!promptRow?.submitted_at;

    const base = { submitted, suggestedName };
    if (submitted)
      return { ...base, shouldShow: false, eligible: true, reason: "already_submitted" };
    if (promptRow?.dismissed_forever)
      return { ...base, shouldShow: false, eligible: true, reason: "dismissed_forever" };
    if (promptRow?.snooze_until && new Date(promptRow.snooze_until) > new Date())
      return { ...base, shouldShow: false, eligible: true, reason: "snoozed" };

    const { data: paying } = await sb.rpc("has_active_subscription", {
      user_uuid: userId,
      check_env: data.environment ?? "live",
    });
    if (paying !== true)
      return { ...base, shouldShow: false, eligible: false, reason: "not_paying" };

    const createdAt = profile?.created_at ? new Date(profile.created_at).getTime() : Date.now();
    const ageDays = (Date.now() - createdAt) / 86_400_000;
    if (ageDays < MIN_ACCOUNT_AGE_DAYS)
      return { ...base, shouldShow: false, eligible: false, reason: "too_new" };

    const [{ data: events }, { data: ecards }] = await Promise.all([
      sb.from("events").select("id").eq("user_id", userId).limit(1),
      sb.from("ecards").select("id").eq("organizer_user_id", userId).limit(1),
    ]);
    const built = (events?.length ?? 0) > 0 || (ecards?.length ?? 0) > 0;
    if (!built) return { ...base, shouldShow: false, eligible: false, reason: "no_usage_yet" };

    return { ...base, shouldShow: true, eligible: true, reason: "eligible" };
  });

const ChoiceInput = z.object({ choice: z.enum(["later", "never"]) });

export const setFeedbackPromptChoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(ChoiceInput, i, "product-feedback.functions.ts:105"))
  .handler(async ({ data, context }) => {
    const row: Record<string, unknown> = { user_id: context.userId };
    if (data.choice === "never") {
      row.dismissed_forever = true;
    } else {
      row.snooze_until = new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString();
    }
    const { error } = await (context.supabase as any)
      .from("product_feedback_prompt")
      .upsert(row, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SubmitInput = z.object({
  nps: z.number().int().min(0).max(10),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(4000).optional().nullable(),
  allowPublic: z.boolean().default(false),
  publicName: z.string().max(80).optional().nullable(),
});

export const submitProductFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(SubmitInput, i, "product-feedback.functions.ts:130"))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const comment = data.comment?.trim() ? data.comment.trim() : null;
    const publicName = data.allowPublic && data.publicName?.trim() ? data.publicName.trim() : null;

    const { error } = await sb.from("product_feedback").insert({
      user_id: context.userId,
      nps: data.nps,
      rating: data.rating,
      comment,
      allow_public: data.allowPublic,
      public_name: publicName,
    });
    if (error) throw new Error(error.message);

    const { error: promptError } = await sb
      .from("product_feedback_prompt")
      .upsert(
        { user_id: context.userId, submitted_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (promptError) throw new Error(promptError.message);
    return { ok: true };
  });

// --- Owner Report surfacing (read only) ---

export type FeedbackSummary = {
  responses: number;
  avgRating: number | null;
  avgNps: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number | null;
  recent: Array<{
    id: string;
    rating: number;
    nps: number;
    comment: string | null;
    allowPublic: boolean;
    approved: boolean;
    createdAt: string;
  }>;
};

const RangeInput = z.object({ since: z.string(), until: z.string() });

export const getOwnerFeedbackSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(RangeInput, i, "product-feedback.functions.ts:181"))
  .handler(async ({ data, context }): Promise<FeedbackSummary> => {
    const { assertOwnerAccess } = await import("@/lib/owner-guard.server");
    await assertOwnerAccess(context.supabase as any, context.userId);

    const { data: rows, error } = await (context.supabase as any)
      .from("product_feedback")
      .select("id,rating,nps,comment,allow_public,approved,created_at")
      .gte("created_at", data.since)
      .lte("created_at", data.until)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as Array<{
      id: string;
      rating: number;
      nps: number;
      comment: string | null;
      allow_public: boolean;
      approved: boolean;
      created_at: string;
    }>;
    const responses = list.length;
    const sum = (pick: (r: (typeof list)[number]) => number) =>
      list.reduce((acc, r) => acc + pick(r), 0);
    const promoters = list.filter((r) => r.nps >= 9).length;
    const passives = list.filter((r) => r.nps >= 7 && r.nps <= 8).length;
    const detractors = list.filter((r) => r.nps <= 6).length;

    return {
      responses,
      avgRating: responses ? sum((r) => r.rating) / responses : null,
      avgNps: responses ? sum((r) => r.nps) / responses : null,
      promoters,
      passives,
      detractors,
      npsScore: responses ? Math.round(((promoters - detractors) / responses) * 100) : null,
      // The owner panel filters/sorts/exports these client-side, so return the
      // whole period (capped at the query limit) rather than only the last 8.
      recent: list.map((r) => ({
        id: r.id,
        rating: r.rating,
        nps: r.nps,
        comment: r.comment,
        allowPublic: r.allow_public,
        approved: r.approved,
        createdAt: r.created_at,
      })),
    };
  });

// --- Public testimonials (safe read path) ---

export type PublicTestimonial = {
  publicName: string;
  rating: number;
  comment: string;
  createdAt: string;
};

export const listPublicTestimonials = createServerFn({ method: "GET" })
  .inputValidator(
    (i: unknown) =>
      parseInput(z
        .object({ limit: z.number().int().min(1).max(50).optional() })
        .optional(), i, "product-feedback.functions.ts:248") ?? {},
  )
  .handler(async ({ data }): Promise<PublicTestimonial[]> => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const sb = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: any, init: any) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
            h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: rows, error } = await sb.rpc("get_public_testimonials", {
      _limit: data?.limit ?? 12,
    });
    if (error) return [];
    return ((rows ?? []) as any[]).map((r) => ({
      publicName: String(r.public_name ?? "A Kenroe customer"),
      rating: Number(r.rating ?? 5),
      comment: String(r.comment ?? ""),
      createdAt: String(r.created_at ?? ""),
    }));
  });
