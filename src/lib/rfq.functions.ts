import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { friendlyDbError } from "@/lib/db-error-message";

const CATEGORIES = [
  "Venue", "Caterer", "Photographer", "Videographer", "Musician/Band", "DJ",
  "Florist", "Baker", "Bartender", "Planner", "Rentals", "Officiant",
  "Transportation", "Hair & Makeup", "Other",
] as const;

export const RFQ_CATEGORIES = CATEGORIES;

// Map RFQ category → equivalent vendor-profile categories used in public.vendors.
// (Vendor categories use slightly different labels.)
const VENDOR_CATEGORY_MAP: Record<typeof CATEGORIES[number], string[]> = {
  "Venue": ["Venue"],
  "Caterer": ["Catering"],
  "Photographer": ["Photography"],
  "Videographer": ["Videography"],
  "Musician/Band": ["Band", "DJ / Music"],
  "DJ": ["DJ / Music"],
  "Florist": ["Florist"],
  "Baker": ["Cake & Dessert"],
  "Bartender": ["Bar Service"],
  "Planner": ["Planner / Coordinator"],
  "Rentals": ["Rentals"],
  "Officiant": ["Officiant"],
  "Transportation": ["Transportation"],
  "Hair & Makeup": ["Hair & Makeup"],
  "Other": ["Other"],
};

const CreateInput = z.object({
  subject: z.string().min(3).max(120),
  category: z.enum(CATEGORIES),
  location: z.string().max(120).optional(),
  message: z.string().min(10).max(4000),
  budget_min: z.number().nonnegative().optional(),
  budget_max: z.number().nonnegative().optional(),
  event_date: z.string().optional(),
  guest_count: z.number().int().nonnegative().optional(),
  vendor_id: z.string().uuid().optional(),
  vendor_cap: z.number().int().min(1).max(25).optional(),
});

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

// Vendor matching + fan-out lives in @/lib/rfq-fanout.server (server-only).


function getOrigin(): string {
  try {
    const req = getRequest();
    if (req?.url) {
      const u = new URL(req.url);
      return `${u.protocol}//${u.host}`;
    }
  } catch {
    // not in a request context
  }
  return "https://thekenroecollective.com";
}

export const createRfq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(CreateInput, d, "rfq.functions.ts:76"))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // vendorRfq is a Host+ feature per tier-config.ts — was defined but never
    // enforced, so every free-tier user could post unlimited RFQs.
    const { assertMinTier } = await import("@/lib/tier-guards.server");
    await assertMinTier(supabase, userId, "host", {
      message: "Requesting vendor quotes is available on Host and Atelier plans.",
    });

    const { data: row, error } = await supabase
      .from("rfq_requests")
      .insert({
        requester_user_id: userId,
        subject: data.subject,
        category: data.category,
        location: data.location ?? null,
        message: data.message,
        budget_min: data.budget_min ?? null,
        budget_max: data.budget_max ?? null,
        event_date: data.event_date ?? null,
        guest_count: data.guest_count ?? null,
        vendor_id: data.vendor_id ?? null,
        status: "open",
      } as any)
      .select("id")
      .single();
    if (error) return { error: friendlyDbError(error, "the quote request") };

    const rfqId = row!.id as string;
    let invitedCount = 0;
    try {
      const { fanOutRfqInvitations } = await import("@/lib/rfq-fanout.server");
      invitedCount = await fanOutRfqInvitations({
        rfqId,
        subject: data.subject,
        category: data.category,
        location: data.location ?? null,
        eventDate: data.event_date ?? null,
        guestCount: data.guest_count ?? null,
        budgetMax: data.budget_max ?? null,
        brief: data.message,
        pinnedVendorId: data.vendor_id,
        limit: data.vendor_cap ?? 10,
      });
    } catch (err) {
      console.error("createRfq fanout failed", err);
    }

    return { ok: true as const, id: rfqId, invitedCount };
  });

export const listMyRfqs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("rfq_requests")
      .select("id,subject,category,status,event_date,location,created_at,awarded_vendor_id")
      .eq("requester_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(friendlyDbError(error, "the quote request"));
    return data ?? [];
  });

export const getRfq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d, "rfq.functions.ts:143"))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rfq, error } = await supabase
      .from("rfq_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !rfq) throw new Error(error?.message ?? "Not found");
    if ((rfq as any).requester_user_id !== userId) {
      // Vendors view via their own RLS rules.
    }
    const { data: msgs } = await (supabase as any)
      .from("rfq_messages")
      .select("id,vendor_id,sender_user_id,body,bid_amount,is_bid,availability_note,bid_status,created_at")
      .eq("rfq_id", data.id)
      .order("created_at", { ascending: true });
    const vendorIds: string[] = Array.from(
      new Set((msgs ?? []).map((m: any) => m.vendor_id).filter(Boolean)),
    ) as string[];
    let vendorMap: Record<
      string,
      { name: string; slug: string; verified: boolean; heroImage: string | null; avgRating: number; reviewCount: number }
    > = {};
    if (vendorIds.length) {
      const [{ data: vs }, { data: reviews }] = await Promise.all([
        (supabase as any).from("vendors_public").select("id,name,slug,status,hero_image").in("id", vendorIds),
        (supabase as any).from("vendor_reviews_public").select("vendor_id,rating").in("vendor_id", vendorIds),
      ]);
      const ratingsByVendor = new Map<string, number[]>();
      for (const r of (reviews ?? []) as Array<{ vendor_id: string; rating: number }>) {
        const arr = ratingsByVendor.get(r.vendor_id);
        if (arr) arr.push(r.rating); else ratingsByVendor.set(r.vendor_id, [r.rating]);
      }
      vendorMap = Object.fromEntries(
        (vs ?? []).map((v: any) => {
          const ratings = ratingsByVendor.get(v.id) ?? [];
          const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
          return [
            v.id,
            { name: v.name, slug: v.slug, verified: v.status === "verified", heroImage: v.hero_image ?? null, avgRating, reviewCount: ratings.length },
          ];
        }),
      );
    }
    const { data: invitations } = await supabase
      .from("rfq_invitations")
      .select("id,vendor_id,business_name,email,status,responded_at,sent_at")
      .eq("rfq_id", data.id);
    return { rfq, messages: msgs ?? [], vendorMap, invitations: invitations ?? [] };
  });

export const postRfqMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      rfq_id: z.string().uuid(),
      body: z.string().min(1).max(4000),
      is_bid: z.boolean().optional(),
      bid_amount: z.number().nonnegative().optional(),
      availability_note: z.string().max(500).optional(),
      vendor_id: z.string().uuid().optional(),
    }), d, "rfq.functions.ts:198"),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any).from("rfq_messages").insert({
      rfq_id: data.rfq_id,
      sender_user_id: userId,
      body: data.body,
      is_bid: !!data.is_bid,
      bid_amount: data.bid_amount ?? null,
      availability_note: data.availability_note ?? null,
      vendor_id: data.vendor_id ?? null,
    });
    if (error) return { error: friendlyDbError(error, "the quote request") };

    // If a vendor posted a bid in-app, notify the requester too.
    if (data.is_bid && data.vendor_id) {
      await notifyRequesterOfBid({
        rfqId: data.rfq_id,
        vendorId: data.vendor_id,
        bidAmount: data.bid_amount,
        availabilityNote: data.availability_note,
        body: data.body,
      });
    }
    return { ok: true as const };
  });

export const acceptBid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({ rfq_id: z.string().uuid(), message_id: z.string().uuid() }), d, "rfq.functions.ts:236"),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rfq } = await supabase
      .from("rfq_requests")
      .select("requester_user_id,subject")
      .eq("id", data.rfq_id)
      .maybeSingle();
    if (!rfq || (rfq as any).requester_user_id !== userId) return { error: "Forbidden" };
    const { data: bid } = await (supabase as any)
      .from("rfq_messages")
      .select("vendor_id")
      .eq("id", data.message_id)
      .maybeSingle();
    if (!bid?.vendor_id) return { error: "Bid has no vendor" };

    await (supabase as any).from("rfq_messages")
      .update({ bid_status: "declined" })
      .eq("rfq_id", data.rfq_id).eq("is_bid", true);
    await (supabase as any).from("rfq_messages")
      .update({ bid_status: "accepted" })
      .eq("id", data.message_id);
    await supabase.from("rfq_requests")
      .update({
        status: "awarded",
        awarded_vendor_id: bid.vendor_id,
        closed_at: new Date().toISOString(),
      } as any)
      .eq("id", data.rfq_id);

    // Best-effort: email all other invitees a courteous "position filled" note.
    let notified = 0;
    try {
      const { notifyPositionFilled } = await import("@/lib/rfq-fanout.server");
      notified = await notifyPositionFilled({
        rfqId: data.rfq_id,
        awardedVendorId: bid.vendor_id as string,
        subject: ((rfq as any).subject ?? "your event request") as string,
      });
    } catch (err) {
      console.error("notifyPositionFilled failed", err);
    }
    return { ok: true as const, notified };
  });

export const declineRfqByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      token: z.string().min(8).max(120),
      reason: z.string().max(200).optional(),
    }), d, "rfq.functions.ts:284"),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: res, error } = await sb.rpc("decline_rfq_invitation_by_token" as any, {
      _token: data.token,
      _reason: data.reason ?? null,
    });
    if (error) return { error: friendlyDbError(error, "the quote request") };
    return res as any;
  });

export const closeRfq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d, "rfq.functions.ts:301"))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("rfq_requests")
      .update({ status: "closed", closed_at: new Date().toISOString() } as any)
      .eq("id", data.id)
      .eq("requester_user_id", userId);
    if (error) return { error: friendlyDbError(error, "the quote request") };
    return { ok: true as const };
  });

// ── Vendor inbox ──────────────────────────────────────────────────────────
export const listMyVendorInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // public.vendors is PRIVACY LOCKED: read with the service role, scoped to
    // the authenticated caller's own vendor rows.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: myVendors } = await supabaseAdmin
      .from("vendors")
      .select("id,name")
      .eq("owner_user_id", userId);
    const ids = (myVendors ?? []).map((v: any) => v.id);
    if (!ids.length) return [];
    const { data: invs } = await supabase
      .from("rfq_invitations")
      .select("id,rfq_id,vendor_id,status,sent_at,responded_at,claim_token")
      .in("vendor_id", ids)
      .order("sent_at", { ascending: false })
      .limit(100);
    const rfqIds = Array.from(new Set((invs ?? []).map((i: any) => i.rfq_id)));
    if (!rfqIds.length) return [];
    const { data: rfqs } = await supabase
      .from("rfq_requests")
      .select("id,subject,category,location,event_date,status,created_at,budget_max")
      .in("id", rfqIds);
    const rfqMap = Object.fromEntries((rfqs ?? []).map((r: any) => [r.id, r]));
    return (invs ?? []).map((i: any) => ({ ...i, rfq: rfqMap[i.rfq_id] }));
  });

// ── Public token endpoints (no auth) ──────────────────────────────────────
export const getRfqByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => parseInput(z.object({ token: z.string().min(8).max(120) }), d, "rfq.functions.ts:345"))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: res, error } = await sb.rpc("get_rfq_by_token" as any, { _token: data.token });
    if (error) return { error: friendlyDbError(error, "the quote request") };
    return res as any;
  });

export const postRfqBidByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      token: z.string().min(8).max(120),
      bid_amount: z.number().nonnegative().optional(),
      availability_note: z.string().max(500).optional(),
      body: z.string().min(1).max(4000),
    }), d, "rfq.functions.ts:355"),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: res, error } = await sb.rpc("post_rfq_bid_by_token" as any, {
      _token: data.token,
      _bid_amount: data.bid_amount ?? 0,
      _availability_note: data.availability_note ?? "",
      _body: data.body,
    });
    if (error) return { error: friendlyDbError(error, "the quote request") };
    const out = res as any;
    if (out?.error) return { error: out.error as string };

    // Notify the requester (best-effort)
    if (out?.rfq_id) {
      await notifyRequesterOfBid({
        rfqId: out.rfq_id as string,
        // token bids carry vendor on the invitation — we can look it up
        bidAmount: data.bid_amount,
        availabilityNote: data.availability_note,
        body: data.body,
        token: data.token,
      });
    }
    return { ok: true as const, rfqId: out?.rfq_id as string };
  });

// ── Internal helper: email the RFQ requester when a bid is posted ─────────
async function notifyRequesterOfBid(args: {
  rfqId: string;
  vendorId?: string;
  token?: string;
  bidAmount?: number;
  availabilityNote?: string;
  body: string;
}): Promise<void> {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const admin = createClient<Database>(url, key, { auth: { persistSession: false } });

    const { data: rfq } = await admin
      .from("rfq_requests")
      .select("id,subject,requester_user_id")
      .eq("id", args.rfqId)
      .maybeSingle();
    if (!rfq) return;

    let vendorId = args.vendorId;
    if (!vendorId && args.token) {
      const { data: inv } = await admin
        .from("rfq_invitations")
        .select("vendor_id")
        .eq("claim_token", args.token)
        .maybeSingle();
      vendorId = (inv as any)?.vendor_id ?? undefined;
    }
    let vendorName = "A vendor";
    if (vendorId) {
      const { data: v } = await admin
        .from("vendors").select("name").eq("id", vendorId).maybeSingle();
      if (v?.name) vendorName = v.name;
    }

    // Requester email lookup via auth admin
    const { data: userRes } = await admin.auth.admin.getUserById((rfq as any).requester_user_id);
    const email = userRes?.user?.email;
    if (!email) return;

    const origin = getOrigin();
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    await enqueueTransactionalEmailServer({
      templateName: "rfq-new-bid",
      recipientEmail: email,
      idempotencyKey: `rfq-bid-${args.rfqId}-${vendorId ?? "tok"}-${Date.now()}`,
      label: "rfq-new-bid",
      templateData: {
        vendorName,
        subject: (rfq as any).subject,
        bidAmount: args.bidAmount,
        availabilityNote: args.availabilityNote ?? "",
        body: args.body,
        threadUrl: `${origin}/rfq/${args.rfqId}`,
      },
    });
  } catch (err) {
    console.error("notifyRequesterOfBid failed", err);
  }
}
