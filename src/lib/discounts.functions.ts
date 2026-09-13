import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "owner" });
  if (!data) throw new Error("Forbidden");
}

export const listDiscounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("discount_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });

const DiscountInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(40),
  percent_off: z.number().int().min(1).max(100).nullable(),
  amount_off: z.number().min(0).max(10000).nullable(),
  tier_id: z.string().nullable(),
  expires_at: z.string().nullable(),
  max_uses: z.number().int().min(1).nullable(),
  active: z.boolean(),
});

export const upsertDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(DiscountInput, i, "discounts.functions.ts:35"))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const payload = { ...data, code: data.code.trim().toUpperCase() };
    const { error } = data.id
      ? await context.supabase.from("discount_codes").update(payload).eq("id", data.id)
      : await context.supabase.from("discount_codes").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(z.object({ id: z.string().uuid() }), i, "discounts.functions.ts:48"))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("discount_codes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
