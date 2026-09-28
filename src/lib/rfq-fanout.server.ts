import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getRequest } from "@tanstack/react-start/server";

const CATEGORIES = [
  "Venue", "Caterer", "Photographer", "Videographer", "Musician/Band", "DJ",
  "Florist", "Baker", "Bartender", "Planner", "Rentals", "Officiant",
  "Transportation", "Hair & Makeup", "Other",
] as const;
export type RfqCategory = typeof CATEGORIES[number];

// Map RFQ category → equivalent vendor-profile categories used in public.vendors.
const VENDOR_CATEGORY_MAP: Record<RfqCategory, string[]> = {
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

interface MatchedVendor { id: string; name: string; email: string | null; }

export interface FanOutInput {
  rfqId: string;
  subject: string;
  category: RfqCategory;
  location?: string | null;
  eventDate?: string | null;
  guestCount?: number | null;
  budgetMax?: number | null;
  brief: string;
  pinnedVendorId?: string;
  /** Max number of verified vendors to invite. Defaults to 10. */
  limit?: number;
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false } });
}

function getOrigin(): string {
  try {
    const req = getRequest();
    if (req?.url) {
      const u = new URL(req.url);
      return `${u.protocol}//${u.host}`;
    }
  } catch { /* no request context */ }
  return "https://thekenroecollective.com";
}

async function findMatchingVendors(
  category: RfqCategory,
  location: string | null | undefined,
  pinnedVendorId?: string,
): Promise<MatchedVendor[]> {
  const admin = adminClient();
  if (!admin) return [];
  if (pinnedVendorId) {
    const { data } = await admin
      .from("vendors")
      .select("id,name,email,status")
      .eq("id", pinnedVendorId)
      .eq("status", "verified")
      .maybeSingle();
    if (!data) return [];
    return [{ id: data.id, name: data.name, email: (data as any).email ?? null }];
  }
  const cats = VENDOR_CATEGORY_MAP[category] ?? [category];
  const { data: all } = await admin
    .from("vendors")
    .select("id,name,email,city,region,status")
    // "verified" is the vendors table's actual approved-state value — the
    // CHECK constraint only allows pending|reviewing|verified|rejected|paused,
    // so this filter previously matched zero rows and fan-out silently
    // invited no one.
    .eq("status", "verified")
    .in("category", cats)
    .not("email", "is", null)
    .limit(50);
  const list = (all ?? []) as any[];
  if (!list.length) return [];
  if (location && location.trim()) {
    const loc = location.toLowerCase();
    const local = list.filter(
      (v) =>
        (v.city && loc.includes(String(v.city).toLowerCase())) ||
        (v.region && loc.includes(String(v.region).toLowerCase())),
    );
    if (local.length) return local.map((v) => ({ id: v.id, name: v.name, email: v.email }));
  }
  return list.map((v) => ({ id: v.id, name: v.name, email: v.email }));
}

export async function fanOutRfqInvitations(input: FanOutInput): Promise<number> {
  let vendors = await findMatchingVendors(input.category, input.location, input.pinnedVendorId);
  const cap = Math.max(1, Math.min(input.limit ?? 10, 25));
  if (vendors.length > cap) vendors = vendors.slice(0, cap);
  if (!vendors.length) return 0;
  const admin = adminClient();
  if (!admin) return 0;

  const rows = vendors.map((v) => ({
    rfq_id: input.rfqId,
    vendor_id: v.id,
    business_name: v.name,
    email: v.email,
    status: "invited",
  })) as any;

  const { data: inserted, error } = await admin
    .from("rfq_invitations")
    .insert(rows)
    .select("id,vendor_id,claim_token,email,business_name");
  if (error || !inserted) {
    console.error("fanOutRfqInvitations insert failed", error);
    return 0;
  }

  const origin = getOrigin();
  const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");

  let sent = 0;
  for (const inv of inserted as any[]) {
    if (!inv.email) continue;
    const bidUrl = `${origin}/rfq-bid/${inv.claim_token}`;
    const signInUrl = `${origin}/auth`;
    const r = await enqueueTransactionalEmailServer({
      templateName: "vendor-rfq-invite",
      recipientEmail: inv.email,
      idempotencyKey: `rfq-invite-${input.rfqId}-${inv.vendor_id}`,
      label: "vendor-rfq-invite",
      templateData: {
        vendorName: inv.business_name ?? "there",
        subject: input.subject,
        category: input.category,
        location: input.location ?? "",
        eventDate: input.eventDate ?? "",
        guestCount: input.guestCount ?? undefined,
        budgetMax: input.budgetMax ?? undefined,
        brief: input.brief,
        bidUrl,
        signInUrl,
      },
    });
    if (r.ok) sent += 1;
  }
  return sent;
}

/**
 * Notify all *other* invitees on an RFQ that the position has been filled.
 * Skips the winning vendor and any invitation that's already declined.
 */
export async function notifyPositionFilled(args: {
  rfqId: string;
  awardedVendorId: string;
  subject: string;
}): Promise<number> {
  const admin = adminClient();
  if (!admin) return 0;
  const { data: invs } = await (admin as any)
    .from("rfq_invitations")
    .select("id,vendor_id,email,business_name,status")
    .eq("rfq_id", args.rfqId);
  const list = ((invs ?? []) as any[]).filter(
    (i) => i.email && i.vendor_id !== args.awardedVendorId && i.status !== "declined",
  );
  if (!list.length) return 0;

  const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
  let sent = 0;
  for (const inv of list) {
    const r = await enqueueTransactionalEmailServer({
      templateName: "rfq-position-filled",
      recipientEmail: inv.email,
      idempotencyKey: `rfq-filled-${args.rfqId}-${inv.vendor_id}`,
      label: "rfq-position-filled",
      templateData: {
        vendorName: inv.business_name ?? "there",
        subject: args.subject,
      },
    });
    if (r.ok) sent += 1;
  }
  // Mark remaining invited rows as 'closed' for clean state.
  await (admin as any)
    .from("rfq_invitations")
    .update({ status: "closed" })
    .eq("rfq_id", args.rfqId)
    .neq("vendor_id", args.awardedVendorId)
    .in("status", ["invited", "responded"]);
  return sent;
}


/** Count verified vendors that would be invited, without sending anything. */
export async function countMatchingVendors(
  category: RfqCategory,
  location?: string | null,
): Promise<number> {
  const vendors = await findMatchingVendors(category, location);
  return vendors.length;
}
