// Design Studio — server functions.
// Gated by the same has_ai_packages_access RPC the Packages panel uses, so
// Atelier (and trial / one-time buyers) get the studio without extra plumbing.
import { createServerFn } from "@tanstack/react-start";
import { parseInput } from "@/lib/user-error";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotDemo } from "@/lib/demo-mode.server";

export type DesignAssetRow = {
  id: string;
  user_id: string;
  event_id: string | null;
  kind: string;
  template_id: string;
  title: string;
  content: any;
  thumbnail_url: string | null;
  share_token: string | null;
  created_at: string;
  updated_at: string;
};

const KIND = z.enum(["menu", "package", "apparel", "signage", "favor", "thank_you"]);

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const hasDesignStudioAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ hasAccess: boolean }> => {
    const { data } = await context.supabase.rpc("has_ai_packages_access", {
      _user_id: context.userId,
      _event_id: undefined,
      _project_id: undefined,
    });
    return { hasAccess: !!data };
  });

export const listDesigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ eventId: z.string().optional() }), d ?? {}, "design-studio.functions.ts:43"))
  .handler(async ({ data, context }): Promise<{ designs: DesignAssetRow[] }> => {
    let q = (context.supabase as any).from("design_assets")
      .select("*").eq("user_id", context.userId).order("updated_at", { ascending: false }).limit(50);
    if (data.eventId) q = q.eq("event_id", data.eventId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { designs: (rows ?? []) as DesignAssetRow[] };
  });

export const getDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d, "design-studio.functions.ts:55"))
  .handler(async ({ data, context }): Promise<{ design: DesignAssetRow | null }> => {
    const { data: row } = await (context.supabase as any).from("design_assets")
      .select("*").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    return { design: (row ?? null) as DesignAssetRow | null };
  });

export const saveDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      id: z.string().uuid().optional(),
      eventId: z.string().optional(),
      kind: KIND,
      templateId: z.string().min(1).max(80),
      title: z.string().min(1).max(120),
      content: z.any(),
    }), d, "design-studio.functions.ts:65"),
  )
  .handler(async ({ data, context }): Promise<{ design: DesignAssetRow }> => {
    const access = await context.supabase.rpc("has_ai_packages_access", {
      _user_id: context.userId, _event_id: data.eventId, _project_id: undefined,
    });
    if (!access.data) throw new Error("Design Studio requires Atelier, a 1-day trial, or the $14 add-on.");
    if (data.id) {
      const { data: row, error } = await (context.supabase as any).from("design_assets")
        .update({
          title: data.title, content: data.content, template_id: data.templateId,
          kind: data.kind, event_id: data.eventId ?? null,
        })
        .eq("id", data.id).eq("user_id", context.userId).select("*").single();
      if (error) throw new Error(error.message);
      return { design: row as DesignAssetRow };
    }
    const { data: row, error } = await (context.supabase as any).from("design_assets")
      .insert({
        user_id: context.userId, event_id: data.eventId ?? null,
        kind: data.kind, template_id: data.templateId, title: data.title, content: data.content,
      }).select("*").single();
    if (error) throw new Error(error.message);
    return { design: row as DesignAssetRow };
  });

export const deleteDesign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d, "design-studio.functions.ts:100"))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("design_assets")
      .delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createDesignShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d, "design-studio.functions.ts:110"))
  .handler(async ({ data, context }): Promise<{ token: string }> => {
    const token = randomToken();
    const { error } = await (context.supabase as any).from("design_assets")
      .update({ share_token: token }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { token };
  });

export const revokeDesignShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d, "design-studio.functions.ts:121"))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("design_assets")
      .update({ share_token: null }).eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPublicDesign = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => parseInput(z.object({ token: z.string().min(8).max(120) }), d, "design-studio.functions.ts:130"))
  .handler(async ({ data }): Promise<{ design: DesignAssetRow | null }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: rows } = await (supa as any).rpc("get_shared_design", { p_token: data.token });
    const row = Array.isArray(rows) ? rows[0] : rows;
    // Share links are forwardable: strip the owner's account id and the token.
    const { sanitizePublicShareRow } = await import("@/lib/public-share-sanitize");
    return { design: (row ? sanitizePublicShareRow(row) : null) as DesignAssetRow | null };
  });


// AI copy rewrite — short, on-brand line. Uses Lovable AI Gateway (Gemini).
export const aiRewriteCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      text: z.string().min(1).max(800),
      tone: z.enum(["editorial", "playful", "formal", "modern"]).default("editorial"),
      maxChars: z.number().int().min(20).max(280).default(120),
      eventId: z.string().min(1).max(120).optional(),
    }), d, "design-studio.functions.ts:148"),
  )
  .handler(async ({ data, context }): Promise<{ text: string } | { error: string; code?: string; used?: number; cap?: number }> => {
    await assertNotDemo("generate");
    // Postcard free-tier lockdown: AI is a variable-cost feature and requires
    // Atelier (or a valid AI-package entitlement / atelier one-time pass).
    const { assertMinTier, UpgradeRequiredError } = await import("@/lib/tier-guards.server");
    try {
      await assertMinTier(context.supabase, context.userId, "atelier", {
        message: "Upgrade to Atelier for AI-powered features.",
      });
    } catch (err) {
      if (err instanceof UpgradeRequiredError) {
        // Allow users who purchased an AI package entitlement or hold an
        // Atelier one-time pass for this event to keep using AI even without
        // an Atelier subscription.
        const { data: allowed } = await context.supabase.rpc("has_ai_packages_access", {
          _user_id: context.userId,
          _event_id: data.eventId ?? undefined,
          _project_id: undefined,
        });

        if (!allowed) {
          return {
            error: err.message,
            code: err.code,
          };
        }
      } else {
        throw err;
      }
    }
    // Atelier one-time pass AI cap. Subscriptions pass through.
    const { enforceAtelierAiCap } = await import("@/lib/ai-cap");
    const cap = await enforceAtelierAiCap(context.supabase, context.userId, data.eventId);
    if ("code" in cap) return { error: cap.error, code: cap.code, used: cap.used, cap: cap.cap };
    if ("error" in cap) return { error: cap.error };


    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI is not configured");
    const sys = `You rewrite short event-design copy in American English. Return ONLY the rewritten line, no quotes, no explanations. Tone: ${data.tone}. Max ${data.maxChars} characters. Avoid clichés and emoji.`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: data.text }],
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error(`AI rewrite failed (${res.status})`);
    const j = await res.json();
    const text = String(j?.choices?.[0]?.message?.content ?? "").trim().replace(/^["']|["']$/g, "");
    if (data.eventId) {
      const { markMaterialUse } = await import("@/lib/pass-material-use");
      await markMaterialUse(context.supabase, data.eventId, "ai_generation", context.userId);
    }
    return { text: text.slice(0, data.maxChars) };
  });

// ── Brand Kits ──────────────────────────────────────────────
export type BrandKitRow = {
  id: string;
  user_id: string;
  name: string;
  palette: { bg: string; fg: string; accent: string; muted: string };
  logo_url: string | null;
  font_display: string;
  font_body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

const PaletteSchema = z.object({
  bg: z.string().min(1), fg: z.string().min(1), accent: z.string().min(1), muted: z.string().min(1),
});

export const listBrandKits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ kits: BrandKitRow[] }> => {
    const { data, error } = await (context.supabase as any).from("brand_kits")
      .select("*").eq("user_id", context.userId).order("is_default", { ascending: false }).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { kits: (data ?? []) as BrandKitRow[] };
  });

export const saveBrandKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1).max(60),
      palette: PaletteSchema,
      logo_url: z.string().url().nullable().optional(),
      font_display: z.string().min(1).max(200),
      font_body: z.string().min(1).max(200),
      is_default: z.boolean().optional(),
    }), d, "design-studio.functions.ts:243"),
  )
  .handler(async ({ data, context }): Promise<{ kit: BrandKitRow }> => {
    if (data.is_default) {
      await (context.supabase as any).from("brand_kits")
        .update({ is_default: false }).eq("user_id", context.userId);
    }
    const payload = {
      name: data.name, palette: data.palette, logo_url: data.logo_url ?? null,
      font_display: data.font_display, font_body: data.font_body,
      is_default: !!data.is_default,
    };
    if (data.id) {
      const { data: row, error } = await (context.supabase as any).from("brand_kits")
        .update(payload).eq("id", data.id).eq("user_id", context.userId).select("*").single();
      if (error) throw new Error(error.message);
      return { kit: row as BrandKitRow };
    }
    const { data: row, error } = await (context.supabase as any).from("brand_kits")
      .insert({ ...payload, user_id: context.userId }).select("*").single();
    if (error) throw new Error(error.message);
    return { kit: row as BrandKitRow };
  });

export const deleteBrandKit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d, "design-studio.functions.ts:277"))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("brand_kits")
      .delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── RFQ handoff ─────────────────────────────────────────────
// Creates a new RFQ from a saved design, ensuring a share token exists and
// attaching the share URL into the message body for the vendor to view.
export const sendDesignToRfq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      designId: z.string().uuid(),
      origin: z.string().url(),
      category: z.string().min(2).max(60),
      subject: z.string().min(3).max(120),
      message: z.string().min(10).max(4000),
      location: z.string().max(120).optional(),
      event_date: z.string().optional(),
      guest_count: z.number().int().nonnegative().optional(),
      vendor_id: z.string().uuid().optional(),
      vendor_cap: z.number().int().min(1).max(25).optional(),
    }), d, "design-studio.functions.ts:291"),
  )
  .handler(async ({ data, context }): Promise<{ rfqId: string; shareUrl: string; invitedCount: number }> => {
    const { data: design, error: dErr } = await (context.supabase as any).from("design_assets")
      .select("id,share_token,title").eq("id", data.designId).eq("user_id", context.userId).single();
    if (dErr || !design) throw new Error("Design not found");
    let token: string | null = design.share_token;
    if (!token) {
      const bytes = new Uint8Array(24); crypto.getRandomValues(bytes);
      token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      const { error } = await (context.supabase as any).from("design_assets")
        .update({ share_token: token }).eq("id", data.designId).eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    }
    const shareUrl = `${data.origin.replace(/\/$/, "")}/d/${token}`;
    const body = `${data.message}\n\n— Design attached —\n${design.title}\n${shareUrl}`;
    const { data: rfq, error: rErr } = await (context.supabase as any).from("rfq_requests").insert({
      requester_user_id: context.userId,
      subject: data.subject,
      category: data.category,
      location: data.location ?? null,
      message: body,
      event_date: data.event_date ?? null,
      guest_count: data.guest_count ?? null,
      vendor_id: data.vendor_id ?? null,
      status: "open",
    }).select("id").single();
    if (rErr) throw new Error(rErr.message);

    const rfqId = rfq.id as string;
    let invitedCount = 0;
    try {
      const validCats = [
        "Venue","Caterer","Photographer","Videographer","Musician/Band","DJ",
        "Florist","Baker","Bartender","Planner","Rentals","Officiant",
        "Transportation","Hair & Makeup","Other",
      ] as const;
      if ((validCats as readonly string[]).includes(data.category)) {
        const { fanOutRfqInvitations } = await import("@/lib/rfq-fanout.server");
        invitedCount = await fanOutRfqInvitations({
          rfqId,
          subject: data.subject,
          category: data.category as typeof validCats[number],
          location: data.location ?? null,
          eventDate: data.event_date ?? null,
          guestCount: data.guest_count ?? null,
          budgetMax: null,
          brief: body,
          pinnedVendorId: data.vendor_id,
          limit: data.vendor_cap ?? 10,
        });
      }
    } catch (err) { console.error("sendDesignToRfq fanout failed", err); }
    return { rfqId, shareUrl, invitedCount };
  });
