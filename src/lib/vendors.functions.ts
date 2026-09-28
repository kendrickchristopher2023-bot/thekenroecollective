import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { friendlyDbError } from "@/lib/db-error-message";

export const VENDOR_CATEGORIES = [
  "Venue",
  "Catering",
  "Photography",
  "Videography",
  "Florist",
  "DJ / Music",
  "Band",
  "Officiant",
  "Cake & Dessert",
  "Hair & Makeup",
  "Planner / Coordinator",
  "Rentals",
  "Transportation",
  "Stationery",
  "Bar Service",
  "Other",
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ── Marketplace reads (sign-in required) ───────────────────────────────────
// The vendor marketplace is a members-only surface: the full vendor list is
// a competitive asset, so these reads require an authenticated caller. A
// client-side gate alone would be cosmetic.

export const listVendors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z
      .object({
        category: z.string().optional(),
        region: z.string().optional(),
        q: z.string().max(120).optional(),
      }), d ?? {}, "vendors.functions.ts:60"),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { isDemoRequest } = await import("@/lib/demo-mode.server");
    const isDemo = await isDemoRequest();
    let q = (sb as any)
      .from("vendors_public")
      .select("id,slug,name,category,city,region,country,bio,hero_image,logo_url,price_range,status")
      .eq("status", "verified")
      .order("created_at", { ascending: false })
      .limit(60);
    // Seeded demo listings live in the shared database; they belong to the demo
    // environment only and must never appear in the production marketplace.
    if (!isDemo) q = q.not("slug", "like", "demo-%");
    if (data.category) q = q.eq("category", data.category);
    if (data.region) q = q.ilike("region", `%${data.region}%`);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) return { vendors: [], error: friendlyDbError(error, "the vendor request") };
    return { vendors: rows ?? [] };
  });

export const getVendorBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ slug: z.string().min(1).max(80) }), d, "vendors.functions.ts:85"))
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { isDemoRequest } = await import("@/lib/demo-mode.server");
    if (!(await isDemoRequest()) && data.slug.startsWith("demo-")) {
      return { vendor: null, reviews: [] };
    }
    // Reads go through the contact-free public view: it never exposes vendor
    // email/phone or internal review notes to visitors.
    const { data: vendor } = await (sb as any)
      .from("vendors_public")
      .select("id,slug,name,category,city,region,country,bio,website,hero_image,logo_url,gallery,public_phone,public_address,price_range,status,created_at")
      .eq("slug", data.slug)
      .maybeSingle();
    if (!vendor) return { vendor: null, reviews: [] };
    const { data: reviews } = await (sb as any)
      .from("vendor_reviews_public")
      .select("id,rating,body,created_at")
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return { vendor, reviews: reviews ?? [] };
  });


export const listActiveAds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ region: z.string().optional() }), d ?? {}, "vendors.functions.ts:112"))
  .handler(async ({ data }) => {
    const sb = publicClient();
    let q = sb
      .from("active_ad_placements" as any)
      .select("id,headline,blurb,cta_url,hero_image,region,vendor_id")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(12);
    if (data.region) q = q.ilike("region", `%${data.region}%`);
    const { data: rows } = await q;
    return { ads: (rows as any[] | null) ?? [] };
  });

export const logAdEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z
      .object({
        placementId: z.string().uuid(),
        kind: z.enum(["impression", "click"]),
      }), d, "vendors.functions.ts:134"),
  )
  .handler(async ({ data }) => {
    const sb = publicClient();
    await sb.from("ad_impressions").insert({ placement_id: data.placementId, kind: data.kind });
    return { ok: true as const };
  });

// ── Authenticated: vendor profile ──────────────────────────────────────────

const VendorWriteSchema = z.object({
  name: z.string().min(2).max(120),
  category: z.string().min(1),
  city: z.string().max(80).optional().nullable(),
  region: z.string().max(80).optional().nullable(),
  country: z.string().max(80).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  website: z.string().url().optional().nullable().or(z.literal("")),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  hero_image: z.string().url().optional().nullable().or(z.literal("")),
  /** Separate brand mark, shown as a badge over the cover photo. */
  logo_url: z.string().url().optional().nullable().or(z.literal("")),
  /** Up to 8 portfolio images. */
  gallery: z.array(z.string().url()).max(8).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  /** Opt-in flags. Phone and address stay private unless the vendor says so. */
  show_phone: z.boolean().optional(),
  show_address: z.boolean().optional(),
  price_range: z.string().max(40).optional().nullable(),
});

/**
 * Fields a visitor sees on a live listing. Changing any of them sends a
 * verified profile back through review, so an approved listing cannot be
 * swapped out for unreviewed content after the fact.
 */
const REVIEWABLE_FIELDS = [
  "name",
  "category",
  "bio",
  "website",
  "hero_image",
  "logo_url",
  "gallery",
  "address",
  "city",
  "region",
  "country",
] as const;

export const upsertMyVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(VendorWriteSchema, d, "vendors.functions.ts:187"))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // public.vendors is PRIVACY LOCKED: anon and authenticated hold zero
    // privileges on it, so this write runs with the service role and is scoped
    // to the caller's own row by owner_user_id. Never re-grant the base table.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("vendors")
      .select("*")
      .eq("owner_user_id", userId)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      ...data,
      website: data.website || null,
      email: data.email || null,
      hero_image: data.hero_image || null,
      logo_url: data.logo_url || null,
      address: data.address || null,
      gallery: data.gallery ?? [],
      show_phone: data.show_phone ?? false,
      show_address: data.show_address ?? false,
      owner_user_id: userId,
    };

    if (existing) {
      const prev = existing as Record<string, unknown>;
      const publicContentChanged = REVIEWABLE_FIELDS.some(
        (f) => JSON.stringify(prev[f] ?? null) !== JSON.stringify(payload[f] ?? null),
      );
      // A live listing whose public content changed goes back to pending for a
      // quick admin pass; contact toggles alone never unpublish a profile.
      const needsReview = prev.status === "verified" && publicContentChanged;
      if (needsReview) payload.status = "pending";
      const { error } = await supabaseAdmin
        .from("vendors")
        .update(payload as never)
        .eq("id", existing.id)
        .eq("owner_user_id", userId);
      if (error) return { error: friendlyDbError(error, "the vendor request") };
      if (needsReview && !prev.is_demo && !String(prev.slug ?? "").startsWith("demo-")) {
        const { notifyAdminsByEmail } = await import("@/lib/email/notify-admins");
        await notifyAdminsByEmail({
          kind: "vendor_created",
          title: `Vendor profile edited, needs re-review: ${data.name}`,
          body: "A live listing changed its public details and is back in the review queue.",
          link: `/vendors/${existing.slug}`,
        });
      }
      return { ok: true as const, slug: existing.slug, needsReview };
    }
    const base = slugify(data.name) || "vendor";
    const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { error } = await supabaseAdmin.from("vendors").insert({ ...payload, slug } as never);
    if (error) return { error: friendlyDbError(error, "the vendor request") };
    // Demo-seeded vendors must never ping the owner inbox. Mirrors the
    // notify_new_vendor DB trigger, which skips is_demo rows and demo-* slugs;
    // without the same check here the email path leaked what the trigger
    // deliberately suppressed.
    const { data: created } = await supabaseAdmin
      .from("vendors")
      .select("is_demo,slug")
      .eq("slug", slug)
      .maybeSingle();
    const isDemoVendor = Boolean(created?.is_demo) || slug.startsWith("demo-");
    if (isDemoVendor) return { ok: true as const, slug };
    const { notifyAdminsByEmail } = await import("@/lib/email/notify-admins");
    await notifyAdminsByEmail({
      kind: "vendor_created",
      title: `New vendor profile: ${data.name}`,
      body: `${data.category ?? ""}${data.city ? " • " + data.city : ""}`.trim() || undefined,
      link: `/vendors/${slug}`,
    });
    return { ok: true as const, slug };
  });

export const getMyVendor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Use admin client so the owner can read their own email/phone (those
    // columns are revoked from the authenticated role to prevent scraping).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("vendors")
      .select("*")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    return { vendor: data ?? null };
  });

// ── RFQs ───────────────────────────────────────────────────────────────────

// The "Request a quote" modal on /vendors/$slug is the ONLY caller of this
// function. It used to send no category, so every row it wrote landed with
// category NULL and could never be matched, reported on, or fanned out
// sensibly. The form now sends one, prefilled from the vendor's own trade.
export const RFQ_CATEGORY_CHOICES = [
  "Venue", "Caterer", "Photographer", "Videographer", "Musician/Band", "DJ",
  "Florist", "Baker", "Bartender", "Planner", "Rentals", "Officiant",
  "Transportation", "Hair & Makeup", "Other",
] as const;
export type RfqCategoryChoice = typeof RFQ_CATEGORY_CHOICES[number];

/** Vendor-profile trade label → the request category a host would pick. */
const CATEGORY_FROM_VENDOR: Record<string, RfqCategoryChoice> = {
  "Venue": "Venue",
  "Catering": "Caterer",
  "Photography": "Photographer",
  "Videography": "Videographer",
  "Band": "Musician/Band",
  "DJ / Music": "DJ",
  "Florist": "Florist",
  "Cake & Dessert": "Baker",
  "Bar Service": "Bartender",
  "Planner / Coordinator": "Planner",
  "Rentals": "Rentals",
  "Officiant": "Officiant",
  "Transportation": "Transportation",
  "Hair & Makeup": "Hair & Makeup",
};

export function rfqCategoryForVendor(vendorCategory?: string | null): RfqCategoryChoice {
  if (!vendorCategory) return "Other";
  return CATEGORY_FROM_VENDOR[vendorCategory] ?? "Other";
}

export const createRfq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z
      .object({
        vendorId: z.string().uuid(),
        subject: z.string().min(2).max(200),
        category: z.enum(RFQ_CATEGORY_CHOICES).optional(),
        location: z.string().max(120).optional(),
        message: z.string().min(2).max(4000),
        budgetMin: z.number().min(0).max(10_000_000).optional(),
        budgetMax: z.number().min(0).max(10_000_000).optional(),
        eventDate: z.string().optional(),
        guestCount: z.number().int().min(0).max(100_000).optional(),
        eventId: z.string().max(64).optional(),
      }), d, "vendors.functions.ts:294"),
  )

  .handler(async ({ data, context }) => {
    // vendorRfq is a Host+ feature per tier-config.ts — was defined but never
    // enforced, so every free-tier user could message vendors for quotes.
    const { assertMinTier } = await import("@/lib/tier-guards.server");
    await assertMinTier(context.supabase, context.userId, "host", {
      message: "Requesting vendor quotes is available on Host and Atelier plans.",
    });

    const { error, data: row } = await context.supabase
      .from("rfq_requests")
      .insert({
        requester_user_id: context.userId,
        vendor_id: data.vendorId,
        subject: data.subject,
        category: data.category ?? null,
        location: data.location ?? null,
        message: data.message,
        budget_min: data.budgetMin ?? null,
        budget_max: data.budgetMax ?? null,
        event_date: data.eventDate || null,
        guest_count: data.guestCount ?? null,
        event_id: data.eventId ?? null,

      })
      .select("id")
      .single();
    if (error) return { error: friendlyDbError(error, "the vendor request") };
    // Seed initial message
    await context.supabase.from("rfq_messages").insert({
      rfq_id: row.id,
      sender_user_id: context.userId,
      body: data.message,
    });

    // Create the invitation row and email the vendor. Previously this direct
    // "Request a quote" path only wrote rfq_requests, so the vendor was never
    // actually invited or notified.
    let invited = 0;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: v } = await supabaseAdmin
        .from("vendors")
        .select("category,city,region")
        .eq("id", data.vendorId)
        .maybeSingle();
      const { fanOutRfqInvitations } = await import("@/lib/rfq-fanout.server");
      invited = await fanOutRfqInvitations({
        rfqId: row.id,
        subject: data.subject,
        category: ((v as any)?.category ?? "Other") as any,
        location: [(v as any)?.city, (v as any)?.region].filter(Boolean).join(", ") || null,
        eventDate: data.eventDate ?? null,
        guestCount: data.guestCount ?? null,
        budgetMax: data.budgetMax ?? null,
        brief: data.message,
        pinnedVendorId: data.vendorId,
        limit: 1,
      });
    } catch (err) {
      console.error("createRfq vendor invitation failed", err);
    }

    return { ok: true as const, rfqId: row.id, invited };
  });

export const listMyRfqs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // The vendors base table is PRIVACY LOCKED, so the embedded vendor join is
    // replaced by a service-role name/slug lookup (both are directory-safe).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sentRows } = await context.supabase
      .from("rfq_requests")
      .select("id,subject,status,created_at,vendor_id")
      .eq("requester_user_id", context.userId)
      .order("created_at", { ascending: false });

    const sentVendorIds = Array.from(
      new Set((sentRows ?? []).map((r: any) => r.vendor_id).filter(Boolean)),
    ) as string[];
    let sentVendorMap: Record<string, { name: string; slug: string }> = {};
    if (sentVendorIds.length) {
      const { data: vs } = await supabaseAdmin
        .from("vendors")
        .select("id,name,slug")
        .in("id", sentVendorIds);
      sentVendorMap = Object.fromEntries(
        (vs ?? []).map((v: any) => [v.id, { name: v.name, slug: v.slug }]),
      );
    }
    const sent = (sentRows ?? []).map((r: any) => ({
      ...r,
      vendors: r.vendor_id ? sentVendorMap[r.vendor_id] ?? null : null,
    }));

    const { data: vendor } = await supabaseAdmin
      .from("vendors")
      .select("id")
      .eq("owner_user_id", context.userId)
      .maybeSingle();


    let received: any[] = [];
    if (vendor) {
      // 1) RFQs directly pinned to this vendor.
      const { data: pinned } = await context.supabase
        .from("rfq_requests")
        .select("id,subject,status,created_at,requester_user_id")
        .eq("vendor_id", vendor.id)
        .order("created_at", { ascending: false });
      // 2) RFQs we were invited to via fan-out.
      const { data: invites } = await (context.supabase as any)
        .from("rfq_invitations")
        .select("rfq_id,status,sent_at,rfq:rfq_id(id,subject,status,created_at,requester_user_id)")
        .eq("vendor_id", vendor.id)
        .order("sent_at", { ascending: false });
      const map = new Map<string, any>();
      for (const r of (pinned ?? [])) map.set(r.id, r);
      for (const inv of (invites ?? [])) {
        const r = inv.rfq;
        if (r && !map.has(r.id)) map.set(r.id, { ...r, _invitationStatus: inv.status });
      }
      received = Array.from(map.values()).sort((a, b) =>
        (b.created_at || "").localeCompare(a.created_at || ""),
      );
    }
    return { sent: sent ?? [], received };
  });

export const getRfq = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ rfqId: z.string().uuid() }), d, "vendors.functions.ts:424"))
  .handler(async ({ data, context }) => {
    // RLS on rfq_requests still decides whether the caller may see this thread.
    const { data: rfqRow } = await context.supabase
      .from("rfq_requests")
      .select("*")
      .eq("id", data.rfqId)
      .maybeSingle();
    if (!rfqRow) return { rfq: null, messages: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let vendors: { name: string; slug: string; owner_user_id: string } | null = null;
    if ((rfqRow as any).vendor_id) {
      const { data: v } = await supabaseAdmin
        .from("vendors")
        .select("name,slug,owner_user_id")
        .eq("id", (rfqRow as any).vendor_id)
        .maybeSingle();
      vendors = (v as any) ?? null;
    }
    const rfq = { ...(rfqRow as any), vendors };
    const { data: messages } = await context.supabase
      .from("rfq_messages")
      .select("id,sender_user_id,body,created_at")
      .eq("rfq_id", data.rfqId)
      .order("created_at", { ascending: true });
    return { rfq, messages: messages ?? [] };
  });

export const postRfqMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({ rfqId: z.string().uuid(), body: z.string().min(1).max(4000) }), d, "vendors.functions.ts:455"),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("rfq_messages").insert({
      rfq_id: data.rfqId,
      sender_user_id: context.userId,
      body: data.body,
    });
    if (error) return { error: friendlyDbError(error, "the vendor request") };
    return { ok: true as const };
  });

export const setRfqStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z
      .object({
        rfqId: z.string().uuid(),
        status: z.enum(["open", "quoted", "accepted", "declined", "closed"]),
      }), d, "vendors.functions.ts:475"),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("rfq_requests")
      .update({ status: data.status })
      .eq("id", data.rfqId);
    if (error) return { error: friendlyDbError(error, "the vendor request") };
    return { ok: true as const };
  });

// ── Reviews ────────────────────────────────────────────────────────────────

export const createVendorReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z
      .object({
        vendorId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        body: z.string().max(2000).optional(),
      }), d, "vendors.functions.ts:497"),
  )
  .handler(async ({ data, context }) => {
    // vendor_reviews is PRIVACY LOCKED (it holds reviewer identities), so the
    // write runs with the service role. The rule the old RLS INSERT policy
    // enforced is re-checked here first, as the caller: you may only review a
    // vendor you have an accepted RFQ with.
    const { data: accepted } = await context.supabase
      .from("rfq_requests")
      .select("id")
      .eq("vendor_id", data.vendorId)
      .eq("requester_user_id", context.userId)
      .eq("status", "accepted")
      .limit(1);
    if (!accepted?.length) {
      return { error: "You can review a vendor after they accept your request." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("vendor_reviews").upsert(
      {
        vendor_id: data.vendorId,
        reviewer_user_id: context.userId,
        rating: data.rating,
        body: data.body || null,
      },
      { onConflict: "vendor_id,reviewer_user_id" },
    );
    if (error) return { error: friendlyDbError(error, "the vendor request") };
    return { ok: true as const };
  });

// ── Owner / admin moderation ───────────────────────────────────────────────

export const adminListVendors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isAdmin && !isOwner) return { vendors: [], error: "Forbidden" };
    // Role verified above; the base table is PRIVACY LOCKED so read with the
    // service role and keep the projection to moderation-safe columns.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("vendors")
      .select("id,name,slug,category,status,created_at,city,region")
      .order("created_at", { ascending: false });
    return { vendors: data ?? [] };
  });

export const setVendorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z
      .object({
        vendorId: z.string().uuid(),
        status: z.enum(["pending", "verified", "rejected", "paused"]),
      }), d, "vendors.functions.ts:560"),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isOwner } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "owner",
    });
    if (!isAdmin && !isOwner) return { error: "Forbidden" };
    const patch: { status: typeof data.status; verified_at?: string } = { status: data.status };
    if (data.status === "verified") patch.verified_at = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("vendors").update(patch).eq("id", data.vendorId);
    if (error) return { error: friendlyDbError(error, "the vendor request") };
    return { ok: true as const };
  });
