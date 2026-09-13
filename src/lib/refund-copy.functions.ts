// The money wording for Kenroe Sound Studio lives in the database so
// Christopher can change a sentence himself. One source: the point of
// purchase, the policy page and the acknowledgement all read from here.
//
// Every save keeps the previous version in refund_copy_history, because a card
// dispute turns on what the policy said on the day of purchase.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseInput } from "@/lib/user-error";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MUSIC_REFUND_FOOTNOTE,
  MUSIC_REFUND_HEADLINE,
  MUSIC_REFUND_POINTS,
} from "@/lib/music-refund-copy";

export type RefundCopy = {
  headline: string;
  points: string[];
  footnote: string;
  updatedAt: string | null;
};

const FALLBACK: RefundCopy = {
  headline: MUSIC_REFUND_HEADLINE,
  points: [...MUSIC_REFUND_POINTS],
  footnote: MUSIC_REFUND_FOOTNOTE,
  updatedAt: null,
};

/** Public read. Falls back to the approved wording if the row is ever missing. */
export const getRefundCopy = createServerFn({ method: "GET" }).handler(async (): Promise<RefundCopy> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("refund_copy")
    .select("headline, points, footnote, updated_at")
    .eq("id", true)
    .maybeSingle();
  if (!data) return FALLBACK;
  const points = Array.isArray(data.points) ? (data.points as unknown[]).map((p) => String(p)) : [];
  return {
    headline: data.headline || FALLBACK.headline,
    points: points.length ? points : FALLBACK.points,
    footnote: data.footnote || FALLBACK.footnote,
    updatedAt: data.updated_at ?? null,
  };
});

const Input = z.object({
  headline: z.string().min(4).max(200),
  points: z.array(z.string().min(4).max(1200)).min(1).max(20),
  footnote: z.string().min(0).max(600),
});

async function requireOwner(context: { supabase: any; userId: string }) {
  for (const role of ["owner", "super_admin", "admin"] as const) {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: role });
    if (data === true) return;
  }
  throw new Error("Forbidden");
}

/** Owner console write. Keeps the outgoing version in the history table first. */
export const updateRefundCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(Input, i, "refund-copy.functions.ts:updateRefundCopy"))
  .handler(async ({ data, context }): Promise<RefundCopy> => {
    await requireOwner(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: current } = await supabaseAdmin
      .from("refund_copy")
      .select("headline, points, footnote")
      .eq("id", true)
      .maybeSingle();
    if (current) {
      await supabaseAdmin.from("refund_copy_history").insert({
        headline: current.headline,
        points: current.points,
        footnote: current.footnote,
        changed_by: context.userId,
      });
    }

    const updatedAt = new Date().toISOString();
    const { error } = await supabaseAdmin.from("refund_copy").upsert({
      id: true,
      headline: data.headline.trim(),
      points: data.points.map((p) => p.trim()).filter(Boolean),
      footnote: data.footnote.trim(),
      updated_at: updatedAt,
      updated_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return {
      headline: data.headline.trim(),
      points: data.points.map((p) => p.trim()).filter(Boolean),
      footnote: data.footnote.trim(),
      updatedAt,
    };
  });

/** Owner console: the dated record of previous versions. */
export const listRefundCopyHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("refund_copy_history")
      .select("id, headline, points, footnote, changed_at")
      .order("changed_at", { ascending: false })
      .limit(20);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      headline: r.headline as string,
      points: Array.isArray(r.points) ? (r.points as unknown[]).map(String) : [],
      footnote: r.footnote as string,
      changedAt: r.changed_at as string,
    }));
  });
