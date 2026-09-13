// AI Packages & Menus — server functions
//
// Generates editorial menus, service bundles, and merch packs for an event
// or project. Access is gated by has_ai_packages_access (Atelier tier,
// account-monthly add-on, per-event/project one-time unlock, or owner).
import { toUserMessage, parseInput } from "@/lib/user-error";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotDemo } from "@/lib/demo-mode.server";

export type AiPackageKind = "food_menu" | "service_bundle" | "merch_pack" | "other";

export type AiPackageContent = {
  title: string;
  summary: string;
  sections: Array<{
    heading: string;
    items: Array<{ name: string; description?: string; price_cents?: number | null; notes?: string }>;
  }>;
  tiers?: Array<{ name: string; price_cents?: number | null; includes: string[] }>;
  estimated_total_cents?: number | null;
};

export type AiPackageRow = {
  id: string;
  kind: AiPackageKind;
  title: string;
  prompt: string;
  guest_count: number | null;
  budget_cents: number | null;
  content: AiPackageContent;
  attachments: string[];
  event_id: string | null;
  project_id: string | null;
  created_at: string;
};

// ────────────────────────────────────────────────────────────────
// Access check
// ────────────────────────────────────────────────────────────────
export const hasAiPackagesAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z
      .object({
        eventId: z.string().min(1).max(120).optional(),
        projectId: z.string().uuid().optional(),
      }), data ?? {}, "ai-packages.functions.ts:49"),
  )
  .handler(async ({ data, context }): Promise<{ hasAccess: boolean; reason?: string }> => {
    const { data: result, error } = await context.supabase.rpc("has_ai_packages_access", {
      _user_id: context.userId,
      _event_id: data.eventId,
      _project_id: data.projectId,
    });
    if (error) return { hasAccess: false, reason: error.message };
    return { hasAccess: !!result };
  });

// ────────────────────────────────────────────────────────────────
// List existing packages for an event/project
// ────────────────────────────────────────────────────────────────
export const listAiPackages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    parseInput(z
      .object({
        eventId: z.string().min(1).max(120).optional(),
        projectId: z.string().uuid().optional(),
      }), data ?? {}, "ai-packages.functions.ts:72"),
  )
  .handler(async ({ data, context }): Promise<{ packages: AiPackageRow[] }> => {
    let q = context.supabase
      .from("ai_packages")
      .select("id,kind,title,prompt,guest_count,budget_cents,content,attachments,event_id,project_id,created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.eventId) q = q.eq("event_id", data.eventId);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { packages: (rows ?? []) as AiPackageRow[] };
  });

// ────────────────────────────────────────────────────────────────
// Generate a package
// ────────────────────────────────────────────────────────────────
const GenerateInput = z.object({
  kind: z.enum(["food_menu", "service_bundle", "merch_pack", "other"]),
  prompt: z.string().min(3).max(2000),
  guestCount: z.number().int().min(1).max(10000).optional(),
  budgetCents: z.number().int().min(0).max(100000000).optional(),
  dietary: z.string().max(500).optional(),
  vibe: z.string().max(300).optional(),
  attachments: z.array(z.string().url().max(2000)).max(20).optional(),
  eventId: z.string().min(1).max(120).optional(),
  projectId: z.string().uuid().optional(),
});

const PackageSchema = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      items: z.array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          price_cents: z.number().int().nullable().optional(),
          notes: z.string().optional(),
        }),
      ),
    }),
  ),
  tiers: z
    .array(
      z.object({
        name: z.string(),
        price_cents: z.number().int().nullable().optional(),
        includes: z.array(z.string()),
      }),
    )
    .optional(),
  estimated_total_cents: z.number().int().nullable().optional(),
});

function systemPromptFor(kind: AiPackageKind): string {
  const base =
    "You are Kenroe, an editorial event-planning concierge. Output is warm, specific, and never generic. ALWAYS return ONLY valid minified JSON — no markdown fences, no prose before or after. Use US dollars in cents (integers) for prices.";
  const schemaHint =
    ' Schema: {"title":string,"summary":string,"sections":[{"heading":string,"items":[{"name":string,"description":string,"price_cents":number|null,"notes":string}]}],"tiers":[{"name":string,"price_cents":number|null,"includes":[string]}],"estimated_total_cents":number|null}';
  if (kind === "food_menu")
    return `${base} Build a cohesive menu with clear sections (Welcome, First, Main, Sweet, Drinks). Honor dietary notes. 2-4 items per section with one-line descriptions. Include Bronze/Silver/Gold per-guest tiers when guest count is known.${schemaHint}`;
  if (kind === "service_bundle")
    return `${base} Build a tiered service bundle (Bronze / Silver / Gold) where each tier 'includes' a clear, specific list of deliverables. Group deliverables by category in 'sections'.${schemaHint}`;
  if (kind === "merch_pack")
    return `${base} Build a merch / favors / non-food package (reunion t-shirts, totes, decor kits, photo packages). Group by item type in sections. Include per-unit pricing and quantity tiers (25/50/100).${schemaHint}`;
  return `${base} Build a coherent custom package for the user's event/project.${schemaHint}`;
}

function extractJson(raw: string): unknown {
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = s.search(/[{[]/);
  if (start === -1) throw new Error("No JSON found in response");
  const open = s[start];
  const close = open === "[" ? "]" : "}";
  const end = s.lastIndexOf(close);
  if (end === -1) throw new Error("Truncated JSON in response");
  s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    const repaired = s
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x1F\x7F]/g, " ");
    return JSON.parse(repaired);
  }
}

export const generateAiPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(GenerateInput, data, "ai-packages.functions.ts:167"))
  .handler(async ({ data, context }): Promise<{ packageId: string; content: AiPackageContent } | { error: string; code?: string; used?: number; cap?: number }> => {
    await assertNotDemo("generate");
    const { data: allowed, error: accessErr } = await context.supabase.rpc("has_ai_packages_access", {
      _user_id: context.userId,
      _event_id: data.eventId,
      _project_id: data.projectId,
    });
    if (accessErr) return { error: accessErr.message };
    if (!allowed) return { error: "AI Packages & Menus is locked. Unlock it from the Packages panel." };

    // Atelier one-time pass AI cap (150 generations). Subscriptions pass through.
    const { enforceAtelierAiCap } = await import("@/lib/ai-cap");
    const cap = await enforceAtelierAiCap(context.supabase, context.userId, data.eventId);
    if ("code" in cap) return { error: cap.error, code: cap.code, used: cap.used, cap: cap.cap };
    if ("error" in cap) return { error: cap.error };

    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { error: "AI service is not configured" };

    const userPrompt = [
      `Kind: ${data.kind}`,
      `Brief: ${data.prompt}`,
      data.guestCount ? `Guests: ${data.guestCount}` : null,
      data.budgetCents ? `Budget: $${(data.budgetCents / 100).toFixed(0)}` : null,
      data.dietary ? `Dietary: ${data.dietary}` : null,
      data.vibe ? `Vibe: ${data.vibe}` : null,
      data.attachments && data.attachments.length
        ? `Reference links/images (use for inspiration, do not output verbatim):\n${data.attachments.join("\n")}`
        : null,
      "",
      "Return ONLY the JSON object — no commentary.",
    ]
      .filter(Boolean)
      .join("\n");

    const model = "google/gemini-3.6-flash";
    let content: z.infer<typeof PackageSchema>;
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPromptFor(data.kind) },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: 4096,
          temperature: 0.7,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        if (res.status === 429) return { error: "AI is rate-limited right now. Please try again in a moment." };
        if (res.status === 402) return { error: "AI credits are exhausted. Add credits in Settings → Plans & credits." };
        return { error: `AI gateway error (${res.status}): ${t.slice(0, 200)}` };
      }
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = body.choices?.[0]?.message?.content ?? "";
      if (!raw) return { error: "AI returned an empty response. Please try again." };
      const parsed = extractJson(raw);
      content = parseInput(PackageSchema, parsed, "ai-packages.functions.ts:232");
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err));
      return { error: `Couldn't shape the AI response. Try a shorter brief or rerun. (${msg.slice(0, 160)})` };
    }

    const { data: inserted, error: insertErr } = await context.supabase
      .from("ai_packages")
      .insert({
        user_id: context.userId,
        event_id: data.eventId ?? null,
        project_id: data.projectId ?? null,
        kind: data.kind,
        title: content.title || data.prompt.slice(0, 80),
        prompt: data.prompt,
        guest_count: data.guestCount ?? null,
        budget_cents: data.budgetCents ?? null,
        content: JSON.parse(JSON.stringify(content)),
        attachments: data.attachments ?? [],
        model,
      })
      .select("id")
      .single();
    if (insertErr) return { error: insertErr.message };
    if (data.eventId) {
      const { markMaterialUse } = await import("@/lib/pass-material-use");
      await markMaterialUse(context.supabase, data.eventId, "ai_generation", context.userId);
    }
    return { packageId: (inserted as { id: string }).id, content };
  });

// ────────────────────────────────────────────────────────────────
// Delete a package
// ────────────────────────────────────────────────────────────────
export const deleteAiPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => parseInput(z.object({ id: z.string().uuid() }), data, "ai-packages.functions.ts:268"))
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    const { error } = await context.supabase.from("ai_packages").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) return { error: error.message };
    return { ok: true };
  });

// ────────────────────────────────────────────────────────────────
// Claim a 1-day trial (one per user, ever).
// ────────────────────────────────────────────────────────────────
export const claimAiPackagesTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ expiresAt: string; alreadyUsed: boolean } | { error: string }> => {
    const { data: existing } = await context.supabase
      .from("ai_package_entitlements")
      .select("expires_at")
      .eq("user_id", context.userId)
      .eq("scope", "trial_24h")
      .maybeSingle();

    if (existing) {
      const exp = (existing as { expires_at: string | null }).expires_at;
      return { expiresAt: exp ?? new Date(0).toISOString(), alreadyUsed: true };
    }

    const { data, error } = await context.supabase.rpc("claim_ai_packages_trial", {
      _user_id: context.userId,
    });
    if (error) return { error: error.message };
    if (!data) return { error: "Could not start trial." };
    return { expiresAt: new Date(data as string).toISOString(), alreadyUsed: false };
  });

// ────────────────────────────────────────────────────────────────
// Shareable client preview link
// ────────────────────────────────────────────────────────────────
function randomToken(len = 24): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, len);
}

export const createPackageShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d, "ai-packages.functions.ts:312"))
  .handler(async ({ data, context }): Promise<{ shareToken: string } | { error: string }> => {
    const { data: existing } = await context.supabase
      .from("ai_packages")
      .select("share_token,user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing || (existing as { user_id: string }).user_id !== context.userId) {
      return { error: "Not found" };
    }
    const current = (existing as { share_token: string | null }).share_token;
    if (current) return { shareToken: current };
    const token = randomToken(24);
    const { error } = await context.supabase
      .from("ai_packages")
      .update({ share_token: token } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) return { error: error.message };
    return { shareToken: token };
  });

export const revokePackageShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => parseInput(z.object({ id: z.string().uuid() }), d, "ai-packages.functions.ts:336"))
  .handler(async ({ data, context }): Promise<{ ok: true } | { error: string }> => {
    const { error } = await context.supabase
      .from("ai_packages")
      .update({ share_token: null } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) return { error: error.message };
    return { ok: true };
  });

export const getPackageByShareToken = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => parseInput(z.object({ token: z.string().min(8).max(64) }), d, "ai-packages.functions.ts:348"))
  .handler(async ({ data }): Promise<{ package: AiPackageRow | null }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const supa = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows } = await (supa as any).rpc("get_shared_ai_package", { p_token: data.token });
    const row = Array.isArray(rows) ? rows[0] : rows;
    // Share links are forwardable: strip the owner's account id and the token.
    const { sanitizePublicShareRow } = await import("@/lib/public-share-sanitize");
    return { package: (row ? sanitizePublicShareRow(row) : null) as AiPackageRow | null };
  });


// ────────────────────────────────────────────────────────────────
// Send a generated package as an RFQ to vendors in a category
// ────────────────────────────────────────────────────────────────
const RFQ_CATEGORIES = [
  "Venue", "Caterer", "Photographer", "Videographer", "Musician/Band", "DJ",
  "Florist", "Baker", "Bartender", "Planner", "Rentals", "Officiant",
  "Transportation", "Hair & Makeup", "Other",
] as const;

export const RFQ_CATEGORIES_LIST = RFQ_CATEGORIES;

function formatPackageForRfq(pkg: AiPackageRow): string {
  const c = pkg.content;
  const lines: string[] = [];
  lines.push(c.title || pkg.title);
  if (c.summary) lines.push("", c.summary);
  if (pkg.guest_count) lines.push("", `Guest count: ${pkg.guest_count}`);
  if (pkg.budget_cents) lines.push(`Budget: $${(pkg.budget_cents / 100).toFixed(0)}`);
  if (c.sections?.length) {
    for (const s of c.sections) {
      lines.push("", s.heading);
      for (const it of s.items) {
        const price = typeof it.price_cents === "number" ? ` — $${(it.price_cents / 100).toFixed(2)}` : "";
        lines.push(`• ${it.name}${it.description ? `: ${it.description}` : ""}${price}`);
      }
    }
  }
  if (c.tiers?.length) {
    lines.push("", "Tiers:");
    for (const t of c.tiers) {
      const price = typeof t.price_cents === "number" ? ` — $${(t.price_cents / 100).toFixed(2)}` : "";
      lines.push(`${t.name}${price}: ${t.includes.join(", ")}`);
    }
  }
  return lines.join("\n").slice(0, 3900);
}

export const previewRfqVendorMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      category: z.enum(RFQ_CATEGORIES),
      location: z.string().max(120).optional(),
    }), d, "ai-packages.functions.ts:404"),
  )
  .handler(async ({ data }): Promise<{ count: number }> => {
    try {
      const { countMatchingVendors } = await import("@/lib/rfq-fanout.server");
      return { count: await countMatchingVendors(data.category, data.location ?? null) };
    } catch (err) {
      console.error("previewRfqVendorMatch failed", err);
      return { count: 0 };
    }
  });

export const createRfqFromPackage = createServerFn({ method: "POST" })

  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      packageId: z.string().uuid(),
      category: z.enum(RFQ_CATEGORIES),
      location: z.string().max(120).optional(),
      eventDate: z.string().optional(),
      vendorCap: z.number().int().min(1).max(25).optional(),
    }), d, "ai-packages.functions.ts:423"),
  )
  .handler(async ({ data, context }): Promise<{ rfqId: string; invitedCount: number } | { error: string }> => {
    // vendorRfq is a Host+ feature per tier-config.ts.
    const { assertMinTier } = await import("@/lib/tier-guards.server");
    try {
      await assertMinTier(context.supabase, context.userId, "host", {
        message: "Requesting vendor quotes is available on Host and Atelier plans.",
      });
    } catch (e) {
      return { error: toUserMessage(e, "Upgrade required.") };
    }

    const { data: pkg, error: e1 } = await context.supabase
      .from("ai_packages")
      .select("id,kind,title,prompt,guest_count,budget_cents,content,attachments,event_id,project_id,created_at,user_id")
      .eq("id", data.packageId)
      .maybeSingle();
    if (e1 || !pkg || (pkg as { user_id: string }).user_id !== context.userId) {
      return { error: "Package not found" };
    }
    const row = pkg as unknown as AiPackageRow & { user_id: string };
    const subject = (row.content.title || row.title || "Package request").slice(0, 117);
    const message = formatPackageForRfq(row);
    const { data: inserted, error } = await context.supabase
      .from("rfq_requests")
      .insert({
        requester_user_id: context.userId,
        subject,
        category: data.category,
        location: data.location ?? null,
        message,
        budget_min: null,
        budget_max: row.budget_cents ? Math.round(row.budget_cents / 100) : null,
        event_date: data.eventDate ?? null,
        guest_count: row.guest_count ?? null,
        status: "open",
      } as never)
      .select("id")
      .single();
    if (error) return { error: error.message };
    const rfqId = (inserted as { id: string }).id;

    // Fan out invitations + emails to matching verified vendors.
    let invitedCount = 0;
    try {
      const { fanOutRfqInvitations } = await import("@/lib/rfq-fanout.server");
      invitedCount = await fanOutRfqInvitations({
        rfqId,
        subject,
        category: data.category,
        location: data.location ?? null,
        eventDate: data.eventDate ?? null,
        guestCount: row.guest_count ?? null,
        budgetMax: row.budget_cents ? Math.round(row.budget_cents / 100) : null,
        brief: message,
        limit: data.vendorCap ?? 10,
      });
    } catch (err) {
      console.error("createRfqFromPackage fanout failed", err);
    }
    return { rfqId, invitedCount };
  });

// ────────────────────────────────────────────────────────────────
// Voice intake — transcribe an uploaded audio clip into brief text
// ────────────────────────────────────────────────────────────────
export const transcribeBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(z.object({
      audioBase64: z.string().min(20).max(6_000_000),
      format: z.enum(["webm", "mp4", "m4a", "wav", "mp3", "ogg"]).default("webm"),
    }), d, "ai-packages.functions.ts:499"),
  )
  .handler(async ({ data, context }): Promise<{ text: string } | { error: string }> => {
    await assertNotDemo("generate");
    const { data: allowed } = await context.supabase.rpc("has_ai_packages_access", {
      _user_id: context.userId,
    });
    if (!allowed) return { error: "Voice intake is available on the Atelier plan." };
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { error: "AI service is not configured" };
    const mime = data.format === "mp3" ? "audio/mpeg" : `audio/${data.format}`;
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Transcribe this audio verbatim into a single paragraph suitable as an event-planning brief. Return only the transcript text — no labels, no quotes." },
                { type: "file", file: { filename: `brief.${data.format}`, file_data: `data:${mime};base64,${data.audioBase64}` } },
              ],
            },
          ],
          max_tokens: 1024,
          temperature: 0.2,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return { error: `Transcription failed (${res.status}): ${t.slice(0, 160)}` };
      }
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const text = body.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) return { error: "Couldn't hear that — try again." };
      return { text };
    } catch (err) {
      return { error: toUserMessage(err, "Transcription failed") };
    }
  });
