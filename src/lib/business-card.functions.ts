import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseInput } from "@/lib/user-error";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BusinessCard } from "@/lib/business-card";

const FIELDS =
  "slug, full_name, role, organisation, email, phone, website, photo_url, show_phone_on_page, tagline, published";

async function requireOwner(context: { supabase: any; userId: string }) {
  for (const role of ["owner", "super_admin", "admin"] as const) {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: role });
    if (data === true) return;
  }
  throw new Error("Forbidden");
}

// There is deliberately no public "list every card" function. The public site
// only ever reads one card at a time by its slug (getBusinessCard below); the
// owner-only Brand page gets its card list from brand-kit.functions.ts.



/** Owner console: every card, finished or not. */
export const listAllBusinessCards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("business_cards")
      .select(FIELDS)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as BusinessCard[];
  });

const SlugInput = z.object({ slug: z.string().min(1).max(60) });

/** Public: one published card. Returns null for an unknown or unfinished card. */
export const getBusinessCard = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => parseInput(SlugInput, i, "business-card.functions.ts:getBusinessCard"))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("business_cards")
      .select(FIELDS)
      .eq("slug", data.slug.toLowerCase())
      .eq("published", true)
      .maybeSingle();
    if (!row) return null;
    // The number only leaves the server when the card says it may be shown.
    // The contact file has its own route and reads the number directly.
    const card = { ...(row as Record<string, unknown>) };
    if (card["show_phone_on_page"] !== true) card["phone"] = null;
    return card as unknown as BusinessCard;
  });

/** Owner console read of a single card, published or not. */
export const getBusinessCardForOwner = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(SlugInput, i, "business-card.functions.ts:getBusinessCardForOwner"))
  .handler(async ({ data, context }) => {
    await requireOwner(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("business_cards")
      .select(FIELDS)
      .eq("slug", data.slug.toLowerCase())
      .maybeSingle();
    return (row ?? null) as unknown as BusinessCard | null;
  });

/**
 * Every field is editable, so a typo in a title or a changed number never
 * needs a rebuild. Blank text is stored as blank rather than rejected, because
 * a card is filled in over several sittings.
 */
const UpdateInput = z.object({
  slug: z.string().min(1).max(60),
  full_name: z.string().max(120).optional(),
  role: z.string().max(120).optional(),
  organisation: z.string().max(160).optional(),
  email: z.string().max(200).optional(),
  website: z.string().max(300).optional(),
  phone: z.string().max(40).nullish(),
  photo_url: z.string().max(600).nullish(),
  show_phone_on_page: z.boolean().optional(),
  tagline: z.string().max(200).nullish(),
  published: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
});

const TEXT_ALLOWED_BLANK = new Set(["full_name", "role", "organisation", "email", "website", "tagline"]);

/** Owner console write. One row feeds the page, the contact file, the signature, the picture and the code. */
export const updateBusinessCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(UpdateInput, i, "business-card.functions.ts:updateBusinessCard"))
  .handler(async ({ data, context }) => {
    await requireOwner(context as never);
    const { slug, ...rest } = data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) continue;
      if (typeof value === "string" && value.trim() === "") {
        // Blank means blank for the text on the card; for the phone and photo
        // it means "there isn't one", which the column stores as empty.
        patch[key] = TEXT_ALLOWED_BLANK.has(key) ? (key === "tagline" ? null : "") : null;
        continue;
      }
      patch[key] = typeof value === "string" ? value.trim() : value;
    }

    // Publishing a card with nothing on it would hand out a blank page.
    if (patch["published"] === true) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: current } = await supabaseAdmin
        .from("business_cards")
        .select("full_name, role, email")
        .eq("slug", slug.toLowerCase())
        .maybeSingle();
      const merged = { ...(current ?? {}), ...patch } as Record<string, string | undefined>;
      const missing = (["full_name", "role", "email"] as const).filter((k) => !String(merged[k] ?? "").trim());
      if (missing.length > 0) {
        const words = { full_name: "a name", role: "a role or title", email: "an email address" } as const;
        throw new Error(`This card still needs ${missing.map((m) => words[m]).join(", ")} before it can go live.`);
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("business_cards").update(patch as never).eq("slug", slug.toLowerCase());
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CreateInput = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Use lower case letters, numbers and dashes, like adrian or jo-smith."),
  full_name: z.string().max(120).optional(),
});

/** Add another person's card. Starts blank and unpublished, on purpose. */
export const createBusinessCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(CreateInput, i, "business-card.functions.ts:createBusinessCard"))
  .handler(async ({ data, context }) => {
    await requireOwner(context as never);
    const slug = data.slug.toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("business_cards")
      .select("slug, full_name")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) {
      const retired = !String((existing as { full_name?: string }).full_name ?? "").trim();
      throw new Error(
        retired
          ? "That address belonged to a retired card and stays reserved, because printed scan codes may still point to it. Pick a different one."
          : "There is already a card at that address. Pick a different one.",
      );
    }

    const { data: last } = await supabaseAdmin
      .from("business_cards")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((last as { sort_order?: number } | null)?.sort_order ?? 0) + 1;

    const { error } = await supabaseAdmin.from("business_cards").insert({
      slug,
      full_name: (data.full_name ?? "").trim(),
      role: "",
      email: "",
      published: false,
      sort_order: nextOrder,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true, slug };
  });

/**
 * Retire a person's card, for someone who has moved on. The details are
 * wiped and the card is switched off, but the slug row stays as a reserved
 * tombstone: printed scan codes are permanent, so the address must never be
 * handed to a different person later.
 */
export const deleteBusinessCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => parseInput(SlugInput, i, "business-card.functions.ts:deleteBusinessCard"))
  .handler(async ({ data, context }) => {
    await requireOwner(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("business_cards")
      .update({
        full_name: "",
        role: "",
        organisation: "",
        email: "",
        website: "",
        phone: null,
        photo_url: null,
        tagline: null,
        published: false,
        show_phone_on_page: false,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("slug", data.slug.toLowerCase());
    if (error) throw new Error(error.message);
    return { ok: true };
  });
