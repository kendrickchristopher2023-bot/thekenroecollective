import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { friendlyDbError } from "@/lib/db-error-message";

// Google Places has no dedicated type for most wedding/event niches (no
// "officiant" or "wedding DJ" place type exists), so categories are phrased
// as natural-language search terms for Text Search rather than mapped to
// Google's fixed `includedType` enum — Text Search's NLP handles "wedding
// officiant near Charlotte, NC" far better than a type filter ever could.
export const VENDOR_DISCOVERY_CATEGORIES = [
  { key: "venues", label: "Venues", query: "wedding and event venue" },
  { key: "caterers", label: "Caterers", query: "catering service" },
  { key: "photographers", label: "Photographers", query: "wedding photographer" },
  { key: "videographers", label: "Videographers", query: "wedding videographer" },
  { key: "musicians", label: "Musicians / Bands", query: "live band for weddings and parties" },
  { key: "djs", label: "DJs", query: "wedding DJ" },
  { key: "florists", label: "Florists", query: "florist" },
  { key: "bakeries", label: "Bakeries", query: "wedding cake bakery" },
  { key: "bartenders", label: "Bartenders", query: "event bartending service" },
  { key: "planners", label: "Planners", query: "wedding planner" },
  { key: "rentals", label: "Party rentals", query: "party equipment rental" },
  { key: "officiants", label: "Officiants", query: "wedding officiant" },
  { key: "transportation", label: "Transportation", query: "limo and party bus rental" },
  { key: "makeup", label: "Hair & Makeup", query: "bridal hair and makeup artist" },
] as const;

export const inviteDiscoveredVendorToBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      rfq_id: z.string().uuid(),
      external_business_id: z.string().max(160),
      business_name: z.string().max(200),
      phone: z.string().max(40).optional(),
    }), d, "vendor-discovery.functions.ts:31"),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Confirm the user owns the RFQ
    const { data: rfq } = await supabase
      .from("rfq_requests")
      .select("requester_user_id")
      .eq("id", data.rfq_id)
      .maybeSingle();
    if (!rfq || (rfq as any).requester_user_id !== userId) return { error: "Forbidden" };

    // rfq_invitations is server-write-only: clients have no INSERT/UPDATE/DELETE
    // privilege, so claim_token values can never be chosen or forged from the
    // browser. Write with the service role only after the ownership check above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await (supabaseAdmin as any)
      .from("rfq_invitations")
      .insert({
        rfq_id: data.rfq_id,
        // Prefixed with the provider so a future second discovery source
        // (or a provider switch) can't collide with an existing Google
        // place id stored here.
        external_business_id: `google:${data.external_business_id}`,
        business_name: data.business_name,
        phone: data.phone ?? null,
      })
      .select("claim_token")
      .single();
    if (error) return { error: friendlyDbError(error, "the vendor request") };

    return { ok: true as const, claim_token: inv!.claim_token as string };
  });
