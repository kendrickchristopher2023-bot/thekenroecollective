import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseInput } from "@/lib/user-error";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_CARD_CAMPAIGN,
  DEFAULT_CARD_DESTINATION,
  isAllowedCardDestination,
} from "@/lib/card-link";

async function requireOwner(context: { supabase: any; userId: string }) {
  for (const role of ["owner", "super_admin", "admin"] as const) {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: role });
    if (data === true) return;
  }
  throw new Error("Forbidden");
}

/** Owner console read: where the card points, plus how often it has been scanned. */
export const getCardLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("site_settings")
      .select("card_destination, card_campaign")
      .eq("id", true)
      .maybeSingle();

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [{ count: total }, { count: last30 }, { count: saves }, { count: saves30 }, { data: recent }] =
      await Promise.all([
        supabaseAdmin.from("card_scans").select("id", { count: "exact", head: true }).neq("action", "save"),
        supabaseAdmin
          .from("card_scans")
          .select("id", { count: "exact", head: true })
          .neq("action", "save")
          .gte("created_at", since),
        supabaseAdmin.from("card_scans").select("id", { count: "exact", head: true }).eq("action", "save"),
        supabaseAdmin
          .from("card_scans")
          .select("id", { count: "exact", head: true })
          .eq("action", "save")
          .gte("created_at", since),
        supabaseAdmin
          .from("card_scans")
          .select("created_at, destination, action, card_slug")
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    return {
      destination: (settings as { card_destination?: string | null } | null)?.card_destination ?? DEFAULT_CARD_DESTINATION,
      campaign: (settings as { card_campaign?: string | null } | null)?.card_campaign ?? DEFAULT_CARD_CAMPAIGN,
      totalScans: total ?? 0,
      scansLast30Days: last30 ?? 0,
      totalSaves: saves ?? 0,
      savesLast30Days: saves30 ?? 0,
      recent: (recent ?? []) as { created_at: string; destination: string; action?: string; card_slug?: string | null }[],
    };
  });

const Input = z.object({
  destination: z.string().min(1).max(500),
  campaign: z.string().min(1).max(60).optional(),
});

/** Owner console write: repoint the printed card without reprinting it. */
export const updateCardLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(Input, i, "card-link.functions.ts:52"))
  .handler(async ({ data, context }) => {
    await requireOwner(context as never);
    const destination = data.destination.trim();
    if (!isAllowedCardDestination(destination)) {
      throw new Error("Use a path like / or /gatherings, or a full address on your own domain.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("site_settings").upsert({
      id: true,
      card_destination: destination,
      card_campaign: (data.campaign ?? DEFAULT_CARD_CAMPAIGN).trim(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true, destination };
  });
